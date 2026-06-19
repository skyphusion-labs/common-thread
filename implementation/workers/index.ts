/**
 * Common Thread Worker entry point.
 *
 * Uses Hyperdrive (MySQL) for relational storage. See implementation/db.ts.
 */

import { ManifestStore } from '../archive/manifest';
import { ManifestSigner } from '../archive/signing';
import { execute, query, queryOne, resolveDatabase } from '../db';
import type { InvestigationRow } from '../schema/db-types';
import {
  accessErrorStatus,
  authorizeInvestigation,
  generateAccessToken,
  hashAccessToken,
  InvestigationAccessError,
  publicInvestigationView,
} from '../investigations/access';
import {
  ingestApifyTwitter,
  TWITTER_ACCOUNT_EXTRACTORS,
  TWITTER_PAIR_EXTRACTORS,
} from '../ingest/apify-ingest';
import { resolveAttributionCredentials, parseAllowedGatewayHosts } from '../reasoner/credentials';
import { runAttribution } from '../reasoner/runner';
import { listAttributionRuns, getAttributionRun } from '../attribution/query';
import {
  parseFeaturesQueryParams,
  queryInvestigationFeatures,
} from '../features/query';
import { buildEvidencePacket } from '../reporting/evidence-packet';
import { packetDocumentTitle, packetMarkdownToHtml } from '../reporting/packet-html';
import { dispatchPdfRender, vpcPdfEnabled } from '../reporting/pdf-dispatch';
import {
  assertBrowserOriginAllowed,
  corsPreflightResponse,
  withCors,
} from './cors';
import {
  HOSTED_API_CONTACT_EMAIL,
  HOSTED_API_CONTACT_NOTICE,
} from './contact';

export interface Env {
  DB: Hyperdrive;
  ARCHIVE: R2Bucket;
  ENVIRONMENT: string;
  TRIAGE_MODEL?: string;
  REASONING_MODEL?: string;
  AI_GATEWAY_URL?: string;
  ANTHROPIC_API_KEY?: string;
  /** Comma-separated hostnames allowed for AI Gateway URLs (BYOK + server secret). */
  AI_GATEWAY_ALLOWED_HOSTS?: string;
  SIGNER_PUBLIC_KEY?: string;
  INVESTIGATION_NAMESPACE?: string;
  /** Comma-separated browser origins permitted to call the API (empty = browser blocked). */
  CORS_ALLOWED_ORIGINS?: string;
  /** Workers VPC binding to the self-hosted extraction container. */
  VPC_INGEST?: Fetcher;
  /** Full URL for VPC_INGEST.fetch(), e.g. http://common-thread-ingest.internal/trigger */
  INGEST_WORKER_URL?: string;
  INGEST_SECRET?: string;
  /** Workers VPC binding to the PDF/A renderer (common-thread-pdf / json-pdf). */
  VPC_PDF?: Fetcher;
  /** PDF/A renderer on VPC, e.g. http://json-pdf:8081/render */
  PDF_WORKER_URL?: string;
  /** Required for `?format=pdf` packet export (wrangler secret put PDF_SECRET). */
  PDF_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const preflight = corsPreflightResponse(request, env);
      if (preflight) return preflight;

      const corsDenied = assertBrowserOriginAllowed(request, env);
      if (corsDenied) return corsDenied;

      const response = await handle(request, env);
      return withCors(response, request, env);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return withCors(jsonResponse({ error: message }, 500), request, env);
    }
  },
};

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;

  // Health check
  if (method === 'GET' && path === '/') {
    const body: Record<string, unknown> = {
      name: 'common-thread',
      version: '0.1.0',
      environment: env.ENVIRONMENT,
      status: 'ok',
    };
    if (env.ENVIRONMENT === 'production') {
      body.hosted_api_notice = HOSTED_API_CONTACT_NOTICE;
      body.contact = HOSTED_API_CONTACT_EMAIL;
    }
    return jsonResponse(body);
  }

  // Investigations are capability-gated; there is no public listing.
  if (method === 'GET' && path === '/investigations') {
    return jsonResponse(
      {
        error:
          'Investigation listing is not available. Create an investigation (POST /investigations) and retain the access_token returned once.',
        code: 'listing_disabled',
      },
      404
    );
  }

  // Create investigation (returns capability token once)
  if (method === 'POST' && path === '/investigations') {
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      description?: string;
    };

    if (!body.id || !body.name) {
      return jsonResponse({ error: 'id and name are required' }, 400);
    }

    const now = new Date().toISOString();
    const accessToken = generateAccessToken();
    const accessTokenHash = await hashAccessToken(accessToken);

    await execute(
      env.DB,
      `INSERT INTO investigations (
         id, name, description, status, created_at, updated_at, access_token_hash
       ) VALUES (?, ?, ?, 'active', ?, ?, ?)`,
      [body.id, body.name, body.description ?? null, now, now, accessTokenHash]
    );

    return jsonResponse(
      {
        id: body.id,
        name: body.name,
        description: body.description,
        status: 'active',
        created_at: now,
        access_token: accessToken,
        access_notice:
          'Store access_token securely. It is shown only at creation and cannot be recovered.',
      },
      201
    );
  }

  // Get investigation metadata (requires capability token)
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+$/)) {
    const match = path.match(/^\/investigations\/([^/]+)$/);
    const investigationId = match ? match[1] : '';
    const auth = await authorizeOrRespond(env, request, url, investigationId);
    if (auth instanceof Response) return auth;
    return jsonResponse({ investigation: publicInvestigationView(auth) });
  }

  // Seal investigation — read-only thereafter (requires capability token)
  if (method === 'POST' && path.match(/^\/investigations\/[^/]+\/seal$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/seal$/);
    const investigationId = match ? match[1] : '';
    const auth = await authorizeOrRespond(env, request, url, investigationId, true);
    if (auth instanceof Response) return auth;

    if (auth.status === 'sealed') {
      return jsonResponse({
        investigation: publicInvestigationView(auth),
        message: 'Investigation is already sealed (read-only).',
      });
    }

    const now = new Date().toISOString();
    await execute(
      env.DB,
      `UPDATE investigations SET status = 'sealed', updated_at = ? WHERE id = ?`,
      [now, investigationId]
    );

    return jsonResponse({
      investigation: {
        ...publicInvestigationView(auth),
        status: 'sealed',
        updated_at: now,
      },
      message:
        'Investigation sealed. Data remains readable with the access token; ingest and attribution are disabled.',
    });
  }

  // List seed accounts
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+\/seeds$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/seeds$/);
    const investigationId = match ? match[1] : '';
    const auth = await authorizeOrRespond(env, request, url, investigationId);
    if (auth instanceof Response) return auth;
    const includeRemoved = url.searchParams.get('includeRemoved') === 'true';

    const rows = await query(
      env.DB,
      `SELECT * FROM seed_accounts 
       WHERE investigation_id = ?
         ${includeRemoved ? '' : 'AND removed_at IS NULL'}
       ORDER BY added_at DESC`,
      [investigationId]
    );

    return jsonResponse({ investigationId, seeds: rows, count: rows.length });
  }

  // Summary
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+\/summary$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/summary$/);
    const investigationId = match ? match[1] : '';
    const auth = await authorizeOrRespond(env, request, url, investigationId);
    if (auth instanceof Response) return auth;

    const seedResult = await queryOne<{ count: number }>(
      env.DB,
      `SELECT COUNT(*) as count FROM seed_accounts
       WHERE investigation_id = ? AND removed_at IS NULL`,
      [investigationId]
    );

    const manifest = new ManifestStore({ bucket: env.ARCHIVE });
    const artifacts = await manifest.list({ investigationId });

    return jsonResponse({
      investigationId,
      seeds: seedResult?.count ?? 0,
      artifacts: artifacts.length,
    });
  }

  // List manifest entries
  if (method === 'GET' && path === '/manifest') {
    const investigationId = url.searchParams.get('investigation');
    if (investigationId) {
      const auth = await authorizeOrRespond(env, request, url, investigationId);
      if (auth instanceof Response) return auth;
    }
    const entries = await new ManifestStore({ bucket: env.ARCHIVE }).list(
      investigationId ? { investigationId } : undefined
    );
    return jsonResponse({ entries, count: entries.length });
  }

  // List signatures
  if (method === 'GET' && path === '/signatures') {
    const signatures = await new ManifestSigner({ bucket: env.ARCHIVE }).listSignatures();
    return jsonResponse({ signatures, count: signatures.length });
  }

  // Verify signatures
  if (method === 'GET' && path === '/verify') {
    const results = await new ManifestSigner({ bucket: env.ARCHIVE }).verifyAll();
    const validCount = results.filter((r) => r.valid).length;

    return jsonResponse({
      totalSignatures: results.length,
      validSignatures: validCount,
      allValid: results.length > 0 && validCount === results.length,
    });
  }

  // === DEBUG: Ingest / Extractor visibility ===
  if (method === 'GET' && path.match(/^\/debug\/ingest$/)) {
    const investigationId = url.searchParams.get('investigation');
    if (!investigationId) return jsonResponse({ error: 'Missing ?investigation= parameter' }, 400);
    const auth = await authorizeOrRespond(env, request, url, investigationId);
    if (auth instanceof Response) return auth;

    const manifest = new ManifestStore({ bucket: env.ARCHIVE });
    const allEntries = await manifest.list({ investigationId });
    const entriesWithAccount = allEntries.filter((e) => e.account);

    const accountVisibility: Record<string, any> = {};
    const pairVisibility: Record<string, any> = {};

    for (const ex of TWITTER_ACCOUNT_EXTRACTORS) {
      const matching = entriesWithAccount.filter((e) => {
        try { return ex.filterEntry?.(e) ?? false; } catch { return false; }
      });
      accountVisibility[ex.name] = { count: matching.length };
    }

    for (const ex of TWITTER_PAIR_EXTRACTORS) {
      pairVisibility[ex.name] = { count: entriesWithAccount.length };
    }

    return jsonResponse({
      investigationId,
      totalEntries: allEntries.length,
      entriesWithAccount: entriesWithAccount.length,
      entriesWithoutAccount: allEntries.length - entriesWithAccount.length,
      sampleEntry: entriesWithAccount[0] || null,
      extractorVisibility: { account: accountVisibility, pair: pairVisibility },
    });
  }

  // === DEBUG: Raw manifest inspection ===
  if (method === 'GET' && path.match(/^\/debug\/manifest$/)) {
    const investigationId = url.searchParams.get('investigation');
    if (!investigationId) return jsonResponse({ error: 'Missing ?investigation= parameter' }, 400);
    const auth = await authorizeOrRespond(env, request, url, investigationId);
    if (auth instanceof Response) return auth;

    const entries = await new ManifestStore({ bucket: env.ARCHIVE }).list({ investigationId });
    const withAccount = entries.filter((e) => e.account);
    const withoutAccount = entries.filter((e) => !e.account);

    return jsonResponse({
      investigationId,
      total: entries.length,
      withAccount: withAccount.length,
      withoutAccount: withoutAccount.length,
      sampleWithAccount: withAccount.slice(0, 3),
      sampleWithoutAccount: withoutAccount.slice(0, 3),
    });
  }

  // Add seed account
  if (method === 'POST' && path.match(/^\/investigations\/[^/]+\/seeds$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/seeds$/);
    const investigationId = match ? match[1] : '';
    const auth = await authorizeOrRespond(env, request, url, investigationId, true);
    if (auth instanceof Response) return auth;

    const body = (await request.json()) as {
      platform?: string;
      account?: string;
      basis_statement?: string;
      basisStatement?: string;
      is_control?: boolean;
      added_by?: string;
    };

    if (!body.account || !body.platform) {
      return jsonResponse({ error: 'platform and account are required' }, 400);
    }

    const now = new Date().toISOString();
    const basis = body.basis_statement ?? body.basisStatement ?? 'Added via API';
    const isControl = body.is_control ? 1 : 0;

    await execute(
      env.DB,
      `INSERT INTO seed_accounts (
         investigation_id, platform, account_identifier, basis_statement,
         added_at, added_by, is_control
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        investigationId,
        body.platform,
        body.account,
        basis,
        now,
        body.added_by ?? 'api',
        isControl,
      ]
    );

    return jsonResponse(
      {
        investigationId,
        platform: body.platform,
        account: body.account,
        is_control: Boolean(isControl),
        added_at: now,
      },
      201
    );
  }

  // Soft-delete seed account (§5.1 — preserves row for audit trail)
  if (method === 'DELETE' && path.match(/^\/investigations\/[^/]+\/seeds$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/seeds$/);
    const investigationId = match ? match[1] : '';
    const auth = await authorizeOrRespond(env, request, url, investigationId, true);
    if (auth instanceof Response) return auth;

    const body = (await request.json()) as {
      platform?: string;
      account?: string;
      removed_reason?: string;
      removedReason?: string;
    };

    if (!body.account || !body.platform) {
      return jsonResponse({ error: 'platform and account are required' }, 400);
    }

    const active = await queryOne<{ count: number }>(
      env.DB,
      `SELECT COUNT(*) AS count FROM seed_accounts
       WHERE investigation_id = ?
         AND platform = ?
         AND account_identifier = ?
         AND removed_at IS NULL`,
      [investigationId, body.platform, body.account]
    );
    if (!active?.count) {
      return jsonResponse(
        {
          error: `Active seed not found: ${body.platform}:${body.account}`,
        },
        404
      );
    }

    const now = new Date().toISOString();
    const reason =
      body.removed_reason ?? body.removedReason ?? 'Removed via API';

    const db = resolveDatabase(env.DB);
    const result = await db
      .prepare(
        `UPDATE seed_accounts
         SET removed_at = ?, removed_reason = ?
         WHERE investigation_id = ?
           AND platform = ?
           AND account_identifier = ?
           AND removed_at IS NULL`
      )
      .bind(now, reason, investigationId, body.platform, body.account)
      .run();

    return jsonResponse({
      investigationId,
      platform: body.platform,
      account: body.account,
      removed_at: now,
      removed_reason: reason,
      removed_count: result.meta.changes,
    });
  }

  // Investigation features (§6.3)
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+\/features$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/features$/);
    const investigationId = match ? match[1] : '';
    const auth = await authorizeOrRespond(env, request, url, investigationId);
    if (auth instanceof Response) return auth;

    const parsed = parseFeaturesQueryParams(investigationId, url.searchParams);
    if ('error' in parsed) {
      return jsonResponse({ error: parsed.error }, 400);
    }

    const result = await queryInvestigationFeatures(env.DB, parsed);
    return jsonResponse(result);
  }

  // Run attribution
  if (method === 'POST' && path.match(/^\/investigations\/[^/]+\/attribute$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/attribute$/);
    const investigationId = match ? match[1] : '';
    const auth = await authorizeOrRespond(env, request, url, investigationId, true);
    if (auth instanceof Response) return auth;

    let body: Record<string, unknown> = {};
    if (request.headers.get('content-type')?.includes('application/json')) {
      try {
        body = (await request.json()) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }

    const credentials = resolveAttributionCredentials({
      envAiGatewayUrl: env.AI_GATEWAY_URL,
      envAnthropicApiKey: env.ANTHROPIC_API_KEY,
      requestHeaders: request.headers,
      body,
      allowedGatewayHosts: parseAllowedGatewayHosts(env.AI_GATEWAY_ALLOWED_HOSTS),
    });
    if ('error' in credentials) {
      return jsonResponse({ error: credentials.error }, 503);
    }

    const accountFilterParam = url.searchParams.get('accountFilter');
    const accountFilter =
      (Array.isArray(body.account_filter) ? (body.account_filter as string[]) : undefined) ??
      (Array.isArray(body.accountFilter) ? (body.accountFilter as string[]) : undefined) ??
      (accountFilterParam ? accountFilterParam.split(',').map(s => s.trim()).filter(Boolean) : undefined);

    const skipTriage =
      url.searchParams.get('skipTriage') === 'true' || body.skipTriage === true;

    const maxRetriesRaw = body.maxRetries ?? body.max_retries;
    const maxRetries =
      typeof maxRetriesRaw === 'number' ? maxRetriesRaw : undefined;

    const randomizationSeed =
      typeof body.randomizationSeed === 'string'
        ? body.randomizationSeed
        : typeof body.randomization_seed === 'string'
          ? body.randomization_seed
          : undefined;

    const db = resolveDatabase(env.DB);
    const summaries = await runAttribution(
      {
        DB: db,
        ARCHIVE: env.ARCHIVE,
        AI_GATEWAY_URL: credentials.aiGatewayUrl,
        ANTHROPIC_API_KEY: credentials.anthropicApiKey,
        TRIAGE_MODEL: env.TRIAGE_MODEL ?? 'claude-haiku-4-5',
        REASONING_MODEL: env.REASONING_MODEL ?? 'claude-opus-4-8',
      },
      {
        investigationId,
        accountFilter,
        skipTriage,
        maxRetries,
        randomizationSeed,
      }
    );

    return jsonResponse({
      investigationId,
      pair_count: summaries.length,
      credential_source: credentials.source,
      runs: summaries,
    });
  }

  // List attribution runs (canonical + legacy path)
  if (
    method === 'GET' &&
    (path.match(/^\/investigations\/[^/]+\/runs$/) ||
      path.match(/^\/investigations\/[^/]+\/attribution-runs$/))
  ) {
    const match =
      path.match(/^\/investigations\/([^/]+)\/runs$/) ??
      path.match(/^\/investigations\/([^/]+)\/attribution-runs$/);
    const investigationId = match ? match[1] : '';
    const auth = await authorizeOrRespond(env, request, url, investigationId);
    if (auth instanceof Response) return auth;

    const rows = await listAttributionRuns(env.DB, investigationId);
    return jsonResponse({ investigationId, runs: rows, count: rows.length });
  }

  // Single attribution run with full output
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+\/runs\/[^/]+$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/runs\/([^/]+)$/);
    const investigationId = match ? match[1] : '';
    const runId = match ? Number(match[2]) : NaN;

    if (!Number.isInteger(runId) || runId < 1) {
      return jsonResponse({ error: 'run_id must be a positive integer' }, 400);
    }

    const auth = await authorizeOrRespond(env, request, url, investigationId);
    if (auth instanceof Response) return auth;

    const run = await getAttributionRun(env.DB, investigationId, runId);
    if (!run) {
      return jsonResponse({ error: `Attribution run not found: ${runId}` }, 404);
    }

    return jsonResponse({ investigationId, run });
  }

  // Evidence packet for an attribution run (§8.1)
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+\/packet\/[^/]+$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/packet\/([^/]+)$/);
    const investigationId = match ? match[1] : '';
    const runId = match ? Number(match[2]) : NaN;

    if (!Number.isInteger(runId) || runId < 1) {
      return jsonResponse({ error: 'run_id must be a positive integer' }, 400);
    }

    const auth = await authorizeOrRespond(env, request, url, investigationId);
    if (auth instanceof Response) return auth;

    const packet = await buildEvidencePacket(env.DB, env.ARCHIVE, investigationId, runId);
    if (!packet) {
      return jsonResponse({ error: `Attribution run not found: ${runId}` }, 404);
    }

    if (url.searchParams.get('format') === 'markdown') {
      return new Response(packet.markdown + '\n', {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    }

    if (url.searchParams.get('format') === 'pdf') {
      if (!vpcPdfEnabled(env)) {
        return jsonResponse(
          {
            error: 'PDF rendering requires VPC_PDF, PDF_WORKER_URL, and PDF_SECRET',
            hint: 'Set PDF_SECRET via wrangler secret put PDF_SECRET and deploy containers/pdf-worker',
          },
          503
        );
      }

      const title = packetDocumentTitle(investigationId, runId);
      const html = await packetMarkdownToHtml(packet.markdown, title);
      const pdfResponse = await dispatchPdfRender(env, {
        investigationId,
        attributionRunId: runId,
        html,
        pdfaProfile: '2b',
      });

      if (!pdfResponse.ok) {
        const detail = await pdfResponse.text();
        return jsonResponse(
          {
            error: 'PDF renderer failed',
            status: pdfResponse.status,
            detail: detail.slice(0, 2000),
          },
          502
        );
      }

      const pdfBytes = await pdfResponse.arrayBuffer();
      const filename = `common-thread-${investigationId}-run-${runId}.pdf`;
      return new Response(pdfBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'X-PDF-A-Profile': '2b',
        },
      });
    }

    return jsonResponse(packet);
  }

  // === Apify Twitter ingest ===
  if (method === 'POST' && path.match(/^\/investigations\/[^/]+\/ingest\/apify-twitter$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/ingest\/apify-twitter$/);
    const investigationId = match ? match[1] : '';

    if (!investigationId) return jsonResponse({ error: 'Invalid investigation ID' }, 400);

    const auth = await authorizeOrRespond(env, request, url, investigationId, true);
    if (auth instanceof Response) return auth;

    const contentType = request.headers.get('content-type') || '';
    let allItems: any[] = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const fileEntries = formData.getAll('file');

      for (const entry of fileEntries) {
        if (entry && typeof entry !== 'string' && 'text' in entry) {
          try {
            const text = await (entry as File).text();
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) allItems.push(...parsed);
            else if (Array.isArray(parsed?.items)) allItems.push(...parsed.items);
            else if (Array.isArray(parsed?.data)) allItems.push(...parsed.data);
            else allItems.push(parsed);
          } catch {
            return jsonResponse({ error: 'Invalid JSON in uploaded file' }, 400);
          }
        }
      }

      if (allItems.length === 0) return jsonResponse({ error: 'No valid files uploaded' }, 400);
    } else {
      const body = await request.json() as any;
      allItems = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : Array.isArray(body?.data) ? body.data : [body];
    }

    const result = await ingestApifyTwitter(
      env,
      investigationId,
      allItems
    );

    const status = result.delegatedToContainer ? 202 : 200;
    return jsonResponse(result, status);
  }

  // Ingest job status
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+\/ingest-jobs\/[^/]+$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/ingest-jobs\/([^/]+)$/);
    const investigationId = match ? match[1] : '';
    const jobId = match ? match[2] : '';

    const auth = await authorizeOrRespond(env, request, url, investigationId);
    if (auth instanceof Response) return auth;

    const row = await queryOne(
      env.DB,
      `SELECT job_id, investigation_id, provider, status, item_count,
              manifest_hashes, raw_file_hashes, container_name,
              started_at, completed_at, error_message, created_at
       FROM ingest_jobs
       WHERE job_id = ? AND investigation_id = ?`,
      [jobId, investigationId]
    );

    if (!row) {
      return jsonResponse({ error: `Ingest job not found: ${jobId}` }, 404);
    }

    return jsonResponse({ job: row });
  }

  return jsonResponse({ error: `Not found: ${method} ${path}` }, 404);
}

async function authorizeOrRespond(
  env: Env,
  request: Request,
  url: URL,
  investigationId: string,
  requireWrite = false
): Promise<InvestigationRow | Response> {
  try {
    return await authorizeInvestigation(env.DB, request, url, investigationId, {
      requireWrite,
    });
  } catch (err) {
    if (err instanceof InvestigationAccessError) {
      return jsonResponse({ error: err.message, code: err.code }, accessErrorStatus(err.code));
    }
    throw err;
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

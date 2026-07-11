/**
 * Common Thread Worker entry point.
 *
 * Uses Hyperdrive (MySQL) for relational storage. See implementation/db.ts.
 *
 * Routing (issue #75): requests dispatch through a single ROUTES table walked
 * once, rather than a linear chain of `if (method && path.match(...))` blocks.
 * Each route declares its method, an anchored pattern (capture groups become
 * `ctx.params`), an optional handler, and an optional `auth` funnel. When
 * `auth` is present the dispatcher resolves the investigation id (from the
 * first capture group, or from the `?investigation=` query for the manifest/
 * signature/verify/debug routes) and runs `authorizeOrRespond` before the
 * handler, exactly as the old inline blocks did. Routes that must validate
 * input before authorizing (single run, packet: `run_id` is 400-checked ahead
 * of the token check) omit `auth` and call `authorizeOrRespond` themselves, so
 * the original ordering of status codes is preserved.
 */

import { ManifestStore } from '../archive/manifest';
// Durable Object that serializes manifest appends per investigation (issue #70).
// Must be exported from the Worker entrypoint so wrangler can bind the class.
export { ManifestCoordinator } from '../archive/manifest-coordinator';
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
// Single source of truth for the version (issue #43); resolveJsonModule inlines
// this at build time, matching the evidence packet (#32).
import pkg from '../../package.json';
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
  /** Optional Durable Object namespace that serializes manifest appends per
   * investigation (issue #70). When bound, ManifestStore routes appends here to
   * close the last-write-wins race; when absent, appends fall back to inline. */
  MANIFEST_COORDINATOR?: DurableObjectNamespace;
  ENVIRONMENT: string;
  TRIAGE_MODEL?: string;
  REASONING_MODEL?: string;
  AI_GATEWAY_URL?: string;
  ANTHROPIC_API_KEY?: string;
  /** Comma-separated hostnames allowed for AI Gateway URLs (BYOK + server secret). */
  AI_GATEWAY_ALLOWED_HOSTS?: string;
  SIGNER_PUBLIC_KEY?: string;
  /** In-Worker Ed25519 signing key (base64 seed) for detached evidence-packet
   * signing (§8.1.3). Optional: when unset, packets export unsigned. Provide
   * via `wrangler secret put SIGNER_PRIVATE_KEY`, never a tracked file. */
  SIGNER_PRIVATE_KEY?: string;
  /** Optional signer identity recorded in packet signatures (the named
   * practitioner, §8.1.3). */
  SIGNER_ID?: string;
  INVESTIGATION_NAMESPACE?: string;
  /** Comma-separated browser origins permitted to call the API (empty = browser blocked). */
  CORS_ALLOWED_ORIGINS?: string;
  /** Workers VPC binding to the self-hosted extraction container. */
  VPC_INGEST?: Fetcher;
  /** Full URL for VPC_INGEST.fetch(), e.g. http://common-thread-ingest.internal/trigger */
  INGEST_WORKER_URL?: string;
  /** Required when delegating ingest to the VPC container (wrangler secret put INGEST_SECRET). */
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
      // Log the detail server-side; never return raw error strings (which can
      // carry SQL/driver internals) to clients on a public API (#67).
      console.error('Unhandled error in worker fetch:', err);
      return withCors(
        jsonResponse({ error: 'Internal server error', code: 'internal_error' }, 500),
        request,
        env
      );
    }
  },
};

// ---------------------------------------------------------------------------
// Route table + dispatcher (issue #75)
// ---------------------------------------------------------------------------

/** Per-request context handed to every route handler. */
interface RouteContext {
  env: Env;
  request: Request;
  url: URL;
  /** Regex capture groups from the matched pattern, in order. */
  params: string[];
  /**
   * Investigation id resolved by the dispatcher for authed routes (from a
   * capture group or the `?investigation=` query). Empty string for routes
   * without an `auth` funnel; those handlers derive their own id from params.
   */
  investigationId: string;
  /** Authorized investigation row, set only when the route declares `auth`. */
  auth?: InvestigationRow;
}

type RouteHandler = (ctx: RouteContext) => Promise<Response> | Response;

interface AuthConfig {
  /** Require a write-capable token (mutating routes). Default false. */
  requireWrite?: boolean;
  /**
   * Where the investigation id comes from. 'param' (default) reads capture
   * group `idParamIndex` (default 0); 'query' reads `?investigation=` and
   * returns the standard 400 when it is missing.
   */
  idFrom?: 'param' | 'query';
  idParamIndex?: number;
}

interface Route {
  method: string;
  /** Anchored pattern; capture groups surface as ctx.params. */
  pattern: RegExp;
  /** When present, the dispatcher authorizes before invoking the handler. */
  auth?: AuthConfig;
  handler: RouteHandler;
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;

  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const m = route.pattern.exec(path);
    if (!m) continue;

    const ctx: RouteContext = {
      env,
      request,
      url,
      params: m.slice(1),
      investigationId: '',
    };

    if (route.auth) {
      if (route.auth.idFrom === 'query') {
        const q = url.searchParams.get('investigation');
        if (!q) {
          return jsonResponse({ error: 'Missing ?investigation= parameter' }, 400);
        }
        ctx.investigationId = q;
      } else {
        ctx.investigationId = ctx.params[route.auth.idParamIndex ?? 0] ?? '';
      }

      const authed = await authorizeOrRespond(
        env,
        request,
        url,
        ctx.investigationId,
        route.auth.requireWrite ?? false
      );
      if (authed instanceof Response) return authed;
      ctx.auth = authed;
    }

    return route.handler(ctx);
  }

  return jsonResponse({ error: `Not found: ${method} ${path}` }, 404);
}

const ROUTES: Route[] = [
  // Health check
  { method: 'GET', pattern: /^\/$/, handler: handleHealth },

  // Investigations are capability-gated; there is no public listing.
  { method: 'GET', pattern: /^\/investigations$/, handler: handleListingDisabled },

  // Create investigation (returns capability token once)
  { method: 'POST', pattern: /^\/investigations$/, handler: handleCreateInvestigation },

  // Get investigation metadata (requires capability token)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)$/, auth: {}, handler: handleGetInvestigation },

  // Seal investigation (read-only thereafter; requires capability token)
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/seal$/, auth: { requireWrite: true }, handler: handleSeal },

  // List seed accounts
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/seeds$/, auth: {}, handler: handleListSeeds },

  // Summary
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/summary$/, auth: {}, handler: handleSummary },

  // List manifest entries (requires capability token and investigation scope)
  { method: 'GET', pattern: /^\/manifest$/, auth: { idFrom: 'query' }, handler: handleListManifest },

  // List signatures for one investigation's manifest
  { method: 'GET', pattern: /^\/signatures$/, auth: { idFrom: 'query' }, handler: handleListSignatures },

  // Verify signatures for one investigation's manifest
  { method: 'GET', pattern: /^\/verify$/, auth: { idFrom: 'query' }, handler: handleVerify },

  // === DEBUG: Ingest / Extractor visibility ===
  { method: 'GET', pattern: /^\/debug\/ingest$/, auth: { idFrom: 'query' }, handler: handleDebugIngest },

  // === DEBUG: Raw manifest inspection ===
  { method: 'GET', pattern: /^\/debug\/manifest$/, auth: { idFrom: 'query' }, handler: handleDebugManifest },

  // Add seed account
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/seeds$/, auth: { requireWrite: true }, handler: handleAddSeed },

  // Soft-delete seed account (§5.1; preserves row for audit trail)
  { method: 'DELETE', pattern: /^\/investigations\/([^/]+)\/seeds$/, auth: { requireWrite: true }, handler: handleDeleteSeed },

  // Investigation features (§6.3)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/features$/, auth: {}, handler: handleFeatures },

  // Run attribution
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/attribute$/, auth: { requireWrite: true }, handler: handleAttribute },

  // List attribution runs (canonical + legacy path)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/(?:runs|attribution-runs)$/, auth: {}, handler: handleListRuns },

  // Single attribution run with full output (validates run_id before auth)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/runs\/([^/]+)$/, handler: handleSingleRun },

  // Evidence packet for an attribution run (§8.1; validates run_id before auth)
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/packet\/([^/]+)$/, handler: handlePacket },

  // === Apify Twitter ingest ===
  { method: 'POST', pattern: /^\/investigations\/([^/]+)\/ingest\/apify-twitter$/, auth: { requireWrite: true }, handler: handleIngestApify },

  // Ingest job status
  { method: 'GET', pattern: /^\/investigations\/([^/]+)\/ingest-jobs\/([^/]+)$/, auth: {}, handler: handleIngestJobStatus },
];

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handleHealth(ctx: RouteContext): Response {
  const { env } = ctx;
  const body: Record<string, unknown> = {
    name: 'common-thread',
    version: pkg.version,
    environment: env.ENVIRONMENT,
    status: 'ok',
  };
  if (env.ENVIRONMENT === 'production') {
    body.hosted_api_notice = HOSTED_API_CONTACT_NOTICE;
    body.contact = HOSTED_API_CONTACT_EMAIL;
  }
  return jsonResponse(body);
}

function handleListingDisabled(): Response {
  return jsonResponse(
    {
      error:
        'Investigation listing is not available. Create an investigation (POST /investigations) and retain the access_token returned once.',
      code: 'listing_disabled',
    },
    404
  );
}

async function handleCreateInvestigation(ctx: RouteContext): Promise<Response> {
  const { env, request } = ctx;
  const body = await parseJsonBody<{
    id?: string;
    name?: string;
    description?: string;
  }>(request);
  if (body instanceof Response) return body;

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

function handleGetInvestigation(ctx: RouteContext): Response {
  return jsonResponse({ investigation: publicInvestigationView(ctx.auth!) });
}

async function handleSeal(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const auth = ctx.auth!;
  const investigationId = ctx.investigationId;

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

async function handleListSeeds(ctx: RouteContext): Promise<Response> {
  const { env, url } = ctx;
  const investigationId = ctx.investigationId;
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

async function handleSummary(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;

  const seedResult = await queryOne<{ count: number }>(
    env.DB,
    `SELECT COUNT(*) as count FROM seed_accounts
     WHERE investigation_id = ? AND removed_at IS NULL`,
    [investigationId]
  );

  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId });
  const artifacts = await manifest.list();

  return jsonResponse({
    investigationId,
    seeds: seedResult?.count ?? 0,
    artifacts: artifacts.length,
  });
}

async function handleListManifest(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;
  const entries = await new ManifestStore({
    bucket: env.ARCHIVE,
    investigationId,
  }).list();
  return jsonResponse({ investigationId, entries, count: entries.length });
}

async function handleListSignatures(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;
  const signatures = await new ManifestSigner({
    bucket: env.ARCHIVE,
    investigationId,
  }).listSignatures();
  return jsonResponse({ investigationId, signatures, count: signatures.length });
}

async function handleVerify(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;
  const results = await new ManifestSigner({
    bucket: env.ARCHIVE,
    investigationId,
  }).verifyAll();
  const validCount = results.filter((r) => r.valid).length;

  return jsonResponse({
    investigationId,
    totalSignatures: results.length,
    validSignatures: validCount,
    allValid: results.length > 0 && validCount === results.length,
  });
}

async function handleDebugIngest(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;

  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId });
  const allEntries = await manifest.list();
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

async function handleDebugManifest(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;

  const entries = await new ManifestStore({
    bucket: env.ARCHIVE,
    investigationId,
  }).list();
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

async function handleAddSeed(ctx: RouteContext): Promise<Response> {
  const { env, request } = ctx;
  const investigationId = ctx.investigationId;

  const body = await parseJsonBody<{
    platform?: string;
    account?: string;
    basis_statement?: string;
    basisStatement?: string;
    is_control?: boolean;
    added_by?: string;
  }>(request);
  if (body instanceof Response) return body;

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

async function handleDeleteSeed(ctx: RouteContext): Promise<Response> {
  const { env, request } = ctx;
  const investigationId = ctx.investigationId;

  const body = await parseJsonBody<{
    platform?: string;
    account?: string;
    removed_reason?: string;
    removedReason?: string;
  }>(request);
  if (body instanceof Response) return body;

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

async function handleFeatures(ctx: RouteContext): Promise<Response> {
  const { env, url } = ctx;
  const investigationId = ctx.investigationId;

  const parsed = parseFeaturesQueryParams(investigationId, url.searchParams);
  if ('error' in parsed) {
    return jsonResponse({ error: parsed.error }, 400);
  }

  const result = await queryInvestigationFeatures(env.DB, parsed);
  return jsonResponse(result);
}

async function handleAttribute(ctx: RouteContext): Promise<Response> {
  const { env, request, url } = ctx;
  const investigationId = ctx.investigationId;

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

async function handleListRuns(ctx: RouteContext): Promise<Response> {
  const { env } = ctx;
  const investigationId = ctx.investigationId;
  const rows = await listAttributionRuns(env.DB, investigationId);
  return jsonResponse({ investigationId, runs: rows, count: rows.length });
}

async function handleSingleRun(ctx: RouteContext): Promise<Response> {
  const { env, request, url, params } = ctx;
  const investigationId = params[0] ?? '';
  const runId = Number(params[1]);

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

async function handlePacket(ctx: RouteContext): Promise<Response> {
  const { env, request, url, params } = ctx;
  const investigationId = params[0] ?? '';
  const runId = Number(params[1]);

  if (!Number.isInteger(runId) || runId < 1) {
    return jsonResponse({ error: 'run_id must be a positive integer' }, 400);
  }

  const auth = await authorizeOrRespond(env, request, url, investigationId);
  if (auth instanceof Response) return auth;

  const packet = await buildEvidencePacket(
    env.DB,
    env.ARCHIVE,
    investigationId,
    runId,
    env.SIGNER_PRIVATE_KEY
      ? { privateKey: env.SIGNER_PRIVATE_KEY, signerId: env.SIGNER_ID }
      : undefined
  );
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

async function handleIngestApify(ctx: RouteContext): Promise<Response> {
  const { env, request } = ctx;
  const investigationId = ctx.investigationId;

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
    const parsedBody = await parseJsonBody<unknown>(request);
    if (parsedBody instanceof Response) return parsedBody;
    const body = parsedBody as any;
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

async function handleIngestJobStatus(ctx: RouteContext): Promise<Response> {
  const { env, params } = ctx;
  const investigationId = ctx.investigationId;
  const jobId = params[1] ?? '';

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

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

/**
 * Parse a JSON request body, returning a 400 with a typed error code rather
 * than letting a malformed body bubble up as a generic 500 (#67).
 */
async function parseJsonBody<T>(request: Request): Promise<T | Response> {
  try {
    return (await request.json()) as T;
  } catch {
    return jsonResponse(
      { error: 'Request body must be valid JSON', code: 'invalid_json_body' },
      400
    );
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Common Thread Worker entry point.
 *
 * Uses Hyperdrive (MySQL) for relational storage. See implementation/db.ts
 * for the mysql2 connection layer and D1-compatible shim used by extractors.
 */

import { ManifestStore } from '../archive/manifest';
import { ManifestSigner } from '../archive/signing';
import { execute, query, queryOne } from '../db';
import type { InvestigationRow } from '../schema/db-types';
import {
  ingestApifyTwitter,
  TWITTER_ACCOUNT_EXTRACTORS,
  TWITTER_PAIR_EXTRACTORS,
} from '../ingest/apify-ingest';

export interface Env {
  DB: Hyperdrive;
  ARCHIVE: R2Bucket;
  /** Workers VPC binding (Network or Service) to the compose fleet via cloudflared. */
  VPC_INGEST?: Fetcher;
  /**
   * Full URL for VPC_INGEST.fetch(). Host sets the HTTP Host header (VPC Service
   * routes by service_id). Example: http://json_ingest/trigger
   */
  INGEST_WORKER_URL?: string;
  /** Bearer token shared with the ingest worker (wrangler secret). */
  INGEST_SECRET?: string;
  ENVIRONMENT: string;
  SIGNER_PUBLIC_KEY?: string;
  INVESTIGATION_NAMESPACE?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonResponse({ error: message }, 500);
    }
  },
};

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;

  // Health check
  if (method === 'GET' && path === '/') {
    return jsonResponse({
      name: 'common-thread',
      version: '0.1.0',
      environment: env.ENVIRONMENT,
      status: 'ok',
    });
  }

  // List investigations
  if (method === 'GET' && path === '/investigations') {
    const rows = await query<InvestigationRow>(
      env.DB,
      'SELECT * FROM investigations ORDER BY created_at DESC LIMIT 100'
    );
    return jsonResponse({ investigations: rows, count: rows.length });
  }

  // Create investigation
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

    await execute(
      env.DB,
      `INSERT INTO investigations (id, name, description, status, created_at, updated_at)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [body.id, body.name, body.description ?? null, now, now]
    );

    return jsonResponse(
      {
        id: body.id,
        name: body.name,
        description: body.description,
        status: 'active',
        created_at: now,
      },
      201
    );
  }

  // List seed accounts
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+\/seeds$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/seeds$/);
    const investigationId = match ? match[1] : '';

    const rows = await query(
      env.DB,
      `SELECT * FROM seed_accounts 
       WHERE investigation_id = ? 
       ORDER BY added_at DESC`,
      [investigationId]
    );

    return jsonResponse({ investigationId, seeds: rows, count: rows.length });
  }

  // Summary
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+\/summary$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/summary$/);
    const investigationId = match ? match[1] : '';

    const seedResult = await queryOne<{ count: number }>(
      env.DB,
      'SELECT COUNT(*) as count FROM seed_accounts WHERE investigation_id = ?',
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

  // === Apify Twitter ingest ===
  if (method === 'POST' && path.match(/^\/investigations\/[^/]+\/ingest\/apify-twitter$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/ingest\/apify-twitter$/);
    const investigationId = match ? match[1] : '';

    if (!investigationId) return jsonResponse({ error: 'Invalid investigation ID' }, 400);

    const inv = await queryOne(env.DB, 'SELECT id FROM investigations WHERE id = ?', [investigationId]);
    if (!inv) {
      return jsonResponse({
        error: `Investigation not found: ${investigationId}`,
        hint: 'Create it first with POST /investigations',
      }, 404);
    }

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

    const runExtractors = url.searchParams.get('runExtractors') === 'true';

    const result = await ingestApifyTwitter(
      env,
      investigationId,
      allItems,
      runExtractors
    );

    const status = result.delegatedToVpc ? 202 : 200;
    return jsonResponse(result, status);
  }

  return jsonResponse({ error: `Not found: ${method} ${path}` }, 404);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

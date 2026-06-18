/**
 * Common Thread Worker entry point.
 *
 * Routes:
 *
 *   GET  /                              → Health check
 *   GET  /investigations                → List investigations
 *   POST /investigations                → Create investigation
 *   GET  /investigations/:id/seeds      → List seed accounts
 *   GET  /investigations/:id/summary    → Summary stats
 *   GET  /manifest                      → List manifest entries
 *   GET  /signatures                    → List signatures
 *   GET  /verify                        → Verify signatures
 *   GET  /debug/ingest                  → Debug extractor visibility
 *   GET  /debug/manifest                → Raw manifest inspection
 *   DELETE /debug/manifest              → Delete all manifest entries for an investigation (debug)
 *
 *   POST /investigations/:id/ingest/apify-twitter
 *        → Ingest Apify Twitter/X data
 *        → Use ?runExtractors=true to also run extractors (only for small jobs)
 */

import { ManifestStore } from '../archive/manifest';
import { ManifestSigner } from '../archive/signing';
import type { InvestigationRow } from '../schema/db-types';
import {
  ingestApifyTwitter,
  TWITTER_ACCOUNT_EXTRACTORS,
  TWITTER_PAIR_EXTRACTORS,
} from '../ingest/apify-ingest';
import { runAccountExtractors } from '../extractors/runner';
import { runPairExtractors } from '../extractors/pair-runner';

export interface Env {
  DB: D1Database;
  ARCHIVE: R2Bucket;
  INGEST_QUEUE?: Queue<any>;
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

  // Queue Consumer
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext) {
    for (const message of batch.messages) {
      const { investigationId, provider = 'twitter' } = message.body;

      try {
        if (provider === 'twitter') {
          await runAccountExtractors(env, {
            investigationId,
            extractors: TWITTER_ACCOUNT_EXTRACTORS,
          });

          const seedCount = await env.DB
            .prepare('SELECT COUNT(*) as count FROM seed_accounts WHERE investigation_id = ?')
            .bind(investigationId)
            .first<{ count: number }>();

          if ((seedCount?.count ?? 0) >= 2) {
            await runPairExtractors(env, {
              investigationId,
              extractors: TWITTER_PAIR_EXTRACTORS,
            });
          }
        }

        message.ack();
      } catch (err: any) {
        console.error(`Queue processing failed for investigation ${investigationId}`, err);
        message.retry();
      }
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
    const result = await env.DB
      .prepare('SELECT * FROM investigations ORDER BY created_at DESC LIMIT ?')
      .bind(100)
      .all<InvestigationRow>();

    return jsonResponse({
      investigations: result.results ?? [],
      count: result.results?.length ?? 0,
    });
  }

  // Create investigation
  if (method === 'POST' && path === '/investigations') {
    const body = (await request.json()) as { id?: string; name?: string; description?: string };
    if (!body.id || !body.name) return jsonResponse({ error: 'id and name are required' }, 400);

    const now = new Date().toISOString();
    await env.DB
      .prepare(`INSERT INTO investigations (id, name, description, status, created_at, updated_at)
                VALUES (?, ?, ?, 'active', ?, ?)`)
      .bind(body.id, body.name, body.description ?? null, now, now)
      .run();

    return jsonResponse({ id: body.id, name: body.name, status: 'active', created_at: now }, 201);
  }

  // List seed accounts
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+\/seeds$/)) {
    const investigationId = path.match(/^\/investigations\/([^/]+)\/seeds$/)?.[1] || '';
    const result = await env.DB
      .prepare('SELECT * FROM seed_accounts WHERE investigation_id = ? ORDER BY added_at DESC')
      .bind(investigationId)
      .all();
    return jsonResponse({ investigationId, seeds: result.results ?? [], count: result.results?.length ?? 0 });
  }

  // Summary
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+\/summary$/)) {
    const investigationId = path.match(/^\/investigations\/([^/]+)\/summary$/)?.[1] || '';
    const seedResult = await env.DB
      .prepare('SELECT COUNT(*) as count FROM seed_accounts WHERE investigation_id = ?')
      .bind(investigationId)
      .first<{ count: number }>();
    const manifest = new ManifestStore({ bucket: env.ARCHIVE });
    const artifacts = await manifest.list({ investigationId });
    return jsonResponse({ investigationId, seeds: seedResult?.count ?? 0, artifacts: artifacts.length });
  }

  // List manifest
  if (method === 'GET' && path === '/manifest') {
    const investigationId = url.searchParams.get('investigation');
    const entries = await new ManifestStore({ bucket: env.ARCHIVE }).list(
      investigationId ? { investigationId } : undefined
    );
    return jsonResponse({ entries, count: entries.length });
  }

  // Signatures
  if (method === 'GET' && path === '/signatures') {
    const signatures = await new ManifestSigner({ bucket: env.ARCHIVE }).listSignatures();
    return jsonResponse({ signatures, count: signatures.length });
  }

  // Verify
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

  // === DEBUG: Delete manifest entries ===
  if (method === 'DELETE' && path.match(/^\/debug\/manifest$/)) {
    const investigationId = url.searchParams.get('investigation');
    if (!investigationId) return jsonResponse({ error: 'Missing ?investigation= parameter' }, 400);

    const manifest = new ManifestStore({ bucket: env.ARCHIVE });
    const entries = await manifest.list({ investigationId });

    let deleted = 0;
    for (const entry of entries) {
      try {
        await env.ARCHIVE.delete(entry.hash);
        deleted++;
      } catch {}
    }

    return jsonResponse({
      investigationId,
      deleted,
      message: `Deleted ${deleted} objects from R2 for investigation ${investigationId}`,
    });
  }

  // === Apify Twitter ingest ===
  if (method === 'POST' && path.match(/^\/investigations\/[^/]+\/ingest\/apify-twitter$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/ingest\/apify-twitter$/);
    const investigationId = match ? match[1] : '';

    if (!investigationId) return jsonResponse({ error: 'Invalid investigation ID' }, 400);

    const inv = await env.DB.prepare('SELECT id FROM investigations WHERE id = ?').bind(investigationId).first();
    if (!inv) return jsonResponse({ error: `Investigation not found: ${investigationId}` }, 404);

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
      { DB: env.DB, ARCHIVE: env.ARCHIVE, INGEST_QUEUE: env.INGEST_QUEUE },
      investigationId,
      allItems,
      runExtractors
    );

    const manifest = new ManifestStore({ bucket: env.ARCHIVE });
    const allEntries = await manifest.list({ investigationId });
    const entriesWithAccount = allEntries.filter((e) => e.account);

    const accountVisibility: Record<string, number> = {};
    const pairVisibility: Record<string, number> = {};

    for (const ex of TWITTER_ACCOUNT_EXTRACTORS) {
      accountVisibility[ex.name] = entriesWithAccount.filter((e) => {
        try { return ex.filterEntry?.(e) ?? false; } catch { return false; }
      }).length;
    }
    for (const ex of TWITTER_PAIR_EXTRACTORS) {
      pairVisibility[ex.name] = entriesWithAccount.length;
    }

    const accountRuns = result.accountExtractorRuns ?? [];
    const pairRuns = result.pairExtractorRuns ?? [];

    return jsonResponse(
      {
        ...result,
        extractorVisibility: { account: accountVisibility, pair: pairVisibility },
        summary: {
          tweetsProcessed: result.tweetsProcessed,
          uniqueAccounts: result.uniqueAccounts,
          artifactsCreated: result.artifactsCreated,
          seedsRegistered: result.seedsRegistered,
          accountExtractorsRun: accountRuns.length,
          pairExtractorsRun: pairRuns.length,
          pairExtractorsSkipped: result.pairExtractorsSkipped ?? false,
          pairExtractorsSkippedReason: result.pairExtractorsSkippedReason,
          totalFeaturesProduced:
            accountRuns.reduce((s: number, r: any) => s + (r.outputFeatureCount || 0), 0) +
            pairRuns.reduce((s: number, r: any) => s + (r.outputFeatureCount || 0), 0),
        },
      },
      200
    );
  }

  return jsonResponse({ error: `Not found: ${method} ${path}` }, 404);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

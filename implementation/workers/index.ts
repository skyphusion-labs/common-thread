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
 *
 *   POST /investigations/:id/ingest/apify-twitter
 *        → Ingest Apify Twitter/X data (supports multiple files)
 */

import { ManifestStore } from '../archive/manifest';
import { ManifestSigner } from '../archive/signing';
import type { InvestigationRow } from '../schema/db-types';
import {
  ingestApifyTwitter,
  TWITTER_ACCOUNT_EXTRACTORS,
  TWITTER_PAIR_EXTRACTORS,
} from '../ingest/apify-ingest';

export interface Env {
  DB: D1Database;
  ARCHIVE: R2Bucket;
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
    const body = (await request.json()) as {
      id?: string;
      name?: string;
      description?: string;
    };

    if (!body.id || !body.name) {
      return jsonResponse({ error: 'id and name are required' }, 400);
    }

    const now = new Date().toISOString();

    await env.DB
      .prepare(
        `INSERT INTO investigations (id, name, description, status, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?)`
      )
      .bind(body.id, body.name, body.description ?? null, now, now)
      .run();

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

    if (!investigationId) {
      return jsonResponse({ error: 'Invalid investigation ID' }, 400);
    }

    const result = await env.DB
      .prepare(
        `SELECT * FROM seed_accounts 
         WHERE investigation_id = ? 
         ORDER BY added_at DESC`
      )
      .bind(investigationId)
      .all();

    return jsonResponse({
      investigationId,
      seeds: result.results ?? [],
      count: result.results?.length ?? 0,
    });
  }

  // Summary for an investigation
  if (method === 'GET' && path.match(/^\/investigations\/[^/]+\/summary$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/summary$/);
    const investigationId = match ? match[1] : '';

    if (!investigationId) {
      return jsonResponse({ error: 'Invalid investigation ID' }, 400);
    }

    const seedResult = await env.DB
      .prepare('SELECT COUNT(*) as count FROM seed_accounts WHERE investigation_id = ?')
      .bind(investigationId)
      .first<{ count: number }>();

    const manifest = new ManifestStore({ bucket: env.ARCHIVE });
    const artifacts = await manifest.list({ investigationId });

    let extractorRunCount = 0;
    try {
      const acc = await env.DB
        .prepare('SELECT COUNT(*) as count FROM account_extractor_runs WHERE investigation_id = ?')
        .bind(investigationId)
        .first<{ count: number }>();
      const pair = await env.DB
        .prepare('SELECT COUNT(*) as count FROM pair_extractor_runs WHERE investigation_id = ?')
        .bind(investigationId)
        .first<{ count: number }>();
      extractorRunCount = (acc?.count || 0) + (pair?.count || 0);
    } catch {}

    return jsonResponse({
      investigationId,
      seeds: seedResult?.count ?? 0,
      artifacts: artifacts.length,
      extractorRuns: extractorRunCount,
    });
  }

  // List manifest entries
  if (method === 'GET' && path === '/manifest') {
    const manifest = new ManifestStore({ bucket: env.ARCHIVE });
    const investigationId = url.searchParams.get('investigation');
    const entries = await manifest.list(
      investigationId ? { investigationId } : undefined
    );

    return jsonResponse({
      entries,
      count: entries.length,
    });
  }

  // List signatures
  if (method === 'GET' && path === '/signatures') {
    const signer = new ManifestSigner({ bucket: env.ARCHIVE });
    const signatures = await signer.listSignatures();

    return jsonResponse({
      signatures,
      count: signatures.length,
    });
  }

  // Verify signatures
  if (method === 'GET' && path === '/verify') {
    const signer = new ManifestSigner({ bucket: env.ARCHIVE });
    const results = await signer.verifyAll();
    const validCount = results.filter((r) => r.valid).length;

    return jsonResponse({
      totalSignatures: results.length,
      validSignatures: validCount,
      allValid: results.length > 0 && validCount === results.length,
      results: results.map((r) => ({
        publicKey: r.signature.publicKey,
        signerId: r.signature.signerId,
        signedAt: r.signature.signedAt,
        valid: r.valid,
        reason: r.reason,
      })),
    });
  }

  // === DEBUG: Ingest / Extractor visibility ===
  if (method === 'GET' && path.match(/^\/debug\/ingest$/)) {
    const investigationId = url.searchParams.get('investigation');

    if (!investigationId) {
      return jsonResponse({ error: 'Missing ?investigation= parameter' }, 400);
    }

    const manifest = new ManifestStore({ bucket: env.ARCHIVE });
    const allEntries = await manifest.list({ investigationId });
    const entriesWithAccount = allEntries.filter((e) => e.account);

    const accountVisibility: Record<string, any> = {};
    const pairVisibility: Record<string, any> = {};

    for (const ex of TWITTER_ACCOUNT_EXTRACTORS) {
      const matching = entriesWithAccount.filter((e) => {
        try {
          return ex.filterEntry?.(e) ?? false;
        } catch {
          return false;
        }
      });

      accountVisibility[ex.name] = {
        count: matching.length,
        sampleCollectionMethod: matching[0]?.collectionMethod,
        sampleSource: matching[0]?.source,
      };
    }

    for (const ex of TWITTER_PAIR_EXTRACTORS) {
      pairVisibility[ex.name] = {
        count: entriesWithAccount.length,
      };
    }

    return jsonResponse({
      investigationId,
      totalEntries: allEntries.length,
      entriesWithAccount: entriesWithAccount.length,
      sampleEntry: entriesWithAccount[0],
      extractorVisibility: {
        account: accountVisibility,
        pair: pairVisibility,
      },
    });
  }

  // === Apify Twitter ingest ===
  if (method === 'POST' && path.match(/^\/investigations\/[^/]+\/ingest\/apify-twitter$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/ingest\/apify-twitter$/);
    const investigationId = match ? match[1] : '';

    if (!investigationId) {
      return jsonResponse({ error: 'Invalid investigation ID in URL' }, 400);
    }

    const inv = await env.DB
      .prepare('SELECT id FROM investigations WHERE id = ?')
      .bind(investigationId)
      .first();

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

            if (Array.isArray(parsed)) {
              allItems.push(...parsed);
            } else if (Array.isArray(parsed?.items)) {
              allItems.push(...parsed.items);
            } else if (Array.isArray(parsed?.data)) {
              allItems.push(...parsed.data);
            } else {
              allItems.push(parsed);
            }
          } catch {
            return jsonResponse({ error: 'Invalid JSON in one of the uploaded files' }, 400);
          }
        }
      }

      if (allItems.length === 0) {
        return jsonResponse({ error: 'No valid files uploaded. Use field name "file"' }, 400);
      }
    } else {
      // Raw JSON body
      const body = await request.json() as any;

      if (Array.isArray(body)) {
        allItems = body;
      } else if (Array.isArray(body?.items)) {
        allItems = body.items;
      } else if (Array.isArray(body?.data)) {
        allItems = body.data;
      } else {
        allItems = [body];
      }
    }

    const result = await ingestApifyTwitter(
      { DB: env.DB, ARCHIVE: env.ARCHIVE },
      investigationId,
      allItems
    );

    const accountRuns = result.accountExtractorRuns ?? [];
    const pairRuns = result.pairExtractorRuns ?? [];

    const accountProducing = accountRuns
      .filter((r: any) => (r.outputFeatureCount || 0) > 0)
      .map((r: any) => ({
        name: r.extractorName,
        version: r.extractorVersion,
        features: r.outputFeatureCount,
      }));

    const pairProducing = pairRuns
      .filter((r: any) => (r.outputFeatureCount || 0) > 0)
      .map((r: any) => ({
        name: r.extractorName,
        version: r.extractorVersion,
        features: r.outputFeatureCount,
      }));

    return jsonResponse(
      {
        ...result,
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
        extractorsWithFeatures: {
          account: accountProducing,
          pair: pairProducing,
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

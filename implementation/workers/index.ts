/**
 * Common Thread Worker entry point.
 *
 * Routes:
 *
 *   GET  /                              → Health check
 *   GET  /investigations                → List investigations
 *   POST /investigations                → Create investigation
 *   GET  /manifest                      → List manifest entries
 *   GET  /signatures                    → List signatures
 *   GET  /verify                        → Verify all signatures
 *
 *   POST /investigations/:id/ingest/apify-twitter
 *        → Ingest Apify Twitter/X data
 *          - Accepts raw JSON body OR multipart/form-data file upload
 */

import { ManifestStore } from '../archive/manifest';
import { ManifestSigner } from '../archive/signing';
import type { InvestigationRow } from '../schema/db-types';
import { ingestApifyTwitter } from '../ingest/apify-ingest';

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

  // === Apify Twitter ingest ===
  if (method === 'POST' && path.match(/^\/investigations\/[^/]+\/ingest\/apify-twitter$/)) {
    const match = path.match(/^\/investigations\/([^/]+)\/ingest\/apify-twitter$/);
    const investigationId = match ? match[1] : '';

    if (!investigationId) {
      return jsonResponse({ error: 'Invalid investigation ID in URL' }, 400);
    }

    // Check that the investigation exists
    const inv = await env.DB
      .prepare('SELECT id FROM investigations WHERE id = ?')
      .bind(investigationId)
      .first();

    if (!inv) {
      return jsonResponse({
        error: `Investigation not found: ${investigationId}`,
        hint: 'Create it first with POST /investigations',
        example: { id: investigationId, name: 'My Investigation Name' },
      }, 404);
    }

    let payload: any;

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // === File upload ===
      const formData = await request.formData();
      const fileEntry = formData.get('file');

      // Safe check that avoids the instanceof type error
      if (!fileEntry || typeof fileEntry === 'string' || !('text' in fileEntry)) {
        return jsonResponse({ error: 'No file uploaded. Use field name "file"' }, 400);
      }

      try {
        const text = await (fileEntry as File).text();
        payload = JSON.parse(text);
      } catch {
        return jsonResponse({ error: 'Uploaded file is not valid JSON' }, 400);
      }
    } else {
      // === Raw JSON body ===
      try {
        payload = await request.json();
      } catch {
        return jsonResponse({ error: 'Invalid JSON body' }, 400);
      }
    }

    const result = await ingestApifyTwitter(
      { DB: env.DB, ARCHIVE: env.ARCHIVE },
      investigationId,
      payload
    );

    // === Rich response with extractor summary ===
    const accountProducing = result.accountExtractorRuns
      .filter((r: any) => (r.outputFeatureCount || 0) > 0)
      .map((r: any) => ({
        name: r.extractorName,
        version: r.extractorVersion,
        features: r.outputFeatureCount,
      }));

    const pairProducing = result.pairExtractorRuns
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
          accountExtractorsRun: result.accountExtractorRuns.length,
          pairExtractorsRun: result.pairExtractorRuns.length,
          totalFeaturesProduced:
            result.accountExtractorRuns.reduce((s: number, r: any) => s + (r.outputFeatureCount || 0), 0) +
            result.pairExtractorRuns.reduce((s: number, r: any) => s + (r.outputFeatureCount || 0), 0),
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

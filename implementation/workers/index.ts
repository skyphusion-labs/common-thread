/**
 * Common Thread Worker entry point.
 *
 * This is a minimal entry point that exercises the D1 and R2 bindings
 * to confirm the scaffolding works end-to-end. It is not the full API
 * surface; routes will be filled in as the implementation matures.
 *
 * Routes implemented:
 *
 *   GET  /                       - health check
 *   GET  /investigations         - list investigations from D1
 *   POST /investigations         - create a new investigation
 *   GET  /manifest               - list manifest entries from R2
 *   GET  /signatures             - list manifest signatures
 *   GET  /verify                 - verify all manifest signatures
 *
 * All responses are JSON. Errors are returned as { error: string } with
 * appropriate HTTP status codes.
 */

import { ManifestStore } from '../archive/manifest';
import { ManifestSigner } from '../archive/signing';
import type { InvestigationRow } from '../schema/db-types';

export interface Env {
  /** D1 database binding (see wrangler.toml). */
  DB: D1Database;

  /** R2 archive binding (see wrangler.toml). */
  ARCHIVE: R2Bucket;

  /** Environment identifier: 'development' or 'production'. */
  ENVIRONMENT: string;

  /** Optional: public key of the authorized signer (from .dev.vars or secret). */
  SIGNER_PUBLIC_KEY?: string;

  /** Optional: investigation namespace for scoping (from .dev.vars). */
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

  // Health check.
  if (method === 'GET' && path === '/') {
    return jsonResponse({
      name: 'common-thread',
      version: '0.1.0',
      environment: env.ENVIRONMENT,
      status: 'ok',
      bindings: {
        db: !!env.DB,
        archive: !!env.ARCHIVE,
        signerPublicKey: !!env.SIGNER_PUBLIC_KEY,
      },
    });
  }

  // List investigations.
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

  // Create investigation.
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
    return jsonResponse({
      id: body.id,
      name: body.name,
      description: body.description,
      status: 'active',
      created_at: now,
    }, 201);
  }

  // List manifest entries.
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

  // List manifest signatures.
  if (method === 'GET' && path === '/signatures') {
    const signer = new ManifestSigner({ bucket: env.ARCHIVE });
    const signatures = await signer.listSignatures();
    return jsonResponse({
      signatures,
      count: signatures.length,
    });
  }

  // Verify all signatures.
  if (method === 'GET' && path === '/verify') {
    const signer = new ManifestSigner({ bucket: env.ARCHIVE });
    const results = await signer.verifyAll();
    const validCount = results.filter(r => r.valid).length;
    return jsonResponse({
      totalSignatures: results.length,
      validSignatures: validCount,
      allValid: results.length > 0 && validCount === results.length,
      results: results.map(r => ({
        publicKey: r.signature.publicKey,
        signerId: r.signature.signerId,
        signedAt: r.signature.signedAt,
        valid: r.valid,
        reason: r.reason,
      })),
    });
  }

  return jsonResponse({ error: `Not found: ${method} ${path}` }, 404);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2) + '\n', {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

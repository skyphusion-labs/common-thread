/**
 * Self-hosted extraction container HTTP server.
 *
 * Receives ingest jobs from the Cloudflare Worker via Workers VPC HTTP,
 * fetches the raw export from R2, runs the shared ingest pipeline, and
 * writes results to MySQL.
 *
 * Encrypted investigations (#246): optional encryptionKeyMaterial on the
 * handoff is imported for the duration of processJob and never logged or
 * written to MySQL. Missing key material on a crypto_version investigation
 * fails the job (fail closed).
 *
 * Contract: POST /trigger -- see implementation/ingest/handoff.ts
 */

import http from 'node:http';
import { hostname } from 'node:os';
import { timingSafeEqual } from 'node:crypto';
import { ArchiveStore } from '../../implementation/archive/store';
import {
  createR2BucketFromS3Config,
  r2S3ConfigFromEnv,
} from './r2-bucket';
import { createDatabaseClient, parseMysqlUrl } from '../../implementation/db';
import {
  unsealInvestigationKeyFromVpcHandoff,
  verifyKeyCheck,
} from '../../implementation/crypto/investigation-key';
import type { IngestJobHandoff } from '../../implementation/ingest/handoff';
import { claimIngestJob, failIngestJob } from '../../implementation/ingest/jobs';
import { buildManifestRemoteAppend } from '../../implementation/ingest/manifest-env';
import { runTwitterIngestPipeline } from '../../implementation/ingest/pipeline';

const PORT = Number(process.env.PORT ?? 8080);
const INGEST_SECRET = process.env.INGEST_SECRET ?? '';
const MYSQL_URL = process.env.MYSQL_URL ?? '';
const CONTAINER_NAME = process.env.CONTAINER_NAME ?? hostname();

// A handoff is three short ids; a few KB is generous. Cap the body so a crafted
// request cannot buffer unbounded memory and OOM the container.
const MAX_BODY_BYTES = 256 * 1024;

if (!INGEST_SECRET) {
  console.error('[ingest] INGEST_SECRET is required');
  process.exit(1);
}

// Pre-compute the expected Authorization header once so the per-request compare
// is constant-time against a fixed buffer.
const EXPECTED_AUTH = Buffer.from(`Bearer ${INGEST_SECRET}`, 'utf8');

// Constant-time bearer check. timingSafeEqual throws on length mismatch, so we
// guard length first (the length may leak; the secret bytes must not). A plain
// `===` leaks the secret a byte at a time via early-exit timing.
function authorized(req: http.IncomingMessage): boolean {
  const provided = Buffer.from(req.headers.authorization ?? '', 'utf8');
  if (provided.length !== EXPECTED_AUTH.length) return false;
  return timingSafeEqual(provided, EXPECTED_AUTH);
}

function unauthorized(res: http.ServerResponse) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }) + '\n');
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let aborted = false;
    req.on('data', (c: Buffer) => {
      if (aborted) return;
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        aborted = true;
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function processJob(handoff: IngestJobHandoff): Promise<void> {
  if (!MYSQL_URL) {
    throw new Error('MYSQL_URL is required');
  }

  const db = createDatabaseClient(parseMysqlUrl(MYSQL_URL));
  const archive = createR2BucketFromS3Config(r2S3ConfigFromEnv());

  await claimIngestJob(db, handoff.jobId, CONTAINER_NAME);

  // Fail closed: encrypted inv without key-on-dispatch would write plaintext.
  const inv = await db
    .prepare(
      'SELECT crypto_version, key_check FROM investigations WHERE id = ?'
    )
    .bind(handoff.investigationId)
    .first<{ crypto_version: string | null; key_check: string | null }>();
  const isEncrypted = Boolean(inv?.crypto_version);
  // Pull sealed material off the handoff object before any work/logging path
  // can see it (#246 audit: never log the handoff with key material).
  const sealedMaterial = handoff.encryptionKeyMaterial;
  handoff.encryptionKeyMaterial = undefined;

  if (isEncrypted && !sealedMaterial) {
    throw new Error(
      `Encrypted investigation ${handoff.investigationId} requires encryptionKeyMaterial on the VPC handoff (#246)`
    );
  }

  let encKey: CryptoKey | null = null;
  if (sealedMaterial) {
    encKey = await unsealInvestigationKeyFromVpcHandoff(
      sealedMaterial,
      INGEST_SECRET,
      handoff.investigationId
    );
    if (inv?.key_check) {
      const ok = await verifyKeyCheck(encKey, inv.key_check);
      if (!ok) {
        throw new Error(
          `Encrypted investigation ${handoff.investigationId}: handoff key failed key_check`
        );
      }
    }
  }

  const store = new ArchiveStore({ bucket: archive });
  const raw = await store.get(handoff.rawFileHash, 'json');
  if (!raw) {
    throw new Error(`Raw export not found in R2: ${handoff.rawFileHash}`);
  }

  const payload = JSON.parse(new TextDecoder().decode(raw.bytes));

  const manifestRemoteAppend = buildManifestRemoteAppend(
    handoff.manifestAppendBaseUrl,
    INGEST_SECRET,
    handoff.investigationId
  );

  try {
    await runTwitterIngestPipeline(
      { db, archive, manifestRemoteAppend },
      {
        investigationId: handoff.investigationId,
        payload,
        rawHash: handoff.rawFileHash,
        jobId: handoff.jobId,
        encKey,
      }
    );
  } finally {
    // Best-effort: drop the in-memory key reference when the job ends.
    encKey = null;
  }

  // Pass the user-controlled ids as args, not inside the format string, so a
  // crafted jobId cannot inject console format directives (CodeQL
  // js/tainted-format-string).
  console.log(
    '[ingest] completed job %s investigation=%s encrypted=%s',
    handoff.jobId,
    handoff.investigationId,
    isEncrypted
  );
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', container: CONTAINER_NAME }) + '\n');
    return;
  }

  if (req.method !== 'POST' || req.url !== '/trigger') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }) + '\n');
    return;
  }

  if (!authorized(req)) {
    unauthorized(res);
    return;
  }

  let handoff: IngestJobHandoff;
  try {
    handoff = (await readJson(req)) as IngestJobHandoff;
  } catch (err) {
    const tooLarge = err instanceof Error && err.message === 'payload too large';
    res.writeHead(tooLarge ? 413 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: tooLarge ? 'Payload too large' : 'Invalid JSON' }) + '\n');
    return;
  }

  if (!handoff?.jobId || !handoff?.investigationId || !handoff?.rawFileHash) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ error: 'jobId, investigationId, and rawFileHash are required' }) + '\n'
    );
    return;
  }

  // Strip any residual key field before handing off to async work / logs.
  handoff.encryptionKeyMaterial = undefined;
  const jobId = handoff.jobId;
  processJob(handoff).catch(async (err) => {
    // Log message only — never the Error object or handoff (could retain key).
    const message = err instanceof Error ? err.message : String(err);
    console.error('[ingest] job %s failed: %s', jobId, message);
    try {
      if (MYSQL_URL) {
        const db = createDatabaseClient(parseMysqlUrl(MYSQL_URL));
        await failIngestJob(db, jobId, message);
      }
    } catch {
      console.error('[ingest] failed to record job failure for %s', jobId);
    }
  });

  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ accepted: true, jobId }) + '\n');
});

server.listen(PORT, () => {
  console.log(`[ingest] listening on :${PORT} as ${CONTAINER_NAME}`);
});

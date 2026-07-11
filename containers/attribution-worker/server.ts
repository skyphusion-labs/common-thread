/**
 * Self-hosted attribution executor container HTTP server.
 *
 * Receives async attribution jobs from the Cloudflare Worker via Workers VPC
 * HTTP, runs the reasoner pipeline (runAttribution) against MySQL + R2 using its
 * OWN server-side credentials, and records the terminal job status.
 *
 * Mirrors containers/ingest-worker/server.ts. Per Conrad's 2026-07-11 decision,
 * this executor only ever runs server-credential jobs: the handoff carries no
 * credential, and the container uses its own AI_GATEWAY_URL / ANTHROPIC_API_KEY.
 * BYOK attribution stays synchronous inline in the Worker and never reaches
 * here.
 *
 * Contract: POST /trigger -- see implementation/attribution/handoff.ts
 */

import http from 'node:http';
import { hostname } from 'node:os';
import { timingSafeEqual } from 'node:crypto';
import {
  createR2BucketFromS3Config,
  r2S3ConfigFromEnv,
} from '../ingest-worker/r2-bucket';
import { createDatabaseClient, parseMysqlUrl } from '../../implementation/db';
import { runAttribution } from '../../implementation/reasoner/runner';
import {
  claimAttributionJob,
  completeAttributionJob,
  failAttributionJob,
} from '../../implementation/attribution/jobs';
import type { AttributionJobHandoff } from '../../implementation/attribution/handoff';

const PORT = Number(process.env.PORT ?? 8082);
const ATTRIBUTION_SECRET = process.env.ATTRIBUTION_SECRET ?? '';
const MYSQL_URL = process.env.MYSQL_URL ?? '';
const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL ?? '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const TRIAGE_MODEL = process.env.TRIAGE_MODEL ?? 'claude-haiku-4-5';
const REASONING_MODEL = process.env.REASONING_MODEL ?? 'claude-opus-4-8';
const CONTAINER_NAME = process.env.CONTAINER_NAME ?? hostname();

// A handoff is an id pair plus a small options object; a few KB is generous.
// Cap the body so a crafted request cannot buffer unbounded memory and OOM the
// container.
const MAX_BODY_BYTES = 256 * 1024;

if (!ATTRIBUTION_SECRET) {
  console.error('[attribution] ATTRIBUTION_SECRET is required');
  process.exit(1);
}

// Pre-compute the expected Authorization header once so the per-request compare
// is constant-time against a fixed buffer.
const EXPECTED_AUTH = Buffer.from(`Bearer ${ATTRIBUTION_SECRET}`, 'utf8');

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

async function processJob(handoff: AttributionJobHandoff): Promise<void> {
  if (!MYSQL_URL) {
    throw new Error('MYSQL_URL is required');
  }
  if (!AI_GATEWAY_URL || !ANTHROPIC_API_KEY) {
    throw new Error('AI_GATEWAY_URL and ANTHROPIC_API_KEY are required');
  }

  const db = createDatabaseClient(parseMysqlUrl(MYSQL_URL));
  const archive = createR2BucketFromS3Config(r2S3ConfigFromEnv());

  await claimAttributionJob(db, handoff.jobId, CONTAINER_NAME);

  const summaries = await runAttribution(
    {
      DB: db,
      ARCHIVE: archive as unknown as R2Bucket,
      AI_GATEWAY_URL,
      ANTHROPIC_API_KEY,
      TRIAGE_MODEL,
      REASONING_MODEL,
    },
    {
      investigationId: handoff.investigationId,
      accountFilter: handoff.options?.accountFilter,
      skipTriage: handoff.options?.skipTriage,
      maxRetries: handoff.options?.maxRetries,
      randomizationSeed: handoff.options?.randomizationSeed,
    }
  );

  await completeAttributionJob(db, handoff.jobId, summaries.length);

  // Pass the user-controlled ids as args, not inside the format string, so a
  // crafted jobId cannot inject console format directives (CodeQL
  // js/tainted-format-string).
  console.log(
    '[attribution] completed job %s investigation=%s pairs=%d',
    handoff.jobId,
    handoff.investigationId,
    summaries.length
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

  let handoff: AttributionJobHandoff;
  try {
    handoff = (await readJson(req)) as AttributionJobHandoff;
  } catch (err) {
    const tooLarge = err instanceof Error && err.message === 'payload too large';
    res.writeHead(tooLarge ? 413 : 400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: tooLarge ? 'Payload too large' : 'Invalid JSON' }) + '\n');
    return;
  }

  if (!handoff?.jobId || !handoff?.investigationId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ error: 'jobId and investigationId are required' }) + '\n'
    );
    return;
  }

  processJob(handoff).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[attribution] job %s failed:', handoff.jobId, err);
    try {
      if (MYSQL_URL) {
        const db = createDatabaseClient(parseMysqlUrl(MYSQL_URL));
        await failAttributionJob(db, handoff.jobId, message);
      }
    } catch (dbErr) {
      console.error('[attribution] failed to record job failure for %s:', handoff.jobId, dbErr);
    }
  });

  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ accepted: true, jobId: handoff.jobId }) + '\n');
});

server.listen(PORT, () => {
  console.log(`[attribution] listening on :${PORT} as ${CONTAINER_NAME}`);
});

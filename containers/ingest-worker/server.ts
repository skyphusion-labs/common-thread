/**
 * Self-hosted extraction container HTTP server.
 *
 * Receives ingest jobs from the Cloudflare Worker via Workers VPC HTTP,
 * fetches the raw export from R2, runs the shared ingest pipeline, and
 * writes results to MySQL.
 *
 * Contract: POST /trigger — see implementation/ingest/handoff.ts
 */

import http from 'node:http';
import { hostname } from 'node:os';
import { ArchiveStore } from '../../implementation/archive/store';
import {
  createR2BucketFromS3Config,
  r2S3ConfigFromEnv,
} from './r2-bucket';
import { createDatabaseClient, parseMysqlUrl } from '../../implementation/db';
import type { IngestJobHandoff } from '../../implementation/ingest/handoff';
import { claimIngestJob, failIngestJob } from '../../implementation/ingest/jobs';
import { runTwitterIngestPipeline } from '../../implementation/ingest/pipeline';

const PORT = Number(process.env.PORT ?? 8080);
const INGEST_SECRET = process.env.INGEST_SECRET ?? '';
const MYSQL_URL = process.env.MYSQL_URL ?? '';
const CONTAINER_NAME = process.env.CONTAINER_NAME ?? hostname();

if (!INGEST_SECRET) {
  console.error('[ingest] INGEST_SECRET is required');
  process.exit(1);
}

function unauthorized(res: http.ServerResponse) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }) + '\n');
}

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
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

  const store = new ArchiveStore({ bucket: archive });
  const raw = await store.get(handoff.rawFileHash, 'json');
  if (!raw) {
    throw new Error(`Raw export not found in R2: ${handoff.rawFileHash}`);
  }

  const payload = JSON.parse(new TextDecoder().decode(raw.bytes));

  await runTwitterIngestPipeline(
    { db, archive },
    {
      investigationId: handoff.investigationId,
      payload,
      rawHash: handoff.rawFileHash,
      jobId: handoff.jobId,
    }
  );

  console.log(
    `[ingest] completed job ${handoff.jobId} investigation=${handoff.investigationId}`
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

  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${INGEST_SECRET}`) {
    unauthorized(res);
    return;
  }

  let handoff: IngestJobHandoff;
  try {
    handoff = (await readJson(req)) as IngestJobHandoff;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }) + '\n');
    return;
  }

  if (!handoff?.jobId || !handoff?.investigationId || !handoff?.rawFileHash) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({ error: 'jobId, investigationId, and rawFileHash are required' }) + '\n'
    );
    return;
  }

  processJob(handoff).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ingest] job ${handoff.jobId} failed:`, err);
    try {
      if (MYSQL_URL) {
        const db = createDatabaseClient(parseMysqlUrl(MYSQL_URL));
        await failIngestJob(db, handoff.jobId, message);
      }
    } catch (dbErr) {
      console.error(`[ingest] failed to record job failure for ${handoff.jobId}:`, dbErr);
    }
  });

  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ accepted: true, jobId: handoff.jobId }) + '\n');
});

server.listen(PORT, () => {
  console.log(`[ingest] listening on :${PORT} as ${CONTAINER_NAME}`);
});

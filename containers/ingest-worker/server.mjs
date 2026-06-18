/**
 * Self-hosted ingest worker — receives jobs from the Cloudflare Worker via VPC.
 *
 * Contract: POST /trigger with JSON body matching IngestJobHandoff
 * (see ../../implementation/ingest/handoff.ts).
 *
 * This skeleton accepts the job and returns 202 immediately. Wire in parsing,
 * local staging, extraction, and R2 upload in processJob().
 */

import http from 'node:http';

const PORT = Number(process.env.PORT ?? 8080);
const INGEST_SECRET = process.env.INGEST_SECRET ?? '';
const DATA_DIR = process.env.INGEST_DATA_DIR ?? '/data/ingest';

interface IngestJobHandoff {
  jobId: string;
  investigationId: string;
  provider: 'twitter';
  rawFileHash: string;
  runExtractors: boolean;
  itemCount: number;
  accounts: string[];
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
  // TODO: claim ingest_jobs row (status=running)
  // TODO: fetch raw JSON from R2 by handoff.rawFileHash
  // TODO: parse tweets → local files under ${DATA_DIR}/${handoff.jobId}/
  // TODO: register seeds, append manifest, bulk upload to R2
  // TODO: if handoff.runExtractors, run extractors against local archive
  // TODO: mark ingest_jobs completed or failed
  console.log(`[ingest] queued job ${handoff.jobId} investigation=${handoff.investigationId} items=${handoff.itemCount} data_dir=${DATA_DIR}`);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }) + '\n');
    return;
  }

  if (req.method !== 'POST' || req.url !== '/trigger') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }) + '\n');
    return;
  }

  if (INGEST_SECRET) {
    const auth = req.headers.authorization ?? '';
    if (auth !== `Bearer ${INGEST_SECRET}`) {
      unauthorized(res);
      return;
    }
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
    res.end(JSON.stringify({ error: 'jobId, investigationId, and rawFileHash are required' }) + '\n');
    return;
  }

  // Accept fast; process in background.
  processJob(handoff).catch((err) => {
    console.error(`[ingest] job ${handoff.jobId} failed:`, err);
  });

  res.writeHead(202, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ accepted: true, jobId: handoff.jobId }) + '\n');
});

server.listen(PORT, () => {
  console.log(`[ingest] listening on :${PORT}`);
});

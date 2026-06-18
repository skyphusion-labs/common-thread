/**
 * Self-hosted PDF/A evidence-packet renderer.
 *
 * Receives HTML from the Cloudflare Worker via Workers VPC HTTP,
 * renders with wkhtmltopdf, converts to PDF/A-2b with Ghostscript.
 *
 * Contract: POST /render — see implementation/reporting/pdf-handoff.ts
 */

import http from 'node:http';
import { hostname } from 'node:os';
import type { PdfRenderHandoff } from '../../implementation/reporting/pdf-handoff';
import { renderHtmlToPdfA } from './render-pdfa';

const PORT = Number(process.env.PORT ?? 8081);
const PDF_SECRET = process.env.PDF_SECRET ?? '';
const CONTAINER_NAME = process.env.CONTAINER_NAME ?? hostname();

if (!PDF_SECRET) {
  console.error('[pdf] PDF_SECRET is required');
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

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', container: CONTAINER_NAME }) + '\n');
    return;
  }

  if (req.method !== 'POST' || req.url !== '/render') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }) + '\n');
    return;
  }

  const auth = req.headers.authorization ?? '';
  if (auth !== `Bearer ${PDF_SECRET}`) {
    unauthorized(res);
    return;
  }

  let handoff: PdfRenderHandoff;
  try {
    handoff = (await readJson(req)) as PdfRenderHandoff;
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }) + '\n');
    return;
  }

  if (!handoff?.html || !handoff?.investigationId || !handoff?.attributionRunId) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        error: 'investigationId, attributionRunId, and html are required',
      }) + '\n'
    );
    return;
  }

  try {
    const pdf = await renderHtmlToPdfA(handoff.html);
    const filename = `common-thread-${handoff.investigationId}-run-${handoff.attributionRunId}.pdf`;
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-PDF-A-Profile': handoff.pdfaProfile ?? '2b',
    });
    res.end(pdf);
    console.log(
      `[pdf] rendered ${filename} investigation=${handoff.investigationId} run=${handoff.attributionRunId}`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[pdf] render failed:', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `PDF render failed: ${message}` }) + '\n');
  }
});

server.listen(PORT, () => {
  console.log(`[pdf] listening on :${PORT} as ${CONTAINER_NAME}`);
});

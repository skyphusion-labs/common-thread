#!/usr/bin/env npx tsx
/**
 * Generate a minimal evidence-packet PDF/A-2b sample and validate with veraPDF.
 * Lives under containers/pdf-worker/ (not in root tsc include; run via tsx in CI).
 */

import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { renderHtmlToPdfA } from './render-pdfa.ts';

const execFileAsync = promisify(execFile);

const SAMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Common Thread PDF/A sample</title></head>
<body>
  <h1>Evidence packet sample</h1>
  <p>PDF/A-2b validation fixture for CI.</p>
</body>
</html>`;

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'ct-pdfa-'));
  const pdfPath = join(dir, 'sample.pdf');
  try {
    const bytes = await renderHtmlToPdfA(SAMPLE_HTML);
    await writeFile(pdfPath, bytes);

    await execFileAsync(
      'docker',
      [
        'run',
        '--rm',
        '-v',
        `${dir}:/data:ro`,
        'verapdf/verapdf:latest',
        '/data/sample.pdf',
      ],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    console.log('veraPDF: sample PDF/A validation passed');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

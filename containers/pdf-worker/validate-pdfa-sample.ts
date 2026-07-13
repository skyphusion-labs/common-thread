#!/usr/bin/env npx tsx
/**
 * Generate a minimal evidence-packet PDF/A-2b sample and validate with veraPDF.
 * Lives under containers/pdf-worker/ (not in root tsc include; run via tsx in CI).
 */

import { execFile } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
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

const OUT_DIR = join(process.cwd(), 'tmp-pdfa-validate');

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const pdfPath = join(OUT_DIR, 'sample.pdf');
  try {
    const bytes = await renderHtmlToPdfA(SAMPLE_HTML);
    await writeFile(pdfPath, bytes);

    await execFileAsync(
      'docker',
      [
        'run',
        '--rm',
        '-v',
        `${OUT_DIR}:/data:ro`,
        '-w',
        '/data',
        'verapdf/cli:latest',
        'sample.pdf',
      ],
      { maxBuffer: 8 * 1024 * 1024 }
    );
    console.log('veraPDF: sample PDF/A validation passed');
  } finally {
    await rm(OUT_DIR, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * HTML → PDF → PDF/A-2b via wkhtmltopdf + Ghostscript (§8.1.2).
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function renderHtmlToPdfA(html: string): Promise<Uint8Array> {
  const id = randomUUID();
  const htmlPath = join(tmpdir(), `ct-packet-${id}.html`);
  const pdfPath = join(tmpdir(), `ct-packet-${id}.pdf`);
  const pdfaPath = join(tmpdir(), `ct-packet-${id}-pdfa.pdf`);

  try {
    await writeFile(htmlPath, html, 'utf8');

    await execFileAsync(
      'wkhtmltopdf',
      [
        '--quiet',
        '--encoding',
        'utf-8',
        // Block wkhtmltopdf from reading local files / following file: and
        // intranet references embedded in the (Worker-supplied) HTML. Without
        // this, crafted packet HTML could exfiltrate container files or hit
        // internal endpoints (SSRF). Evidence-packet HTML is self-contained, so
        // disabling local-file access does not affect a normal render.
        '--disable-local-file-access',
        // Attacker-influenced packet HTML must not execute script or fetch
        // remote resources during render (issue #65).
        '--disable-javascript',
        '--disable-external-links',
        '--no-images',
        '--print-media-type',
        '--page-size',
        'A4',
        '--margin-top',
        '20mm',
        '--margin-bottom',
        '20mm',
        '--margin-left',
        '22mm',
        '--margin-right',
        '22mm',
        htmlPath,
        pdfPath,
      ],
      { maxBuffer: 16 * 1024 * 1024 }
    );

    await execFileAsync(
      'gs',
      [
        '-dPDFA=2',
        '-dBATCH',
        '-dNOPAUSE',
        '-dNOOUTERSAVE',
        '-sProcessColorModel=DeviceRGB',
        '-sDEVICE=pdfwrite',
        '-dPDFACompatibilityPolicy=1',
        `-sOutputFile=${pdfaPath}`,
        pdfPath,
      ],
      { maxBuffer: 16 * 1024 * 1024 }
    );

    const bytes = await readFile(pdfaPath);
    return new Uint8Array(bytes);
  } finally {
    await Promise.all(
      [htmlPath, pdfPath, pdfaPath].map((path) => unlink(path).catch(() => undefined))
    );
  }
}

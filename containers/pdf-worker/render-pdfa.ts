/**
 * HTML → PDF → PDF/A-2b via wkhtmltopdf + Ghostscript (§8.1.2).
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, readdir } from 'node:fs/promises';
import { unlink, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SRGB_ICC_CANDIDATES = [
  process.env.PDFA_SRGB_ICC_PROFILE,
  '/usr/share/color/icc/colord/sRGB.icc',
  '/usr/share/color/icc/icc/sRGB.icc',
].filter((p): p is string => typeof p === 'string' && p.length > 0);

async function ghostscriptBundledSrgbProfile(): Promise<string | null> {
  const base = '/usr/share/ghostscript';
  try {
    const versions = await readdir(base);
    for (const version of versions.sort().reverse()) {
      const candidate = join(base, version, 'Resource/ColorProfiles/sRGB.icc');
      try {
        await access(candidate);
        return candidate;
      } catch {
        // try older ghostscript tree
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function resolveSrgbIccProfile(): Promise<string | null> {
  const bundled = await ghostscriptBundledSrgbProfile();
  if (bundled) return bundled;
  for (const path of SRGB_ICC_CANDIDATES) {
    try {
      await access(path);
      return path;
    } catch {
      // try next candidate
    }
  }
  return null;
}

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

    const iccProfile = await resolveSrgbIccProfile();
    if (!iccProfile) {
      throw new Error(
        'sRGB ICC profile not found (install icc-profiles-free or ghostscript Resource/ColorProfiles)'
      );
    }
    const gsArgs = [
      '-dPDFA=2',
      '-dBATCH',
      '-dNOPAUSE',
      '-dNOOUTERSAVE',
      '-sProcessColorModel=DeviceRGB',
      '-sDEVICE=pdfwrite',
      '-dPDFACompatibilityPolicy=1',
      '-dEmbedAllFonts=true',
      '-dSubsetFonts=true',
      '-sColorConversionStrategy=UseDeviceIndependentColor',
      `-sOutputICCProfile=${iccProfile}`,
    ];
    gsArgs.push(`-sOutputFile=${pdfaPath}`, pdfPath);

    await execFileAsync('gs', gsArgs, { maxBuffer: 16 * 1024 * 1024 });

    const bytes = await readFile(pdfaPath);
    return new Uint8Array(bytes);
  } finally {
    await Promise.all(
      [htmlPath, pdfPath, pdfaPath].map((path) => unlink(path).catch(() => undefined))
    );
  }
}

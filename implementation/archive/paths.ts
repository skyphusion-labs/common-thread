/**
 * Content-addressed path derivation for archive storage.
 *
 * Paths follow the convention: sha256/ab/cd/<full-hash>[.ext]
 *
 * The two-level directory prefix (first two pairs of hex chars) avoids
 * filesystem and object-store performance problems with directories
 * containing millions of files. With 256 first-level prefixes and 256
 * second-level prefixes per first-level, a billion artifacts spread
 * evenly across ~65,000 leaf directories.
 *
 * The extension is preserved for human convenience but is not part of
 * the content address: two files with the same bytes but different
 * extensions resolve to different paths, even though the methodology
 * treats them as the same artifact.
 *
 * See methodology paper §3.1.1 and §5.4.1.
 */

import { isValidSha256Hex } from './hash';

/**
 * Derive the content-addressed path for a SHA-256 hash.
 *
 * @param hash - SHA-256 hex string, lowercase, 64 characters
 * @param extension - Optional file extension (with or without leading dot)
 * @returns Path of the form sha256/ab/cd/<full-hash>[.ext]
 * @throws Error if the hash is not a valid SHA-256 hex string
 */
export function pathForHash(hash: string, extension?: string): string {
  if (!isValidSha256Hex(hash)) {
    throw new Error(`Invalid SHA-256 hash: ${hash}`);
  }

  const prefix1 = hash.substring(0, 2);
  const prefix2 = hash.substring(2, 4);
  const ext = extension ? `.${extension.replace(/^\./, '')}` : '';

  return `sha256/${prefix1}/${prefix2}/${hash}${ext}`;
}

/**
 * Extract the SHA-256 hash from a content-addressed path.
 *
 * @param path - A path of the form sha256/ab/cd/<full-hash>[.ext]
 * @returns The 64-character hash, or null if the path doesn't match the format
 */
export function hashFromPath(path: string): string | null {
  const match = path.match(/^sha256\/[0-9a-f]{2}\/[0-9a-f]{2}\/([0-9a-f]{64})(?:\.[^/]*)?$/);
  return match ? match[1] : null;
}

/**
 * Caller-chosen investigation ids (#282). Letters, digits, `.` `_` `-`,
 * 1-64 chars, must start alphanumeric. Quote / CR/LF / `/` cannot appear,
 * so the id is safe in R2 keys and Content-Disposition filenames.
 */
export const INVESTIGATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function isValidInvestigationId(investigationId: string): boolean {
  return INVESTIGATION_ID_PATTERN.test(investigationId);
}

/**
 * Validate an investigation id for use in R2 object keys and create.
 *
 * @throws Error when the id is empty or outside the allowlist
 */
export function assertSafeInvestigationId(investigationId: string): void {
  if (!isValidInvestigationId(investigationId)) {
    throw new Error(
      investigationId && investigationId.trim().length > 0
        ? `Invalid investigationId for archive path: ${investigationId}`
        : 'investigationId is required'
    );
  }
}

/** Filename token: strip anything that can break Content-Disposition. */
export function safeFilenameToken(raw: string, fallback = 'x'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 64);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function packetPdfFilename(investigationId: string, runId: string): string {
  return `common-thread-${safeFilenameToken(investigationId)}-run-${safeFilenameToken(runId)}.pdf`;
}

/**
 * Per-investigation manifest path. Manifests are stored separately so
 * collection metadata cannot leak across investigation boundaries.
 */
export function investigationManifestPath(investigationId: string): string {
  assertSafeInvestigationId(investigationId);
  return `investigations/${investigationId}/manifest.jsonl`;
}

/** Sidecar signature log for a per-investigation manifest. */
export function investigationSignaturesPath(investigationId: string): string {
  return `${investigationManifestPath(investigationId)}.sigs.jsonl`;
}

/**
 * Map a stored artifact's MIME type to the file extension the archive
 * writers use for its content-addressed path.
 *
 * The content address is the hash (§3.1); the extension is only a path
 * suffix (see pathForHash). Writers store artifacts with an extension
 * derived from the artifact type, but the manifest entry records the
 * mimeType, not the extension. This lets a reader reconstruct the suffix
 * from the recorded mimeType so it can locate the object the writer
 * stored. Returns undefined for an unknown or absent mimeType, in which
 * case the caller should fall back to the bare-hash path.
 *
 * Any parameters on the mimeType (e.g. '; charset=utf-8') are ignored.
 */
export function extensionForMimeType(mimeType?: string): string | undefined {
  if (!mimeType) return undefined;
  const base = mimeType.split(';')[0].trim().toLowerCase();
  switch (base) {
    case 'application/json':
      return 'json';
    case 'text/html':
      return 'html';
    case 'text/plain':
      return 'txt';
    case 'text/csv':
      return 'csv';
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return undefined;
  }
}

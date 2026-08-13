/**
 * Sanitize ingest / attribution job error_message before persist or serve (#282).
 *
 * Token holders can read job rows. Raw driver / SQL strings must not leak
 * through that channel. Known product messages stay; everything that looks
 * like internals becomes a generic line.
 */

export const GENERIC_JOB_ERROR = 'Job failed. Retry or check operator logs.';

export const MAX_JOB_ERROR_LEN = 4000;

const INTERNAL =
  /host\s*=|password\s*=|user\s*=|ER_[A-Z0-9_]+|mysql2?|SQLSTATE|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|Access denied for user|connection string|Hyperdrive|socket hang up|node_modules\/|at \S+\s+\(/i;

export function sanitizeJobErrorMessage(raw: unknown): string {
  const text =
    typeof raw === 'string'
      ? raw
      : raw instanceof Error
        ? raw.message
        : String(raw ?? '');
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return GENERIC_JOB_ERROR;
  if (INTERNAL.test(trimmed)) return GENERIC_JOB_ERROR;
  return trimmed.slice(0, MAX_JOB_ERROR_LEN);
}

/** Serve path: keep null (completed jobs) and still redact leaked internals. */
export function publicJobErrorMessage(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string' && raw.trim().length === 0) return null;
  return sanitizeJobErrorMessage(raw);
}

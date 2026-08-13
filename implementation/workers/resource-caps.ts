/**
 * Backend hard caps for resource-bounded surfaces (#189).
 *
 * Defense-in-depth behind WAF / rate limits: a single authenticated request
 * can still be pathologically large (seed count, ingest payload, O(n²)
 * attribution fan-out). Caps are wrangler string vars so self-hosters can
 * raise them; unset vars use public-safe defaults.
 *
 * Error codes are stable machine-readable strings (same pattern as
 * `byok_required`): clients branch on `error`, not prose.
 */

/** Active seeds per investigation (default). C(50,2) = 1225 pairs. */
export const DEFAULT_MAX_SEED_ACCOUNTS = 50;

/** Items accepted in one Apify ingest call (default). */
export const DEFAULT_MAX_INGEST_ITEMS = 5000;

/**
 * Canonical ordered pairs per attribution run (default).
 * Aligned with {@link DEFAULT_MAX_SEED_ACCOUNTS}: n*(n-1)/2 for n=50.
 */
export const DEFAULT_MAX_ATTRIBUTION_PAIRS = 1225;

/** Unauthenticated investigation creates per client IP per window (#282). */
export const DEFAULT_MAX_INVESTIGATION_CREATES_PER_WINDOW = 20;

/** Sliding window for the create cap, seconds. */
export const DEFAULT_INVESTIGATION_CREATE_WINDOW_SECONDS = 600;

export type ResourceCapName =
  | 'MAX_SEED_ACCOUNTS'
  | 'MAX_INGEST_ITEMS'
  | 'MAX_ATTRIBUTION_PAIRS'
  | 'MAX_INVESTIGATION_CREATES_PER_WINDOW';

export interface ResourceCaps {
  maxSeedAccounts: number;
  maxIngestItems: number;
  maxAttributionPairs: number;
}

/**
 * Parse a wrangler string var as a positive integer cap.
 * Unset / empty / non-positive / non-numeric → `fallback`.
 */
export function parsePositiveIntCap(
  value: string | undefined,
  fallback: number
): number {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  if (trimmed === '') return fallback;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return fallback;
  return n;
}

export function resolveResourceCaps(env: {
  MAX_SEED_ACCOUNTS?: string;
  MAX_INGEST_ITEMS?: string;
  MAX_ATTRIBUTION_PAIRS?: string;
}): ResourceCaps {
  return {
    maxSeedAccounts: parsePositiveIntCap(
      env.MAX_SEED_ACCOUNTS,
      DEFAULT_MAX_SEED_ACCOUNTS
    ),
    maxIngestItems: parsePositiveIntCap(
      env.MAX_INGEST_ITEMS,
      DEFAULT_MAX_INGEST_ITEMS
    ),
    maxAttributionPairs: parsePositiveIntCap(
      env.MAX_ATTRIBUTION_PAIRS,
      DEFAULT_MAX_ATTRIBUTION_PAIRS
    ),
  };
}

/** Canonical pair count for n accounts (matches reasoner/pair runners). */
export function canonicalPairCount(accountCount: number): number {
  if (accountCount < 2) return 0;
  return (accountCount * (accountCount - 1)) / 2;
}

export type ResourceCapErrorCode =
  | 'seed_cap_exceeded'
  | 'ingest_cap_exceeded'
  | 'pair_cap_exceeded'
  | 'create_cap_exceeded';

export interface ResourceCapErrorBody {
  error: ResourceCapErrorCode;
  message: string;
  limit: number;
  attempted: number;
}

export function seedCapExceeded(limit: number, attempted: number): ResourceCapErrorBody {
  return {
    error: 'seed_cap_exceeded',
    message: `Active seed account limit is ${limit}; investigation already has ${attempted}. Remove seeds or raise MAX_SEED_ACCOUNTS.`,
    limit,
    attempted,
  };
}

export function ingestCapExceeded(limit: number, attempted: number): ResourceCapErrorBody {
  return {
    error: 'ingest_cap_exceeded',
    message: `Ingest item limit is ${limit} per request; received ${attempted}. Split the upload or raise MAX_INGEST_ITEMS.`,
    limit,
    attempted,
  };
}

export function pairCapExceeded(limit: number, attempted: number): ResourceCapErrorBody {
  return {
    error: 'pair_cap_exceeded',
    message: `Attribution pair limit is ${limit}; this run would process ${attempted} pairs. Narrow accountFilter, remove seeds, or raise MAX_ATTRIBUTION_PAIRS.`,
    limit,
    attempted,
  };
}

export function createCapExceeded(limit: number, attempted: number): ResourceCapErrorBody {
  return {
    error: 'create_cap_exceeded',
    message: `Investigation create limit is ${limit} per client in the current window. Wait and retry or raise MAX_INVESTIGATION_CREATES_PER_WINDOW.`,
    limit,
    attempted,
  };
}

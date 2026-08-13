/**
 * Bounded nested collect for ingest parsers (#280).
 *
 * Wrapper objects (`{ items: [ { items: [ ... 1e6 ] } ] }`) used to count
 * as one ingest item, then each platform `collect` walked them with no
 * depth or count limit. Cap both here so one authenticated upload cannot
 * stack-overflow the Worker or the VPC extractors.
 */

import { DEFAULT_MAX_INGEST_ITEMS } from '../workers/resource-caps';
import { isRecord } from './platform-detect';

/** Maximum wrapper nesting the ingest walk will descend. */
export const MAX_COLLECT_DEPTH = 4;

/** In-app JSON body cap. CF request size is a backstop, not a product limit. */
export const DEFAULT_MAX_JSON_BODY_BYTES = 8 * 1024 * 1024;

/** Wrapper keys every platform collect already walked. */
export const DEFAULT_NESTED_KEYS = [
  'posts',
  'items',
  'data',
  'results',
  'videos',
  'comments',
  'statuses',
] as const;

export class CollectLimitError extends Error {
  override name = 'CollectLimitError';
  constructor(
    public readonly limit: number,
    public readonly attempted: number
  ) {
    super(
      `Ingest item limit is ${limit}; nested collect would process at least ${attempted}`
    );
  }
}

export interface CollectState {
  limit: number;
  maxDepth: number;
  depth: number;
  truncated: boolean;
}

export function newCollectState(
  limit = DEFAULT_MAX_INGEST_ITEMS,
  maxDepth = MAX_COLLECT_DEPTH
): CollectState {
  return { limit, maxDepth, depth: 0, truncated: false };
}

export function jsonBodyTooLarge(
  byteLength: number,
  limit = DEFAULT_MAX_JSON_BODY_BYTES
): boolean {
  return byteLength > limit;
}

/**
 * Walk arrays and known wrapper objects, pushing normalized leaves until
 * `limit` or `maxDepth`. Sets `truncated` when either bound is hit.
 */
export function boundedCollect<T>(
  value: unknown,
  out: T[],
  normalize: (obj: Record<string, unknown>) => T | null,
  options?: {
    extraKeys?: readonly string[];
    state?: CollectState;
    continueAfterMatch?: boolean;
  }
): CollectState {
  const state = options?.state ?? newCollectState();
  const keys = options?.extraKeys ?? DEFAULT_NESTED_KEYS;
  walk(value, out, normalize, state, keys, options?.continueAfterMatch ?? false);
  return state;
}

function walk<T>(
  value: unknown,
  out: T[],
  normalize: (obj: Record<string, unknown>) => T | null,
  state: CollectState,
  keys: readonly string[],
  continueAfterMatch: boolean
): void {
  if (!value || state.truncated) return;
  if (state.depth >= state.maxDepth) {
    state.truncated = true;
    return;
  }
  if (Array.isArray(value)) {
    state.depth += 1;
    try {
      for (const item of value) {
        if (state.truncated) return;
        walk(item, out, normalize, state, keys, continueAfterMatch);
      }
    } finally {
      state.depth -= 1;
    }
    return;
  }
  if (!isRecord(value)) return;

  const item = normalize(value);
  if (item) {
    if (out.length >= state.limit) {
      state.truncated = true;
      return;
    }
    out.push(item);
    if (!continueAfterMatch) return;
  }

  state.depth += 1;
  try {
    for (const key of keys) {
      if (state.truncated) return;
      const nested = value[key];
      if (!Array.isArray(nested)) continue;
      for (const child of nested) {
        if (state.truncated) return;
        walk(child, out, normalize, state, keys, continueAfterMatch);
      }
    }
  } finally {
    state.depth -= 1;
  }
}

/**
 * Flatten ingest-door wrappers (`items` / `data` / `posts` / `results`) so
 * `{ items: [ { items: [ ...N ] } ] }` counts as N leaves, not 1.
 */
export function flattenIngestItems(
  payload: unknown,
  limit: number,
  maxDepth = MAX_COLLECT_DEPTH
): { items: unknown[]; truncated: boolean } {
  const items: unknown[] = [];
  const wrapperKeys = ['items', 'data', 'posts', 'results'] as const;
  flatten(payload, items, limit, 0, maxDepth, wrapperKeys);
  return { items, truncated: items.length > limit };
}

function flatten(
  value: unknown,
  out: unknown[],
  limit: number,
  depth: number,
  maxDepth: number,
  wrapperKeys: readonly string[]
): void {
  if (out.length > limit || value == null) return;
  if (depth >= maxDepth) {
    if (isRecord(value) || Array.isArray(value)) out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (out.length > limit) return;
      flatten(item, out, limit, depth + 1, maxDepth, wrapperKeys);
    }
    return;
  }
  if (!isRecord(value)) return;
  const nested = firstWrapperArray(value, wrapperKeys);
  if (nested) {
    flatten(nested, out, limit, depth + 1, maxDepth, wrapperKeys);
    return;
  }
  out.push(value);
}

function firstWrapperArray(
  obj: Record<string, unknown>,
  wrapperKeys: readonly string[]
): unknown[] | null {
  for (const key of wrapperKeys) {
    const nested = obj[key];
    if (Array.isArray(nested) && nested.length > 0) return nested;
  }
  return null;
}

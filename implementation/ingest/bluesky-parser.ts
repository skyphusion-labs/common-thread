/**
 * Parse Apify Bluesky exports (fatihtahta / cryptosignals field names)
 * and native AT Proto post rows into per-account listings.
 *
 * Real actor fields: text, createdAt, authorHandle / author.handle, uri (at://),
 * url / postUrl on bsky.app.
 */

import { flattenPayloadItems, isRecord } from './platform-detect';
import { parseTimestamp } from '../extractors/temporal/helpers';
import { boundedCollect } from './collect-limit';

export interface BlueskyPost {
  text: string;
  createdAt: string;
  handle: string;
  uri?: string;
  url?: string;
}

export interface BlueskyAccountListing {
  account: string;
  posts: BlueskyPost[];
}

export function blueskyHandleOf(obj: Record<string, unknown>): string | null {
  const nested = isRecord(obj.author) ? obj.author : null;
  const raw =
    (typeof obj.authorHandle === 'string' && obj.authorHandle) ||
    (nested && typeof nested.handle === 'string' && nested.handle) ||
    (typeof obj.handle === 'string' && obj.handle) ||
    null;
  if (!raw) return null;
  const handle = raw.replace(/^@/, '').trim().toLowerCase();
  return handle.length > 0 ? handle : null;
}

export function extractBlueskyPosts(payload: unknown): BlueskyPost[] {
  const out: BlueskyPost[] = [];
  for (const item of flattenPayloadItems(payload)) {
    boundedCollect(item, out, normalize);
  }
  return out;
}

export function extractBlueskyHandles(payload: unknown): string[] {
  const seen = new Set<string>();
  for (const post of extractBlueskyPosts(payload)) seen.add(post.handle);
  return [...seen].sort();
}

export function aggregateBlueskyByAccount(payload: unknown): BlueskyAccountListing[] {
  const by = new Map<string, BlueskyPost[]>();
  for (const post of extractBlueskyPosts(payload)) {
    let list = by.get(post.handle);
    if (!list) {
      list = [];
      by.set(post.handle, list);
    }
    list.push(post);
  }
  return [...by.entries()]
    .map(([account, posts]) => ({ account, posts }))
    .sort((a, b) => a.account.localeCompare(b.account));
}

export function parseBlueskyListingBytes(bytes: Uint8Array): BlueskyPost[] | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    const posts = extractBlueskyPosts(parsed);
    return posts.length > 0 ? posts : null;
  } catch {
    return null;
  }
}

function normalize(obj: Record<string, unknown>): BlueskyPost | null {
  const handle = blueskyHandleOf(obj);
  const text = typeof obj.text === 'string' ? obj.text.trim() : '';
  if (!handle || text.length === 0) return null;
  const createdRaw =
    (typeof obj.createdAt === 'string' && obj.createdAt) ||
    (typeof obj.indexedAt === 'string' && obj.indexedAt) ||
    (typeof obj.created_at === 'string' && obj.created_at) ||
    '';
  if (!createdRaw || parseTimestamp(createdRaw) === null) return null;
  const url =
    (typeof obj.url === 'string' && obj.url) ||
    (typeof obj.postUrl === 'string' && obj.postUrl) ||
    undefined;
  const uri = typeof obj.uri === 'string' ? obj.uri : undefined;
  return { text, createdAt: createdRaw, handle, uri, url };
}

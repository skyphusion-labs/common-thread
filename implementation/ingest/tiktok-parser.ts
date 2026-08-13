/**
 * Parse Apify TikTok exports (clockworks/tiktok-scraper field names)
 * into per-account listings.
 *
 * Real actor fields: text (caption), createTimeISO / createTime,
 * authorMeta.name, webVideoUrl, id.
 */

import { flattenPayloadItems, isRecord } from './platform-detect';
import { parseTimestamp } from '../extractors/temporal/helpers';
import { boundedCollect } from './collect-limit';

export interface TikTokPost {
  text: string;
  createdAt: string;
  handle: string;
  url?: string;
  id?: string;
}

export interface TikTokAccountListing {
  account: string;
  posts: TikTokPost[];
}

export function tiktokHandleOf(obj: Record<string, unknown>): string | null {
  const meta = isRecord(obj.authorMeta) ? obj.authorMeta : null;
  const raw =
    (meta && typeof meta.name === 'string' && meta.name) ||
    (typeof obj.handle === 'string' && obj.handle) ||
    (typeof obj.authorName === 'string' && obj.authorName) ||
    (typeof obj.uniqueId === 'string' && obj.uniqueId) ||
    null;
  if (!raw) return null;
  const handle = raw.replace(/^@/, '').trim().toLowerCase();
  return handle.length > 0 ? handle : null;
}

export function extractTikTokPosts(payload: unknown): TikTokPost[] {
  const out: TikTokPost[] = [];
  for (const item of flattenPayloadItems(payload)) {
    boundedCollect(item, out, normalize);
  }
  return out;
}

export function extractTikTokHandles(payload: unknown): string[] {
  const seen = new Set<string>();
  for (const post of extractTikTokPosts(payload)) seen.add(post.handle);
  return [...seen].sort();
}

export function aggregateTikTokByAccount(payload: unknown): TikTokAccountListing[] {
  const by = new Map<string, TikTokPost[]>();
  for (const post of extractTikTokPosts(payload)) {
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

export function parseTikTokListingBytes(bytes: Uint8Array): TikTokPost[] | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    const posts = extractTikTokPosts(parsed);
    return posts.length > 0 ? posts : null;
  } catch {
    return null;
  }
}

function normalize(obj: Record<string, unknown>): TikTokPost | null {
  const handle = tiktokHandleOf(obj);
  const text = typeof obj.text === 'string' ? obj.text.trim() : '';
  if (!handle || text.length === 0) return null;
  const createdRaw = createdAtOf(obj);
  if (!createdRaw) return null;
  const url =
    (typeof obj.webVideoUrl === 'string' && obj.webVideoUrl) ||
    (typeof obj.submittedVideoUrl === 'string' && obj.submittedVideoUrl) ||
    (typeof obj.url === 'string' && obj.url) ||
    undefined;
  const id = obj.id != null ? String(obj.id) : undefined;
  return { text, createdAt: createdRaw, handle, url, id };
}

function createdAtOf(obj: Record<string, unknown>): string | null {
  if (typeof obj.createTimeISO === 'string' && parseTimestamp(obj.createTimeISO) !== null) {
    return obj.createTimeISO;
  }
  if (typeof obj.createdAt === 'string' && parseTimestamp(obj.createdAt) !== null) {
    return obj.createdAt;
  }
  if (typeof obj.createTime === 'number') {
    const ms = parseTimestamp(obj.createTime);
    return ms !== null ? new Date(ms).toISOString() : null;
  }
  if (typeof obj.createTime === 'string' && /^\d+$/.test(obj.createTime)) {
    const ms = parseTimestamp(Number(obj.createTime));
    return ms !== null ? new Date(ms).toISOString() : null;
  }
  return null;
}

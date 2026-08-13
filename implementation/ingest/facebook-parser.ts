/**
 * Parse Apify Facebook public-page exports (apify/facebook-posts-scraper)
 * into per-account listings.
 *
 * Real actor fields: text, time / timestamp, user.name / pageName,
 * facebookUrl / url. Public pages only; no session cookies.
 * Likes, friends lists, and emails are not ingested.
 */

import { flattenPayloadItems, isRecord } from './platform-detect';
import { parseTimestamp } from '../extractors/temporal/helpers';
import { boundedCollect } from './collect-limit';

export interface FacebookPost {
  text: string;
  createdAt: string;
  handle: string;
  url?: string;
}

export interface FacebookAccountListing {
  account: string;
  posts: FacebookPost[];
}

export function facebookHandleOf(obj: Record<string, unknown>): string | null {
  const user = isRecord(obj.user) ? obj.user : null;
  const page = obj.pageName;
  const pageName =
    (typeof page === 'string' && page) ||
    (isRecord(page) && typeof page.name === 'string' && page.name) ||
    null;
  const raw =
    pageName ||
    (user && typeof user.name === 'string' && user.name) ||
    (typeof obj.handle === 'string' && obj.handle) ||
    null;
  if (!raw) return null;
  const handle = raw.trim().toLowerCase();
  return handle.length > 0 ? handle : null;
}

export function extractFacebookPosts(payload: unknown): FacebookPost[] {
  const out: FacebookPost[] = [];
  for (const item of flattenPayloadItems(payload)) {
    boundedCollect(item, out, normalize);
  }
  return out;
}

export function extractFacebookHandles(payload: unknown): string[] {
  const seen = new Set<string>();
  for (const post of extractFacebookPosts(payload)) seen.add(post.handle);
  return [...seen].sort();
}

export function aggregateFacebookByAccount(payload: unknown): FacebookAccountListing[] {
  const by = new Map<string, FacebookPost[]>();
  for (const post of extractFacebookPosts(payload)) {
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

export function parseFacebookListingBytes(bytes: Uint8Array): FacebookPost[] | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    const posts = extractFacebookPosts(parsed);
    return posts.length > 0 ? posts : null;
  } catch {
    return null;
  }
}

function normalize(obj: Record<string, unknown>): FacebookPost | null {
  const handle = facebookHandleOf(obj);
  const text = typeof obj.text === 'string' ? obj.text.trim() : '';
  if (!handle || text.length === 0) return null;
  const createdRaw = createdAtOf(obj);
  if (!createdRaw) return null;
  const url =
    (typeof obj.facebookUrl === 'string' && obj.facebookUrl) ||
    (typeof obj.url === 'string' && obj.url) ||
    (typeof obj.topLevelUrl === 'string' && obj.topLevelUrl) ||
    undefined;
  return { text, createdAt: createdRaw, handle, url };
}

function createdAtOf(obj: Record<string, unknown>): string | null {
  if (typeof obj.time === 'string' && parseTimestamp(obj.time) !== null) return obj.time;
  if (typeof obj.createdAt === 'string' && parseTimestamp(obj.createdAt) !== null) {
    return obj.createdAt;
  }
  if (typeof obj.timestamp === 'number') {
    const ms = parseTimestamp(obj.timestamp);
    return ms !== null ? new Date(ms).toISOString() : null;
  }
  return null;
}

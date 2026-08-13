/**
 * Parse Apify Mastodon exports (newpo/mastodon-scraper field names)
 * and native Mastodon API status rows into per-account listings.
 *
 * Real actor fields: text, createdAt / created_at, author.acct / acct,
 * username, instance, url, uri. Boosts are not authored text.
 *
 * Federated hosts stay honest: we do not treat every instance URL as known.
 * Detection uses mastodon.social, acct/instance hints, or /users/.../statuses/.
 */

import { flattenPayloadItems, isRecord } from './platform-detect';
import { parseTimestamp } from '../extractors/temporal/helpers';

export interface MastodonPost {
  text: string;
  createdAt: string;
  handle: string;
  url?: string;
  uri?: string;
  instance?: string;
}

export interface MastodonAccountListing {
  account: string;
  posts: MastodonPost[];
}

export function mastodonAcctOf(obj: Record<string, unknown>): string | null {
  const nestedAuthor = isRecord(obj.author) ? obj.author : null;
  const nestedAccount = isRecord(obj.account) ? obj.account : null;
  const rawAcct =
    (typeof obj.acct === 'string' && obj.acct) ||
    (typeof obj.handle === 'string' && obj.handle) ||
    (nestedAuthor && typeof nestedAuthor.acct === 'string' && nestedAuthor.acct) ||
    (nestedAccount && typeof nestedAccount.acct === 'string' && nestedAccount.acct) ||
    null;
  const username =
    (typeof obj.username === 'string' && obj.username) ||
    (nestedAuthor && typeof nestedAuthor.username === 'string' && nestedAuthor.username) ||
    (nestedAccount && typeof nestedAccount.username === 'string' && nestedAccount.username) ||
    null;
  const instance =
    (typeof obj.instance === 'string' && obj.instance) ||
    instanceFromUrl(
      (typeof obj.url === 'string' && obj.url) ||
        (nestedAuthor && typeof nestedAuthor.url === 'string' && nestedAuthor.url) ||
        (nestedAccount && typeof nestedAccount.url === 'string' && nestedAccount.url) ||
        null
    );

  let acct = rawAcct ? rawAcct.replace(/^@/, '').trim().toLowerCase() : '';
  if (acct && !acct.includes('@') && instance) {
    acct = `${acct}@${instance.replace(/^@/, '').trim().toLowerCase()}`;
  } else if (!acct && username && instance) {
    acct = `${username.replace(/^@/, '').trim().toLowerCase()}@${instance.replace(/^@/, '').trim().toLowerCase()}`;
  } else if (!acct && username) {
    acct = username.replace(/^@/, '').trim().toLowerCase();
  }
  return acct.length > 0 ? acct : null;
}

export function extractMastodonPosts(payload: unknown): MastodonPost[] {
  const out: MastodonPost[] = [];
  for (const item of flattenPayloadItems(payload)) collect(item, out);
  return out;
}

export function extractMastodonHandles(payload: unknown): string[] {
  const seen = new Set<string>();
  for (const post of extractMastodonPosts(payload)) seen.add(post.handle);
  return [...seen].sort();
}

export function aggregateMastodonByAccount(payload: unknown): MastodonAccountListing[] {
  const by = new Map<string, MastodonPost[]>();
  for (const post of extractMastodonPosts(payload)) {
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

export function parseMastodonListingBytes(bytes: Uint8Array): MastodonPost[] | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    const posts = extractMastodonPosts(parsed);
    return posts.length > 0 ? posts : null;
  } catch {
    return null;
  }
}

function collect(value: unknown, out: MastodonPost[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collect(item, out);
    return;
  }
  if (!isRecord(value)) return;
  const post = normalize(value);
  if (post) {
    out.push(post);
    return;
  }
  for (const key of ['posts', 'items', 'data', 'results', 'statuses']) {
    if (Array.isArray(value[key])) {
      for (const child of value[key] as unknown[]) collect(child, out);
    }
  }
}

function normalize(obj: Record<string, unknown>): MastodonPost | null {
  if (obj.isBoost === true) return null;
  if (isRecord(obj.reblog)) return null;
  const handle = mastodonAcctOf(obj);
  const text = authoredText(obj);
  if (!handle || text.length === 0) return null;
  const createdRaw =
    (typeof obj.createdAt === 'string' && obj.createdAt) ||
    (typeof obj.created_at === 'string' && obj.created_at) ||
    '';
  if (!createdRaw || parseTimestamp(createdRaw) === null) return null;
  const url = typeof obj.url === 'string' ? obj.url : undefined;
  const uri = typeof obj.uri === 'string' ? obj.uri : undefined;
  const instance =
    (typeof obj.instance === 'string' && obj.instance) ||
    instanceFromHandle(handle) ||
    instanceFromUrl(url ?? uri ?? null) ||
    undefined;
  return { text, createdAt: createdRaw, handle, url, uri, instance };
}

function authoredText(obj: Record<string, unknown>): string {
  if (typeof obj.text === 'string' && obj.text.trim().length > 0) {
    return obj.text.trim();
  }
  if (typeof obj.content === 'string' && obj.content.trim().length > 0) {
    return obj.content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  return '';
}

function instanceFromHandle(handle: string): string | undefined {
  const at = handle.lastIndexOf('@');
  if (at <= 0 || at === handle.length - 1) return undefined;
  return handle.slice(at + 1);
}

function instanceFromUrl(raw: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
    return host.length > 0 ? host : undefined;
  } catch {
    return undefined;
  }
}

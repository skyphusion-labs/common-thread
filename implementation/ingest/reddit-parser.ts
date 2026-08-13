/**
 * Parse Reddit listings (native API / Pushshift) and Apify Reddit scrapers
 * (trudax/reddit-scraper-lite and siblings) into per-account listing children.
 *
 * Temporal + stylometric Reddit extractors require native children
 * (`kind` t1/t3 + `data.created_utc` number). Apify rows use ISO `createdAt`
 * and `username` / `communityName`, so ingest normalizes before archive.
 */

import { flattenPayloadItems, isRecord } from './platform-detect';

export interface RedditListingChild {
  kind: 't1' | 't3';
  data: {
    author: string;
    created_utc: number;
    title?: string;
    selftext?: string;
    body?: string;
    subreddit?: string;
    id?: string;
    parent_id?: string;
  };
}

export interface RedditAccountListing {
  account: string;
  children: RedditListingChild[];
}

export function extractRedditHandles(payload: unknown): string[] {
  const seen = new Set<string>();
  for (const child of extractRedditChildren(payload)) {
    seen.add(child.data.author);
  }
  return [...seen].sort();
}

export function extractRedditChildren(payload: unknown): RedditListingChild[] {
  const out: RedditListingChild[] = [];
  collectReddit(payload, out);
  return out;
}

export function aggregateRedditByAccount(payload: unknown): RedditAccountListing[] {
  const byAccount = new Map<string, RedditListingChild[]>();
  for (const child of extractRedditChildren(payload)) {
    const account = child.data.author;
    let list = byAccount.get(account);
    if (!list) {
      list = [];
      byAccount.set(account, list);
    }
    list.push(child);
  }
  const listings: RedditAccountListing[] = [];
  for (const [account, children] of byAccount) {
    listings.push({ account, children });
  }
  listings.sort((a, b) => a.account.localeCompare(b.account));
  return listings;
}

function collectReddit(value: unknown, out: RedditListingChild[]): void {
  if (!value) return;
  if (Array.isArray(value)) {
    for (const item of value) collectReddit(item, out);
    return;
  }
  if (!isRecord(value)) return;

  if (value.kind === 'Listing' && isRecord(value.data) && Array.isArray(value.data.children)) {
    for (const child of value.data.children) collectReddit(child, out);
    return;
  }

  if ((value.kind === 't1' || value.kind === 't3') && isRecord(value.data)) {
    const child = fromNativeChild(value.kind, value.data);
    if (child) out.push(child);
    return;
  }

  const apify = fromApifyRow(value);
  if (apify) {
    out.push(apify);
    return;
  }

  if (typeof value.created_utc === 'number' && typeof redditAuthor(value) === 'string') {
    const child = fromNativeChild(inferKind(value), value);
    if (child) out.push(child);
    return;
  }

  for (const key of ['posts', 'comments', 'submissions', 'children', 'items', 'data']) {
    const nested = value[key];
    if (Array.isArray(nested)) {
      for (const item of nested) collectReddit(item, out);
    }
  }
}

function fromNativeChild(
  kind: string | undefined,
  data: Record<string, unknown>
): RedditListingChild | null {
  const author = redditAuthor(data);
  const created = createdUtcSeconds(data);
  if (!author || created == null) return null;
  const resolvedKind: 't1' | 't3' = kind === 't1' || inferKind(data) === 't1' ? 't1' : 't3';
  return {
    kind: resolvedKind,
    data: {
      author,
      created_utc: created,
      title: stringField(data, 'title'),
      selftext: stringField(data, 'selftext'),
      body: stringField(data, 'body'),
      subreddit: redditSubreddit(data),
      id: data.id != null ? String(data.id) : undefined,
      parent_id: stringField(data, 'parent_id'),
    },
  };
}

function fromApifyRow(obj: Record<string, unknown>): RedditListingChild | null {
  const username = redditAuthor(obj);
  if (!username) return null;
  const dataType = typeof obj.dataType === 'string' ? obj.dataType.toLowerCase() : '';
  const contentType = typeof obj.contentType === 'string' ? obj.contentType.toLowerCase() : '';
  const isComment =
    dataType === 'comment' ||
    contentType === 'comment' ||
    (typeof obj.body === 'string' && obj.title == null);
  const created = createdUtcSeconds(obj);
  if (created == null) return null;
  if (!stringField(obj, 'body') && !stringField(obj, 'title') && !stringField(obj, 'selftext')) {
    return null;
  }
  return {
    kind: isComment ? 't1' : 't3',
    data: {
      author: username,
      created_utc: created,
      title: stringField(obj, 'title'),
      selftext: isComment ? undefined : stringField(obj, 'selftext') ?? stringField(obj, 'body'),
      body: isComment ? stringField(obj, 'body') : undefined,
      subreddit: redditSubreddit(obj),
      id: obj.parsedId != null ? String(obj.parsedId) : obj.id != null ? String(obj.id) : undefined,
    },
  };
}

function redditAuthor(obj: Record<string, unknown>): string | null {
  const raw =
    (typeof obj.author === 'string' && obj.author) ||
    (typeof obj.username === 'string' && obj.username) ||
    (typeof obj.user === 'string' && obj.user) ||
    null;
  if (!raw) return null;
  const account = raw.replace(/^u\//, '').trim().toLowerCase();
  if (!account || account === '[deleted]' || account === 'automoderator') return null;
  return account;
}

function redditSubreddit(obj: Record<string, unknown>): string | undefined {
  const raw =
    stringField(obj, 'subreddit') ||
    stringField(obj, 'parsedCommunityName') ||
    stringField(obj, 'communityName');
  if (!raw) return undefined;
  return raw.replace(/^r\//, '').replace(/^\/r\//, '');
}

function createdUtcSeconds(obj: Record<string, unknown>): number | null {
  if (typeof obj.created_utc === 'number' && Number.isFinite(obj.created_utc)) {
    return obj.created_utc > 1e12 ? obj.created_utc / 1000 : obj.created_utc;
  }
  if (typeof obj.createdUtc === 'number' && Number.isFinite(obj.createdUtc)) {
    return obj.createdUtc > 1e12 ? obj.createdUtc / 1000 : obj.createdUtc;
  }
  for (const key of ['createdAt', 'created_at', 'scrapedAt']) {
    const raw = obj[key];
    if (typeof raw !== 'string') continue;
    const ms = Date.parse(raw);
    if (Number.isFinite(ms)) return ms / 1000;
  }
  return null;
}

function inferKind(obj: Record<string, unknown>): 't1' | 't3' | undefined {
  if (typeof obj.body === 'string' && obj.title == null) return 't1';
  if (typeof obj.title === 'string' || typeof obj.selftext === 'string') return 't3';
  if (typeof obj.parent_id === 'string') return 't1';
  return undefined;
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

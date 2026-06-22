/**
 * Parse Reddit listing artifacts into normalized post rows.
 *
 * Accepts native API Listings, bare Pushshift-style objects, Apify scraper
 * arrays (createdAt + title), and common wrapper keys (posts, comments,
 * submissions, children).
 */

import {
  isRedditPostLike,
  redditCreatedAtRaw,
  redditPostText,
  redditSubredditName,
  isRedditCommentPost,
  type RedditPostLike,
} from './reddit-post-fields';

export interface ParsedRedditItem {
  text: string;
  createdAt: string | number;
  subreddit?: string;
  isComment: boolean;
}

export function parseRedditListingBytes(bytes: Uint8Array): ParsedRedditItem[] | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    const collected: ParsedRedditItem[] = [];
    collectFrom(parsed, collected);
    return collected.length > 0 ? collected : null;
  } catch {
    return null;
  }
}

export function parseRedditListingData(data: unknown): ParsedRedditItem[] {
  const collected: ParsedRedditItem[] = [];
  collectFrom(data, collected);
  return collected;
}

function collectFrom(value: unknown, out: ParsedRedditItem[]): void {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const item of value) collectFrom(item, out);
    return;
  }

  if (typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;

  if (obj.kind === 'Listing' && obj.data && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>;
    if (Array.isArray(data.children)) {
      for (const child of data.children) collectFrom(child, out);
    }
    return;
  }

  if (typeof obj.kind === 'string' && obj.data && typeof obj.data === 'object') {
    const normalized = normalizeItem(obj.kind, obj.data as RedditPostLike);
    if (normalized) out.push(normalized);
    return;
  }

  if (looksLikeBarePost(obj)) {
    const kind =
      typeof obj.kind === 'string' ? inferKind(obj) ?? obj.kind : inferKind(obj);
    const normalized = normalizeItem(kind, obj as RedditPostLike);
    if (normalized) out.push(normalized);
    return;
  }

  for (const key of ['posts', 'comments', 'submissions', 'children', 'data']) {
    const candidate = obj[key];
    if (Array.isArray(candidate)) {
      for (const c of candidate) collectFrom(c, out);
    }
  }
}

function normalizeItem(
  kind: string | undefined,
  data: RedditPostLike
): ParsedRedditItem | null {
  const text = redditPostText(data);
  if (text.length === 0) return null;

  const createdAt = redditCreatedAtRaw(data);
  if (createdAt === undefined) return null;

  return {
    text,
    createdAt,
    subreddit: redditSubredditName(data),
    isComment: isRedditCommentPost(data, kind),
  };
}

function looksLikeBarePost(obj: Record<string, unknown>): boolean {
  if (isRedditPostLike(obj)) {
    if (typeof obj.created_utc === 'number') return true;
    if (typeof obj.created_utc === 'string') return true;
    if (typeof obj.createdAt === 'string') return true;
    return (
      typeof obj.body === 'string' ||
      typeof obj.title === 'string' ||
      typeof obj.selftext === 'string'
    );
  }
  return false;
}

function inferKind(obj: Record<string, unknown>): string | undefined {
  if (typeof obj.kind === 'string') {
    const k = obj.kind.toLowerCase();
    if (k === 't1' || k === 'comment') return 't1';
    if (k === 't3' || k === 'post') return 't3';
  }
  if (typeof obj.parent_id === 'string' || typeof obj.parentId === 'string') return 't1';
  if (typeof obj.body === 'string' && typeof obj.title !== 'string') return 't1';
  if (typeof obj.title === 'string') return 't3';
  return undefined;
}

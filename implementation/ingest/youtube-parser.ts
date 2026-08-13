/**
 * Parse Apify YouTube exports (streamers/youtube-scraper + comments scraper)
 * into per-account listings.
 *
 * Authored text is titles + descriptions + comments, not a tweet-like
 * timeline (paper §6.4.6). Real actor fields: title, text/description, date,
 * channelUsername, url; comments: comment, author, publishedTimeText, videoId.
 * Comments without a parseable timestamp still contribute stylometric text.
 */

import { flattenPayloadItems, isRecord } from './platform-detect';
import { parseTimestamp } from '../extractors/temporal/helpers';
import { boundedCollect } from './collect-limit';

export interface YouTubePost {
  text: string;
  createdAt: string;
  handle: string;
  url?: string;
  kind: 'video' | 'comment';
}

export interface YouTubeAccountListing {
  account: string;
  posts: YouTubePost[];
}

export function youtubeHandleOf(obj: Record<string, unknown>): string | null {
  const raw =
    (typeof obj.channelUsername === 'string' && obj.channelUsername) ||
    (typeof obj.handle === 'string' && obj.handle) ||
    (typeof obj.author === 'string' && obj.author) ||
    (typeof obj.channelName === 'string' && obj.channelName) ||
    null;
  if (!raw) return null;
  const handle = raw.replace(/^@/, '').trim().toLowerCase();
  return handle.length > 0 ? handle : null;
}

export function extractYouTubePosts(payload: unknown): YouTubePost[] {
  const out: YouTubePost[] = [];
  for (const item of flattenPayloadItems(payload)) {
    boundedCollect(item, out, normalize);
  }
  return out;
}

export function extractYouTubeHandles(payload: unknown): string[] {
  const seen = new Set<string>();
  for (const post of extractYouTubePosts(payload)) seen.add(post.handle);
  return [...seen].sort();
}

export function aggregateYouTubeByAccount(payload: unknown): YouTubeAccountListing[] {
  const by = new Map<string, YouTubePost[]>();
  for (const post of extractYouTubePosts(payload)) {
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

export function parseYouTubeListingBytes(bytes: Uint8Array): YouTubePost[] | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    const posts = extractYouTubePosts(parsed);
    return posts.length > 0 ? posts : null;
  } catch {
    return null;
  }
}

function normalize(obj: Record<string, unknown>): YouTubePost | null {
  const handle = youtubeHandleOf(obj);
  const text = authoredText(obj);
  if (!handle || text.length === 0) return null;
  const kind: YouTubePost['kind'] =
    typeof obj.comment === 'string' && obj.comment.trim().length > 0 ? 'comment' : 'video';
  const createdRaw = createdAtOf(obj);
  const url =
    (typeof obj.url === 'string' && obj.url) ||
    (typeof obj.pageUrl === 'string' && obj.pageUrl) ||
    undefined;
  return { text, createdAt: createdRaw ?? '', handle, url, kind };
}

function authoredText(obj: Record<string, unknown>): string {
  if (typeof obj.comment === 'string' && obj.comment.trim().length > 0) {
    return obj.comment.trim();
  }
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  const desc =
    (typeof obj.text === 'string' && obj.text.trim()) ||
    (typeof obj.description === 'string' && obj.description.trim()) ||
    '';
  return [title, desc].filter((part) => part.length > 0).join('\n');
}

function createdAtOf(obj: Record<string, unknown>): string | null {
  for (const key of ['date', 'uploadDate', 'publishedAt', 'createTimeISO', 'createdAt']) {
    const raw = obj[key];
    if (typeof raw === 'string' && parseTimestamp(raw) !== null) return raw;
  }
  if (typeof obj.publishedTimeText === 'string' && parseTimestamp(obj.publishedTimeText) !== null) {
    return obj.publishedTimeText;
  }
  return null;
}

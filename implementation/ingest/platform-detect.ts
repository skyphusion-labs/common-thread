/**
 * Classify Apify (and native) export rows by platform.
 *
 * Used by the unified ingest door so a visitor can drop Twitter, Instagram,
 * or Reddit JSON without picking a route. Classification is per item so a
 * mixed upload splits into the matching pipelines.
 */

import { hostOf, hostMatches } from '../extractors/platform';
import { isInstagramPostLike } from './instagram-post-fields';

export type DetectedPlatform = 'twitter' | 'instagram' | 'reddit';

export interface SplitApifyPayload {
  twitter: unknown[];
  instagram: unknown[];
  reddit: unknown[];
  unknown: unknown[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function detectItemPlatform(item: unknown): DetectedPlatform | 'unknown' {
  if (!item || typeof item !== 'object') return 'unknown';
  const obj = item as Record<string, unknown>;

  if (isRedditItem(obj)) return 'reddit';
  if (isInstagramItem(obj)) return 'instagram';
  if (isTwitterItem(obj)) return 'twitter';
  return 'unknown';
}

export function splitApifyPayload(payload: unknown): SplitApifyPayload {
  const items = flattenPayloadItems(payload);
  const out: SplitApifyPayload = {
    twitter: [],
    instagram: [],
    reddit: [],
    unknown: [],
  };
  for (const item of items) {
    const platform = detectItemPlatform(item);
    if (platform === 'unknown') out.unknown.push(item);
    else out[platform].push(item);
  }
  return out;
}

export function flattenPayloadItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return payload == null ? [] : [payload];
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return [payload];
}

export function dominantProvider(
  split: SplitApifyPayload
): DetectedPlatform | 'mixed' | null {
  const present: DetectedPlatform[] = [];
  if (split.twitter.length > 0) present.push('twitter');
  if (split.instagram.length > 0) present.push('instagram');
  if (split.reddit.length > 0) present.push('reddit');
  if (present.length === 0) return null;
  if (present.length === 1) return present[0];
  return 'mixed';
}

function isRedditItem(obj: Record<string, unknown>): boolean {
  if (obj.kind === 'Listing' || obj.kind === 't1' || obj.kind === 't3') return true;
  if (typeof obj.created_utc === 'number' && (hasText(obj, 'body') || hasText(obj, 'title') || hasText(obj, 'selftext'))) {
    return true;
  }
  const dataType = typeof obj.dataType === 'string' ? obj.dataType.toLowerCase() : '';
  if (
    (dataType === 'post' || dataType === 'comment' || dataType === 'user') &&
    (typeof obj.username === 'string' || typeof obj.communityName === 'string')
  ) {
    return true;
  }
  if (typeof obj.parsedCommunityName === 'string' && typeof obj.username === 'string') {
    return true;
  }
  if (urlMatchesHost(obj, 'reddit.com', 'redd.it')) return true;
  return false;
}

function isInstagramItem(obj: Record<string, unknown>): boolean {
  if (Array.isArray(obj.latestPosts)) return true;
  if (typeof obj.ownerUsername === 'string' || typeof obj.owner_username === 'string') {
    return true;
  }
  if (typeof obj.shortCode === 'string' || typeof obj.shortcode === 'string') return true;
  if (urlMatchesHost(obj, 'instagram.com')) return true;
  if (
    typeof obj.username === 'string' &&
    (typeof obj.biography === 'string' ||
      typeof obj.followersCount === 'number' ||
      typeof obj.postsCount === 'number')
  ) {
    return true;
  }
  // Caption/timestamp alone is not enough: Twitter rows also carry those
  // keys. Require an Instagram owner or permalink.
  return (
    isInstagramPostLike(obj) &&
    (typeof obj.ownerUsername === 'string' ||
      typeof obj.owner_username === 'string' ||
      urlMatchesHost(obj, 'instagram.com'))
  );
}

function isTwitterItem(obj: Record<string, unknown>): boolean {
  if (typeof obj.twitterUrl === 'string' || typeof obj.twitter_url === 'string') return true;
  if (urlMatchesHost(obj, 'twitter.com', 'x.com')) return true;
  if (obj.tweet && typeof obj.tweet === 'object') return true;
  if (typeof obj.full_text === 'string' && (typeof obj.id_str === 'string' || typeof obj.created_at === 'string')) {
    return true;
  }
  if (
    typeof obj.text === 'string' &&
    (typeof obj.userName === 'string' ||
      typeof obj.username === 'string' ||
      isRecord(obj.author) ||
      isRecord(obj.user))
  ) {
    return !urlMatchesHost(obj, 'instagram.com') && !urlMatchesHost(obj, 'reddit.com', 'redd.it');
  }
  return false;
}

function hasText(obj: Record<string, unknown>, key: string): boolean {
  return typeof obj[key] === 'string' && (obj[key] as string).length > 0;
}

function urlMatchesHost(obj: Record<string, unknown>, ...domains: string[]): boolean {
  for (const key of ['url', 'link', 'inputUrl', 'source', 'twitterUrl', 'twitter_url']) {
    const raw = obj[key];
    if (typeof raw !== 'string') continue;
    const host = hostOf(raw);
    if (host && domains.some((d) => hostMatches(host, d))) return true;
  }
  return false;
}

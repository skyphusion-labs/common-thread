/**
 * Classify Apify (and native) export rows by platform.
 *
 * Used by the unified ingest door so a visitor can drop Twitter, Instagram,
 * Reddit, Bluesky, Mastodon, TikTok, or YouTube JSON without picking a route. Classification
 * is per item so a mixed upload splits into the matching pipelines.
 */

import { hostOf, hostMatches } from '../extractors/platform';
import { isInstagramPostLike } from './instagram-post-fields';

export type DetectedPlatform = 'twitter' | 'instagram' | 'reddit' | 'bluesky' | 'mastodon' | 'tiktok' | 'youtube';

export interface SplitApifyPayload {
  twitter: unknown[];
  instagram: unknown[];
  reddit: unknown[];
  bluesky: unknown[];
  mastodon: unknown[];
  tiktok: unknown[];
  youtube: unknown[];
  unknown: unknown[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Hosts we recognize but do not ingest. Must not fall through to Twitter. */
const UNSUPPORTED_DOMAINS = [
  'facebook.com',
  'fb.com',
  'fb.watch',
] as const;

const URL_KEYS = [
  'url',
  'link',
  'inputUrl',
  'source',
  'twitterUrl',
  'twitter_url',
  'webVideoUrl',
  'postUrl',
  'permalink',
  'facebookUrl',
  'videoUrl',
  'channelUrl',
  'profileUrl',
  'uri',
] as const;

export function detectItemPlatform(item: unknown): DetectedPlatform | 'unknown' {
  if (!item || typeof item !== 'object') return 'unknown';
  const obj = item as Record<string, unknown>;

  // Foreign hosts first: text+author Facebook/Bluesky/TikTok rows must not
  // become twitter ingest.
  if (isBlueskyItem(obj)) return 'bluesky';
  if (isMastodonItem(obj)) return 'mastodon';
  if (isTikTokItem(obj)) return 'tiktok';
  if (isYouTubeItem(obj)) return 'youtube';
  if (isUnsupportedPlatformItem(obj)) return 'unknown';
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
    bluesky: [],
    mastodon: [],
    tiktok: [],
    youtube: [],
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
  if (split.bluesky.length > 0) present.push('bluesky');
  if (split.mastodon.length > 0) present.push('mastodon');
  if (split.tiktok.length > 0) present.push('tiktok');
  if (split.youtube.length > 0) present.push('youtube');
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

function isBlueskyItem(obj: Record<string, unknown>): boolean {
  if (typeof obj.uri === 'string' && obj.uri.startsWith('at://')) return true;
  if (urlMatchesHost(obj, 'bsky.app', 'bsky.social')) return true;
  if (typeof obj.authorHandle === 'string' && typeof obj.text === 'string') return true;
  const author = isRecord(obj.author) ? obj.author : null;
  if (author && typeof author.handle === 'string' && typeof obj.text === 'string') {
    return typeof obj.createdAt === 'string' || typeof obj.indexedAt === 'string';
  }
  return false;
}

function isMastodonItem(obj: Record<string, unknown>): boolean {
  if (urlMatchesHost(obj, 'mastodon.social')) return true;
  const uri = typeof obj.uri === 'string' ? obj.uri : '';
  if (/\/users\/[^/]+\/statuses\//.test(uri) && hasAuthoredMastodonText(obj)) return true;
  const acct =
    (typeof obj.acct === 'string' && obj.acct) ||
    (isRecord(obj.author) && typeof obj.author.acct === 'string' && obj.author.acct) ||
    (isRecord(obj.account) && typeof obj.account.acct === 'string' && obj.account.acct) ||
    '';
  if (acct.includes('@') && hasAuthoredMastodonText(obj)) return true;
  if (
    typeof obj.instance === 'string' &&
    hasAuthoredMastodonText(obj) &&
    (typeof obj.createdAt === 'string' || typeof obj.created_at === 'string') &&
    (typeof obj.username === 'string' ||
      typeof obj.acct === 'string' ||
      (isRecord(obj.author) && typeof obj.author.username === 'string'))
  ) {
    return true;
  }
  return false;
}

function hasAuthoredMastodonText(obj: Record<string, unknown>): boolean {
  return (
    (typeof obj.text === 'string' && obj.text.length > 0) ||
    (typeof obj.content === 'string' && obj.content.length > 0)
  );
}

function isTikTokItem(obj: Record<string, unknown>): boolean {
  if (urlMatchesHost(obj, 'tiktok.com')) return true;
  const meta = isRecord(obj.authorMeta) ? obj.authorMeta : null;
  if (
    meta &&
    typeof meta.name === 'string' &&
    typeof obj.text === 'string' &&
    (typeof obj.createTimeISO === 'string' ||
      typeof obj.createTime === 'number' ||
      typeof obj.webVideoUrl === 'string')
  ) {
    return true;
  }
  return false;
}

function isYouTubeItem(obj: Record<string, unknown>): boolean {
  if (urlMatchesHost(obj, 'youtube.com', 'youtu.be')) return true;
  if (typeof obj.comment === 'string' && (typeof obj.author === 'string' || typeof obj.videoId === 'string')) {
    return true;
  }
  if (
    typeof obj.channelUsername === 'string' &&
    (typeof obj.title === 'string' || typeof obj.text === 'string' || typeof obj.description === 'string')
  ) {
    return true;
  }
  return false;
}

function isUnsupportedPlatformItem(obj: Record<string, unknown>): boolean {
  if (isBlueskyItem(obj) || isMastodonItem(obj) || isTikTokItem(obj) || isYouTubeItem(obj)) return false;
  if (urlMatchesHost(obj, ...UNSUPPORTED_DOMAINS)) return true;
  if (typeof obj.facebookUrl === 'string' || typeof obj.facebookId === 'string') return true;
  return false;
}

function isTwitterItem(obj: Record<string, unknown>): boolean {
  if (isUnsupportedPlatformItem(obj)) return false;
  if (typeof obj.twitterUrl === 'string' || typeof obj.twitter_url === 'string') return true;
  if (urlMatchesHost(obj, 'twitter.com', 'x.com')) return true;
  if (obj.tweet && typeof obj.tweet === 'object') return true;
  if (typeof obj.full_text === 'string' && (typeof obj.id_str === 'string' || typeof obj.created_at === 'string')) {
    return true;
  }
  // text + author/user is shared by Facebook, Bluesky, TikTok, YouTube.
  // Only accept it when a Twitter/X URL is also present.
  if (
    typeof obj.text === 'string' &&
    (typeof obj.userName === 'string' ||
      typeof obj.username === 'string' ||
      isRecord(obj.author) ||
      isRecord(obj.user))
  ) {
    return urlMatchesHost(obj, 'twitter.com', 'x.com');
  }
  return false;
}

function hasText(obj: Record<string, unknown>, key: string): boolean {
  return typeof obj[key] === 'string' && (obj[key] as string).length > 0;
}

function urlMatchesHost(obj: Record<string, unknown>, ...domains: string[]): boolean {
  for (const key of URL_KEYS) {
    const raw = obj[key];
    if (typeof raw !== 'string') continue;
    const host = hostOf(raw);
    if (host && domains.some((d) => hostMatches(host, d))) return true;
  }
  return false;
}

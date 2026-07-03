/**
 * Normalize Instagram post / media rows from Apify scrapers and archives.
 *
 * Supports instagram-post-scraper, instagram-scraper, and common export
 * shapes (caption, timestamp, ownerUsername, hashtags, mentions).
 */

import type { ManifestEntry } from '../archive/types';
import { hostOf, hostMatches } from '../extractors/platform';

export interface InstagramPostLike {
  caption?: string;
  text?: string;
  description?: string;
  timestamp?: string | number;
  takenAtTimestamp?: string | number;
  taken_at_timestamp?: string | number;
  createTimeISO?: string;
  create_time_iso?: string;
  createdAt?: string;
  created_at?: string;
  ownerUsername?: string;
  owner_username?: string;
  username?: string;
  hashtags?: string[];
  mentions?: string[];
  type?: string;
  productType?: string;
  product_type?: string;
  likesCount?: number;
  commentsCount?: number;
  url?: string;
  displayUrl?: string;
}

export function isInstagramPostLike(value: unknown): value is InstagramPostLike {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.caption === 'string' ||
    typeof obj.text === 'string' ||
    typeof obj.description === 'string' ||
    typeof obj.timestamp === 'string' ||
    typeof obj.timestamp === 'number' ||
    typeof obj.takenAtTimestamp === 'string' ||
    typeof obj.takenAtTimestamp === 'number' ||
    typeof obj.createTimeISO === 'string' ||
    typeof obj.createdAt === 'string'
  );
}

export function instagramPostCaption(post: InstagramPostLike): string {
  const caption = post.caption ?? post.text ?? post.description ?? '';
  return typeof caption === 'string' ? caption : '';
}

export function instagramCreatedAtRaw(
  post: InstagramPostLike
): string | number | undefined {
  if (post.createTimeISO) return post.createTimeISO;
  if (post.create_time_iso) return post.create_time_iso;
  if (post.createdAt) return post.createdAt;
  if (post.created_at) return post.created_at;
  if (post.timestamp !== undefined) return post.timestamp;
  if (post.takenAtTimestamp !== undefined) return post.takenAtTimestamp;
  if (post.taken_at_timestamp !== undefined) return post.taken_at_timestamp;
  return undefined;
}

export function instagramPostType(post: InstagramPostLike): string | undefined {
  const raw = post.type ?? post.productType ?? post.product_type;
  return typeof raw === 'string' && raw.length > 0 ? raw.toLowerCase() : undefined;
}

export function instagramPostIsVideo(post: InstagramPostLike): boolean {
  const t = instagramPostType(post);
  return t === 'video' || t === 'reel' || t === 'clips';
}

export function instagramPostIsCarousel(post: InstagramPostLike): boolean {
  const t = instagramPostType(post);
  return t === 'sidecar' || t === 'carousel' || t === 'carousel_container';
}


/**
 * Classify whether a manifest entry belongs to Instagram. Shared by the
 * stylometric and temporal Instagram account extractors so both apply one
 * identical rule (previously each carried its own copy, and the two parsed
 * the source host differently). Host checks route through the parsed-host
 * helpers in extractors/platform.ts, never a substring, so a spoofed host
 * such as instagram.com.attacker.example is not misread as Instagram.
 *
 * Order matters. An explicit instagram-profile artifact is rejected first
 * (a profile is not a post timeline). Post and reel permalinks and the
 * instagram-* tool labels accept. A source whose parsed host is
 * instagram.com (or a subdomain) accepts. Entries that carry another
 * platform's tool label or parse to another platform's host are rejected.
 * Anything unrecognized defaults to reject.
 */
export function isInstagramEntry(entry: ManifestEntry): boolean {
  const tool = entry.collectionMethod.tool.toLowerCase();
  const source = entry.source.toLowerCase();

  if (tool.includes('instagram-profile')) return false;

  // Post and reel permalinks carry /p/ or /reel/ in the path. This is a
  // path pattern, not a host, so a substring test is the correct check.
  if (source.includes('/p/') || source.includes('/reel/')) return true;

  if (
    tool.includes('instagram-post') ||
    tool.includes('instagram-timeline') ||
    tool.includes('instagram-media') ||
    tool.includes('instagram-scraper')
  ) {
    return true;
  }
  if (tool.includes('instagram')) return true;

  const host = hostOf(source);
  if (host !== null && hostMatches(host, 'instagram.com')) return true;

  if (tool.includes('twitter') || tool.includes('x-com')) return false;
  if (tool.includes('reddit')) return false;
  if (
    host !== null &&
    (hostMatches(host, 'twitter.com') || hostMatches(host, 'x.com'))
  ) {
    return false;
  }
  if (
    host !== null &&
    (hostMatches(host, 'reddit.com') || hostMatches(host, 'redd.it'))
  ) {
    return false;
  }

  return false;
}

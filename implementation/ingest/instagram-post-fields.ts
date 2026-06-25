/**
 * Normalize Instagram post / media rows from Apify scrapers and archives.
 *
 * Supports instagram-post-scraper, instagram-scraper, and common export
 * shapes (caption, timestamp, ownerUsername, hashtags, mentions).
 */

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

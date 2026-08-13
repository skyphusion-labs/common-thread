/**
 * Parse Instagram timeline / post-list artifacts into normalized rows.
 *
 * Accepts Apify post arrays, nested { posts, items, media } wrappers,
 * and single-post objects.
 */

import {
  instagramCreatedAtRaw,
  instagramPostCaption,
  instagramPostIsCarousel,
  instagramPostIsVideo,
  isInstagramPostLike,
  type InstagramPostLike,
} from './instagram-post-fields';
import { boundedCollect } from './collect-limit';

export interface ParsedInstagramItem {
  text: string;
  createdAt: string | number;
  isVideo: boolean;
  isCarousel: boolean;
}

export function parseInstagramListingBytes(bytes: Uint8Array): ParsedInstagramItem[] | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    const collected: ParsedInstagramItem[] = [];
    collectFrom(parsed, collected);
    return collected.length > 0 ? collected : null;
  } catch {
    return null;
  }
}

export function parseInstagramListingData(data: unknown): ParsedInstagramItem[] {
  const collected: ParsedInstagramItem[] = [];
  collectFrom(data, collected);
  return collected;
}

function collectFrom(value: unknown, out: ParsedInstagramItem[]): void {
  boundedCollect(value, out, (obj) => {
    if (!isInstagramPostLike(obj)) return null;
    return normalizeItem(obj);
  }, {
    extraKeys: ['posts', 'items', 'media', 'data', 'results', 'children'],
  });
}

function normalizeItem(post: InstagramPostLike): ParsedInstagramItem | null {
  const text = instagramPostCaption(post);
  if (text.length === 0) return null;

  const createdAt = instagramCreatedAtRaw(post);
  if (createdAt === undefined) return null;

  return {
    text,
    createdAt,
    isVideo: instagramPostIsVideo(post),
    isCarousel: instagramPostIsCarousel(post),
  };
}

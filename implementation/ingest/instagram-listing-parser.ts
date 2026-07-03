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
  if (!value) return;

  if (Array.isArray(value)) {
    for (const item of value) collectFrom(item, out);
    return;
  }

  if (typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;

  if (isInstagramPostLike(obj)) {
    const normalized = normalizeItem(obj);
    if (normalized) out.push(normalized);
    return;
  }

  const record = obj;
  // Only these known wrapper keys are descended into; posts nested under
  // any other (unrecognized) key are intentionally skipped rather than
  // walked recursively, to avoid pulling in unrelated objects.
  for (const key of ['posts', 'items', 'media', 'data', 'results', 'children']) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      for (const c of candidate as unknown[]) collectFrom(c, out);
    }
  }
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

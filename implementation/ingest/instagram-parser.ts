/**
 * Parse Apify Instagram exports (instagram-scraper, instagram-post-scraper,
 * instagram-profile-scraper) into per-account post lists.
 */

import {
  isInstagramPostLike,
  type InstagramPostLike,
} from './instagram-post-fields';
import { flattenPayloadItems, isRecord } from './platform-detect';
import { boundedCollect } from './collect-limit';

export interface InstagramAccountListing {
  account: string;
  posts: InstagramPostLike[];
}

export function instagramAccountOf(post: InstagramPostLike): string | null {
  const raw = post.ownerUsername ?? post.owner_username ?? post.username;
  if (typeof raw !== 'string') return null;
  const account = raw.replace(/^@/, '').trim().toLowerCase();
  return account.length > 0 ? account : null;
}

export function extractInstagramPosts(payload: unknown): InstagramPostLike[] {
  const posts: InstagramPostLike[] = [];
  for (const item of flattenPayloadItems(payload)) {
    collectInstagramPosts(item, posts);
  }
  return posts;
}

export function extractInstagramHandles(payload: unknown): string[] {
  const seen = new Set<string>();
  for (const post of extractInstagramPosts(payload)) {
    const account = instagramAccountOf(post);
    if (account) seen.add(account);
  }
  for (const item of flattenPayloadItems(payload)) {
    if (!isRecord(item)) continue;
    const username = item.username ?? item.ownerUsername ?? item.owner_username;
    if (typeof username === 'string') {
      const account = username.replace(/^@/, '').trim().toLowerCase();
      if (account) seen.add(account);
    }
  }
  return [...seen].sort();
}

export function aggregateInstagramPostsByAccount(
  payload: unknown
): InstagramAccountListing[] {
  const byAccount = new Map<string, InstagramPostLike[]>();
  for (const post of extractInstagramPosts(payload)) {
    const account = instagramAccountOf(post);
    if (!account) continue;
    let list = byAccount.get(account);
    if (!list) {
      list = [];
      byAccount.set(account, list);
    }
    list.push(post);
  }
  const listings: InstagramAccountListing[] = [];
  for (const [account, posts] of byAccount) {
    listings.push({ account, posts });
  }
  listings.sort((a, b) => a.account.localeCompare(b.account));
  return listings;
}

function collectInstagramPosts(value: unknown, out: InstagramPostLike[]): void {
  boundedCollect(
    value,
    out,
    (obj) => (isInstagramPostLike(obj) && instagramAccountOf(obj) ? obj : null),
    {
      extraKeys: ['latestPosts', 'latestIgtvVideos', 'posts', 'items', 'data', 'results'],
      continueAfterMatch: true,
    }
  );
}

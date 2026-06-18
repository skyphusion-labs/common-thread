// implementation/ingest/apify-twitter-parser.ts

import {
  authorFromStatusUrl,
  authorHandleFromTweet,
  isApifyNoResultsItem,
  isApifyTweetLike,
  normalizeTwitterHandle,
} from './apify-tweet-fields';

export interface ParsedTweet {
  account: string;
  tweet: any;
  collectedAt?: string;
  tweetId?: string;
}

/** @deprecated Prefer normalizeTwitterHandle from apify-tweet-fields. */
export function normalizeHandle(raw: unknown): string | null {
  return normalizeTwitterHandle(typeof raw === 'string' ? raw : null);
}

export function parseApifyTwitterItems(payload: any): ParsedTweet[] {
  const out: ParsedTweet[] = [];

  let items: any[] = [];
  if (Array.isArray(payload)) items = payload;
  else if (Array.isArray(payload?.items)) items = payload.items;
  else if (Array.isArray(payload?.data)) items = payload.data;
  else items = [payload];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (isApifyNoResultsItem(item)) continue;
    if (!isApifyTweetLike(item)) continue;

    const authorHandle =
      authorHandleFromTweet(item) ?? authorFromStatusUrl(item.url ?? item.twitterUrl);
    if (!authorHandle) continue;

    const collectedAt =
      item?.createdAt || item?.created_at || item?.timestamp || undefined;
    const tweetId =
      item?.id != null ? String(item.id) : item?.tweetId != null ? String(item.tweetId) : undefined;

    out.push({
      account: authorHandle,
      tweet: item,
      collectedAt,
      tweetId,
    });
  }

  return out;
}

export function extractAllHandlesFromApifyTwitter(payload: any): string[] {
  const parsed = parseApifyTwitterItems(payload);
  return Array.from(new Set(parsed.map(p => p.account))).sort();
}

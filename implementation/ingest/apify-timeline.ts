/**
 * Per-account timeline aggregation for Apify Twitter ingest.
 *
 * Stylometric, temporal, and metadata-leakage account extractors expect
 * timeline artifacts (JSON arrays of posts). Apify exports are flat tweet
 * lists; this module groups them by author before archival.
 */

import { ArchiveStore } from '../archive/store';
import { ManifestStore } from '../archive/manifest';
import type { ParsedTweet } from './apify-twitter-parser';
import { tweetText } from './apify-tweet-fields';

/** Manifest tool id for aggregated per-account timelines. */
export const APIFY_TWITTER_TIMELINE_TOOL = 'apify-twitter-timeline';

export interface AccountTimeline {
  account: string;
  tweets: unknown[];
}

function tweetSortKey(tweet: unknown): number {
  if (!tweet || typeof tweet !== 'object') return 0;
  const obj = tweet as Record<string, unknown>;
  const raw =
    (typeof obj.createdAt === 'string' && obj.createdAt) ||
    (typeof obj.created_at === 'string' && obj.created_at) ||
    (typeof obj.timestamp === 'string' && obj.timestamp) ||
    '';
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
}

function tweetDedupeKey(tweet: unknown, fallbackIndex: number): string {
  if (!tweet || typeof tweet !== 'object') return `__row_${fallbackIndex}`;
  const obj = tweet as Record<string, unknown>;
  const id = obj.id ?? obj.id_str ?? obj.tweetId;
  if (id != null && String(id).length > 0) return String(id);
  const text = tweetText(obj);
  const ts = tweetSortKey(tweet);
  if (text.length > 0 || ts > 0) return `__content_${ts}_${text.slice(0, 64)}`;
  return `__row_${fallbackIndex}`;
}

/**
 * Group parsed Apify tweets into one timeline per account.
 * Tweets are deduplicated by id (or content fallback) and sorted by time.
 */
export function aggregateParsedTweetsByAccount(
  parsed: ParsedTweet[]
): AccountTimeline[] {
  const byAccount = new Map<string, Map<string, unknown>>();

  for (const row of parsed) {
    let tweets = byAccount.get(row.account);
    if (!tweets) {
      tweets = new Map();
      byAccount.set(row.account, tweets);
    }
    const key = tweetDedupeKey(row.tweet, tweets.size);
    if (!tweets.has(key)) {
      tweets.set(key, row.tweet);
    }
  }

  const timelines: AccountTimeline[] = [];
  for (const [account, tweetMap] of byAccount) {
    const tweets = [...tweetMap.values()].sort(
      (a, b) => tweetSortKey(a) - tweetSortKey(b)
    );
    if (tweets.length === 0) continue;
    timelines.push({ account, tweets });
  }

  timelines.sort((a, b) => a.account.localeCompare(b.account));
  return timelines;
}

export interface ArchiveTimelinesResult {
  manifestHashes: string[];
  artifactsCreated: number;
}

/**
 * Write one content-addressed timeline artifact and manifest entry per account.
 */
export async function archiveAccountTimelines(
  env: { ARCHIVE: R2Bucket },
  options: {
    investigationId: string;
    timelines: AccountTimeline[];
    collectedAt: string;
    toolVersion?: string;
  }
): Promise<ArchiveTimelinesResult> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId: options.investigationId });
  const toolVersion = options.toolVersion ?? '1';
  const manifestHashes: string[] = [];

  for (const { account, tweets } of options.timelines) {
    const bytes = new TextEncoder().encode(JSON.stringify(tweets));
    const { hash } = await archive.put(bytes, {
      mimeType: 'application/json',
      extension: 'json',
    });

    await manifest.append({
      hash,
      account,
      source: `https://x.com/${account}/timeline`,
      collectedAt: options.collectedAt,
      investigationId: options.investigationId,
      collectionMethod: {
        tool: APIFY_TWITTER_TIMELINE_TOOL,
        version: toolVersion,
        platform: 'twitter',
        config: { tweet_count: tweets.length },
      },
      mimeType: 'application/json',
      status: 'present',
    } as never);

    manifestHashes.push(hash);
  }

  return {
    manifestHashes,
    artifactsCreated: manifestHashes.length,
  };
}

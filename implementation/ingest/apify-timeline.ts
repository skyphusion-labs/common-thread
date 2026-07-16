/**
 * Per-account timeline aggregation for Apify Twitter ingest.
 *
 * Stylometric, temporal, and metadata-leakage account extractors expect
 * timeline artifacts (JSON arrays of posts). Apify exports are flat tweet
 * lists; this module groups them by author before archival.
 */

import { ArchiveStore } from '../archive/store';
import type { InvestigationTimeBounds } from '../investigations/metadata';
import { manifestStoreFor, type ArchiveManifestBinding } from './manifest-env';
import type { ParsedTweet } from './apify-twitter-parser';
import { tweetText } from './apify-tweet-fields';

/** Manifest tool id for aggregated per-account timelines. */
export const APIFY_TWITTER_TIMELINE_TOOL = 'apify-twitter-timeline';

export interface AccountTimeline {
  account: string;
  tweets: unknown[];
}

/** Parse tweet createdAt / created_at / timestamp to epoch ms; 0 if missing/invalid. */
export function tweetSortKey(tweet: unknown): number {
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

/**
 * Keep tweets whose timestamps fall in inclusive [start, end] (§5.2.1).
 * Tweets with missing or unparseable timestamps are dropped when bounds apply.
 */
export function filterTweetsByTimeBounds(
  tweets: unknown[],
  bounds: InvestigationTimeBounds
): unknown[] {
  const startMs = Date.parse(bounds.start);
  const endMs = Date.parse(bounds.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return tweets;

  return tweets.filter((tweet) => {
    const ms = tweetSortKey(tweet);
    if (ms <= 0) return false;
    return ms >= startMs && ms <= endMs;
  });
}

/**
 * Apply investigation time_bounds to per-account timelines.
 * Accounts with zero in-window tweets are omitted.
 */
export function applyTimeBoundsToTimelines(
  timelines: AccountTimeline[],
  bounds: InvestigationTimeBounds
): AccountTimeline[] {
  const out: AccountTimeline[] = [];
  for (const { account, tweets } of timelines) {
    const filtered = filterTweetsByTimeBounds(tweets, bounds);
    if (filtered.length === 0) continue;
    out.push({ account, tweets: filtered });
  }
  return out;
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
  env: ArchiveManifestBinding,
  options: {
    investigationId: string;
    timelines: AccountTimeline[];
    collectedAt: string;
    toolVersion?: string;
    /** When set, recorded on each timeline manifest entry (already applied to tweets). */
    timeBounds?: InvestigationTimeBounds;
    /** Pre-filter tweet counts keyed by account (audit when time_bounds applied). */
    tweetCountRawByAccount?: Record<string, number>;
  }
): Promise<ArchiveTimelinesResult> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = manifestStoreFor(env, options.investigationId);
  const toolVersion = options.toolVersion ?? '1';
  const manifestHashes: string[] = [];

  for (const { account, tweets } of options.timelines) {
    const bytes = new TextEncoder().encode(JSON.stringify(tweets));
    const { hash } = await archive.put(bytes, {
      mimeType: 'application/json',
      extension: 'json',
    });

    const config: Record<string, unknown> = { tweet_count: tweets.length };
    if (options.timeBounds) {
      config.time_bounds = {
        start: options.timeBounds.start,
        end: options.timeBounds.end,
      };
      const raw = options.tweetCountRawByAccount?.[account];
      if (typeof raw === 'number') {
        config.tweet_count_raw = raw;
      }
    }

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
        config,
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

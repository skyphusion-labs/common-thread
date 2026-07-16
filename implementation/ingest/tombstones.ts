/**
 * Tweet-level tombstone manifest entries (paper §5.5.2).
 */

import { sha256 } from '../archive/hash';
import type { ManifestStore } from '../archive/manifest';
import type { ManifestEntry } from '../archive/types';
/** Manifest tool id for tweet-level tombstones written during re-collection. */
export const RECOLLECTION_TOMBSTONE_TOOL = 'recollection-twitter-tombstone';

export interface RecordTweetTombstoneParams {
  investigationId: string;
  account: string;
  tweetId: string;
  priorTimelineHash: string;
  priorCollectedAt: string;
  discoveredAt: string;
  toolVersion?: string;
}

/**
 * Append a manifest tombstone for a tweet that was present in a prior timeline
 * collection but absent on re-collection at source.
 */
export async function recordTweetTombstone(
  manifest: ManifestStore,
  params: RecordTweetTombstoneParams
): Promise<ManifestEntry> {
  const hash = await sha256(
    new TextEncoder().encode(
      JSON.stringify({
        kind: 'tweet_tombstone',
        tombstoneOf: params.priorTimelineHash,
        tweet_id: params.tweetId,
        discovered_at: params.discoveredAt,
      })
    )
  );

  const entry: ManifestEntry = {
    hash,
    source: `https://x.com/${params.account}/status/${params.tweetId}`,
    collectedAt: params.discoveredAt,
    investigationId: params.investigationId,
    account: params.account,
    collectionMethod: {
      tool: RECOLLECTION_TOMBSTONE_TOOL,
      version: params.toolVersion ?? '1',
      config: {
        prior_timeline_hash: params.priorTimelineHash,
        tweet_id: params.tweetId,
        platform: 'twitter',
      },
    },
    platformMetadata: {
      tweet_id: params.tweetId,
      prior_timeline_hash: params.priorTimelineHash,
      prior_collected_at: params.priorCollectedAt,
    },
    status: 'absent',
    tombstoneOf: params.priorTimelineHash,
  };

  await manifest.append(entry);
  return entry;
}

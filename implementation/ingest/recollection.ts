/**
 * Re-collection helpers (paper §5.5, §6.4.5).
 *
 * Compares a new per-account timeline against the latest prior present
 * timeline manifest entry and detects tweets absent at source.
 */

import { ArchiveStore } from '../archive/store';
import type { ManifestEntry } from '../archive/types';
import type { DatabaseClient } from '../db';
import { parsePosts } from '../extractors/network/engagement-parse';
import { tweetId, type ApifyTweetLike } from './apify-tweet-fields';
import { APIFY_TWITTER_TIMELINE_TOOL, type AccountTimeline } from './apify-timeline';
import type { ArchiveManifestBinding } from './manifest-env';
import { manifestStoreFor } from './manifest-env';
import { recordTweetTombstone } from './tombstones';

export { RECOLLECTION_TOMBSTONE_TOOL } from './tombstones';

export const RECOLLECTION_EXTRACTOR_NAME = 'recollection_twitter';
export const RECOLLECTION_EXTRACTOR_VERSION = '1.0.0';

export function isTimelineManifestEntry(entry: ManifestEntry): boolean {
  if (entry.status !== 'present') return false;
  const tool = entry.collectionMethod?.tool ?? '';
  return tool === APIFY_TWITTER_TIMELINE_TOOL;
}

/** Extract stable tweet ids from a timeline tweet array. */
export function extractTweetIds(tweets: unknown[]): Set<string> {
  const ids = new Set<string>();
  for (const tweet of tweets) {
    if (!tweet || typeof tweet !== 'object') continue;
    const id = tweetId(tweet as ApifyTweetLike);
    if (id) ids.add(id);
  }
  return ids;
}

/** Tweet ids present in prior collection but missing from the new timeline. */
export function diffTimelines(priorIds: Set<string>, currentIds: Set<string>): string[] {
  const deleted: string[] = [];
  for (const id of priorIds) {
    if (!currentIds.has(id)) deleted.push(id);
  }
  deleted.sort();
  return deleted;
}

/**
 * Latest present apify-twitter-timeline manifest entry for an account.
 * When multiple timeline collections exist, the most recent collectedAt wins.
 */
export function findLatestTimelineEntry(
  entries: ManifestEntry[],
  account: string
): ManifestEntry | null {
  let latest: ManifestEntry | null = null;
  for (const entry of entries) {
    if (entry.account !== account) continue;
    if (!isTimelineManifestEntry(entry)) continue;
    if (!latest || entry.collectedAt > latest.collectedAt) {
      latest = entry;
    }
  }
  return latest;
}

/** Map seed accounts to their latest prior timeline entry (if any). */
export function buildPriorTimelineByAccount(
  entries: ManifestEntry[],
  accounts: readonly string[]
): Map<string, ManifestEntry> {
  const map = new Map<string, ManifestEntry>();
  for (const account of accounts) {
    const entry = findLatestTimelineEntry(entries, account);
    if (entry) map.set(account, entry);
  }
  return map;
}

/**
 * When extractors iterate manifest entries, keep only the latest present
 * timeline per account so re-ingest does not double-count engagements.
 */
export function selectManifestEntriesForExtraction(
  entries: ManifestEntry[]
): ManifestEntry[] {
  const latestTimelineByAccount = new Map<string, ManifestEntry>();
  const passthrough: ManifestEntry[] = [];

  for (const entry of entries) {
    if (isTimelineManifestEntry(entry)) {
      if (!entry.account) continue;
      const prev = latestTimelineByAccount.get(entry.account);
      if (!prev || entry.collectedAt > prev.collectedAt) {
        latestTimelineByAccount.set(entry.account, entry);
      }
      continue;
    }
    passthrough.push(entry);
  }

  return [...passthrough, ...latestTimelineByAccount.values()];
}

export interface RecollectionResult {
  tombstonesWritten: number;
  deletionsRecorded: number;
  tombstoneManifestHashes: string[];
}

async function writeTweetDeletionEvent(
  db: DatabaseClient,
  params: {
    investigationId: string;
    account: string;
    tweetId: string;
    priorTimelineHash: string;
    discoveredAt: string;
    collectionWindow: string;
  }
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO event_features (
         investigation_id, platform, account_identifier,
         event_timestamp, event_type, event_data_json,
         extracted_at, extractor_name, extractor_version, extractor_run_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      params.investigationId,
      'twitter',
      params.account,
      params.discoveredAt,
      'tweet_deletion',
      JSON.stringify({
        tweet_id: params.tweetId,
        prior_timeline_hash: params.priorTimelineHash,
        discovered_at: params.discoveredAt,
        collection_window: params.collectionWindow,
      }),
      params.discoveredAt,
      RECOLLECTION_EXTRACTOR_NAME,
      RECOLLECTION_EXTRACTOR_VERSION,
      null
    )
    .run();
}

function priorTimelineTweetIds(bytes: Uint8Array): Set<string> {
  return extractTweetIds(parsePosts(bytes));
}

function tombstoneAlreadyRecorded(
  entries: ManifestEntry[],
  priorTimelineHash: string,
  tweetIdValue: string
): boolean {
  return entries.some(
    (e) =>
      e.status === 'absent' &&
      e.tombstoneOf === priorTimelineHash &&
      e.platformMetadata?.tweet_id === tweetIdValue
  );
}

/**
 * Diff new timelines against prior present timelines; write tombstones and
 * tweet_deletion event_features for tweets absent at source.
 */
export async function runTimelineRecollection(
  archiveEnv: ArchiveManifestBinding,
  db: DatabaseClient,
  options: {
    investigationId: string;
    timelines: AccountTimeline[];
    priorTimelineByAccount: Map<string, ManifestEntry>;
    discoveredAt: string;
  }
): Promise<RecollectionResult> {
  const archive = new ArchiveStore({ bucket: archiveEnv.ARCHIVE });
  const manifest = manifestStoreFor(archiveEnv, options.investigationId);
  const absentEntries = await manifest.list({ status: 'absent' });

  let tombstonesWritten = 0;
  let deletionsRecorded = 0;
  const tombstoneManifestHashes: string[] = [];

  for (const { account, tweets } of options.timelines) {
    const priorEntry = options.priorTimelineByAccount.get(account);
    if (!priorEntry) continue;

    const priorArtifact = await archive.getForEntry(priorEntry);
    if (!priorArtifact) continue;

    const priorIds = priorTimelineTweetIds(priorArtifact.bytes);
    const currentIds = extractTweetIds(tweets);
    const deleted = diffTimelines(priorIds, currentIds);
    if (deleted.length === 0) continue;

    for (const deletedTweetId of deleted) {
      if (
        tombstoneAlreadyRecorded(absentEntries, priorEntry.hash, deletedTweetId)
      ) {
        continue;
      }

      const entry = await recordTweetTombstone(manifest, {
        investigationId: options.investigationId,
        account,
        tweetId: deletedTweetId,
        priorTimelineHash: priorEntry.hash,
        priorCollectedAt: priorEntry.collectedAt,
        discoveredAt: options.discoveredAt,
      });
      tombstoneManifestHashes.push(entry.hash);
      tombstonesWritten++;
      absentEntries.push(entry);

      await writeTweetDeletionEvent(db, {
        investigationId: options.investigationId,
        account,
        tweetId: deletedTweetId,
        priorTimelineHash: priorEntry.hash,
        discoveredAt: options.discoveredAt,
        collectionWindow: priorEntry.collectedAt,
      });
      deletionsRecorded++;
    }

  }

  return { tombstonesWritten, deletionsRecorded, tombstoneManifestHashes };
}

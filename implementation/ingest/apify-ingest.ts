// implementation/ingest/apify-ingest.ts

import { ArchiveStore } from '../archive/store';
import { ManifestStore } from '../archive/manifest';
import type { ManifestEntry } from '../archive/types';
import { parseApifyTwitterItems, extractAllHandlesFromApifyTwitter } from './apify-twitter-parser';
import { runAccountExtractors } from '../extractors/runner';
import { runPairExtractors } from '../extractors/pair-runner';
import {
  ALL_ACCOUNT_EXTRACTORS,
  ALL_PAIR_EXTRACTORS,
} from '../extractors';
import type { AccountFeatureExtractor } from '../extractors/types';
import type { PairFeatureExtractor } from '../extractors/pair-types';

export interface ApifyIngestResult {
  investigationId: string;
  rawPayloadHash: string;
  tweetsProcessed: number;
  uniqueAccounts: number;
  artifactsCreated: number;
  seedsRegistered: number;
  accountExtractorRuns: any[];
  pairExtractorRuns: any[];
  pairExtractorsSkipped?: boolean;
  pairExtractorsSkippedReason?: string;
}

const TWITTER_ACCOUNT_EXTRACTORS: AccountFeatureExtractor[] =
  ALL_ACCOUNT_EXTRACTORS.filter(e =>
    /twitter/i.test(e.name) || /twitter/i.test(e.version)
  );

const TWITTER_PAIR_EXTRACTORS: PairFeatureExtractor[] =
  ALL_PAIR_EXTRACTORS.filter(e =>
    /twitter/i.test(e.name) || /twitter/i.test(e.version) ||
    /burrows_delta/i.test(e.name) ||
    /jsd_character_bigrams/i.test(e.name) ||
    /burst_overlap/i.test(e.name) ||
    /cadence_jsd/i.test(e.name) ||
    /active_hour/i.test(e.name) ||
    /quiet_period/i.test(e.name) ||
    /client_app_overlap/i.test(e.name) ||
    /tweet_language/i.test(e.name) ||
    /follower_overlap/i.test(e.name) ||
    /mutual_follow/i.test(e.name)
  );

export async function ingestApifyTwitter(
  env: { DB: D1Database; ARCHIVE: R2Bucket },
  investigationId: string,
  payload: any
): Promise<ApifyIngestResult> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE });

  const now = new Date().toISOString();

  // Archive the full raw payload
  const rawBytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const { hash: rawHash } = await archive.put(rawBytes, {
    mimeType: 'application/json',
    extension: 'json',
  });

  await manifest.append({
    hash: rawHash,
    source: 'apify-twitter-raw',
    collectedAt: now,
    investigationId,
    collectionMethod: { tool: 'apify', version: '1' },
    status: 'present',
  } as any);

  const parsedTweets = parseApifyTwitterItems(payload);
  const handles = extractAllHandlesFromApifyTwitter(payload);

  let artifactsCreated = 0;

  // One manifest entry per tweet with account = author
  for (const pt of parsedTweets) {
    const tweetBytes = new TextEncoder().encode(JSON.stringify(pt.tweet));
    const { hash: tweetHash } = await archive.put(tweetBytes, {
      mimeType: 'application/json',
      extension: 'json',
    });

    await manifest.append({
      hash: tweetHash,
      account: pt.account,
      source: 'apify-twitter',
      collectedAt: pt.collectedAt || now,
      investigationId,
      collectionMethod: { tool: 'apify', version: '1' },
      status: 'present',
    } as any);

    artifactsCreated++;
  }

  // Register seed accounts
  let seedsRegistered = 0;
  for (const handle of handles) {
    try {
      await env.DB
        .prepare(
          `INSERT OR IGNORE INTO seed_accounts 
           (investigation_id, platform, account_identifier, basis_statement, added_at)
           VALUES (?, 'twitter', ?, 'Uploaded via Apify Twitter ingest', ?)`
        )
        .bind(investigationId, handle, now)
        .run();
      seedsRegistered++;
    } catch {}
  }

  // Always run account extractors
  const accountRuns = await runAccountExtractors(env, {
    investigationId,
    extractors: TWITTER_ACCOUNT_EXTRACTORS,
    accountFilter: handles.length > 0 ? handles : undefined,
  });

  // Only run pair extractors if we have 2+ accounts
  let pairRuns: any[] = [];
  let pairExtractorsSkipped = false;
  let pairExtractorsSkippedReason: string | undefined;

  if (handles.length >= 2) {
    pairRuns = await runPairExtractors(env, {
      investigationId,
      extractors: TWITTER_PAIR_EXTRACTORS,
      accountFilter: handles.length > 0 ? handles : undefined,
    });
  } else {
    pairExtractorsSkipped = true;
    pairExtractorsSkippedReason = `Pair extractors require at least 2 accounts; got ${handles.length}`;
  }

  return {
    investigationId,
    rawPayloadHash: rawHash,
    tweetsProcessed: parsedTweets.length,
    uniqueAccounts: handles.length,
    artifactsCreated,
    seedsRegistered,
    accountExtractorRuns: accountRuns,
    pairExtractorRuns: pairRuns,
    pairExtractorsSkipped,
    pairExtractorsSkippedReason,
  };
}

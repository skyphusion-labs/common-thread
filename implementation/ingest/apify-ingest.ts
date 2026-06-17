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
  accountExtractorRuns?: any[];
  pairExtractorRuns?: any[];
  pairExtractorsSkipped?: boolean;
  pairExtractorsSkippedReason?: string;
}

export const TWITTER_ACCOUNT_EXTRACTORS: AccountFeatureExtractor[] =
  ALL_ACCOUNT_EXTRACTORS.filter((e) =>
    /twitter/i.test(e.name) || /twitter/i.test(e.version)
  );

export const TWITTER_PAIR_EXTRACTORS: PairFeatureExtractor[] =
  ALL_PAIR_EXTRACTORS.filter((e) =>
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

function hasNetworkData(payload: any): boolean {
  const items = Array.isArray(payload) ? payload :
                Array.isArray(payload?.items) ? payload.items :
                Array.isArray(payload?.data) ? payload.data : [payload];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;

    // Direct follower/following lists
    if (Array.isArray(item.followers) || Array.isArray(item.following) || Array.isArray(item.friends)) {
      return true;
    }

    // Profile-level counts (often present when lists were scraped)
    const author = item.author || item.user || item;
    if (author.followers || author.following || 
        author.followersCount || author.followingCount ||
        author.fastFollowersCount) {
      return true;
    }

    // Common Apify list scrape shapes
    if (item.target || (item.username && (item.followers || item.following))) {
      return true;
    }
  }
  return false;
}

export async function ingestApifyTwitter(
  env: { DB: D1Database; ARCHIVE: R2Bucket },
  investigationId: string,
  payload: any
): Promise<ApifyIngestResult> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE });

  const now = new Date().toISOString();

  // 1. Archive the full raw payload
  const rawBytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const { hash: rawHash } = await archive.put(rawBytes, {
    mimeType: 'application/json',
    extension: 'json',
  });

  await manifest.append({
    hash: rawHash,
    source: 'apify-twitter',
    collectedAt: now,
    investigationId,
    collectionMethod: { tool: 'apify', version: '1' },
    mimeType: 'application/json',
    status: 'present',
  } as any);

  const parsedTweets = parseApifyTwitterItems(payload);
  const handles = extractAllHandlesFromApifyTwitter(payload);

  let artifactsCreated = 0;

  // 2. Create one manifest entry per tweet
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
      collectionMethod: {
        tool: 'apify-twitter',
        version: '1',
        platform: 'twitter',
      },
      mimeType: 'application/json',
      status: 'present',
    } as any);

    artifactsCreated++;
  }

  // 3. Register seeds
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

  // 4. Build account extractors dynamically
  const baseExtractors = TWITTER_ACCOUNT_EXTRACTORS.filter(
    (e) => !/network/i.test(e.name)
  );

  const accountExtractors = [...baseExtractors];

  if (hasNetworkData(payload)) {
    const networkExtractor = ALL_ACCOUNT_EXTRACTORS.find(
      (e) => e.name === 'network_twitter'
    );
    if (networkExtractor) {
      accountExtractors.push(networkExtractor);
    }
  }

  // 5. Run extractors
  const accountRuns = await runAccountExtractors(env, {
    investigationId,
    extractors: accountExtractors,
    accountFilter: handles.length > 0 ? handles : undefined,
  });

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

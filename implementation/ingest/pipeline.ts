/**
 * Shared Twitter ingest + extraction pipeline.
 *
 * Used by the Cloudflare Worker (inline local dev) and the self-hosted
 * ingest container (production). Archives per-account artifacts to R2,
 * registers seeds, and runs extractors.
 */

import { ManifestStore } from '../archive/manifest';
import type { R2BucketLike } from '../archive/store';
import type { DatabaseClient } from '../db';
import { runAccountExtractors } from '../extractors/runner';
import { runPairExtractors } from '../extractors/pair-runner';
import { runEventExtractors } from '../extractors/event-runner';
import { runEngagementPairExtractors } from '../extractors/engagement-pair-runner';
import { runResponseLatencyExtraction } from '../extractors/temporal/response-latency';
import {
  aggregateParsedTweetsByAccount,
  archiveAccountTimelines,
} from './apify-timeline';
import {
  aggregateProfilesFromParsedTweets,
  archiveAccountProfiles,
} from './apify-profile';
import {
  archivePostedImageCorpora,
  buildPostedImageCorporaFromTimelines,
  buildProfileImageCorporaFromProfiles,
  enrichPostedImageCorporaWithDhash,
} from './apify-media-corpus';
import {
  archiveNetworkLists,
  extractNetworkListsFromPayload,
  payloadHasNetworkLists,
} from './apify-network-lists';
import {
  parseApifyTwitterItems,
  extractAllHandlesFromApifyTwitter,
  type ParsedTweet,
} from './apify-twitter-parser';
import {
  TWITTER_ACCOUNT_EXTRACTORS,
  TWITTER_PAIR_EXTRACTORS,
  TWITTER_EVENT_EXTRACTORS,
  TWITTER_ENGAGEMENT_PAIR_EXTRACTORS,
} from './twitter-extractors';
import { completeIngestJob } from './jobs';

export interface IngestPipelineEnv {
  db: DatabaseClient;
  archive: R2BucketLike;
}

export interface RunTwitterIngestPipelineContext {
  investigationId: string;
  payload: unknown;
  rawHash: string;
  jobId: string;
  parsedTweets?: ParsedTweet[];
  handles?: string[];
  now?: string;
}

export interface TwitterIngestPipelineResult {
  investigationId: string;
  rawPayloadHash: string;
  tweetsProcessed: number;
  uniqueAccounts: number;
  artifactsCreated: number;
  seedsRegistered: number;
  jobId: string;
  extractorsRan: boolean;
  accountExtractorRuns?: unknown[];
  eventExtractorRuns?: unknown[];
  pairExtractorRuns?: unknown[];
  engagementPairExtractorRuns?: unknown[];
  pairExtractorsSkipped?: boolean;
  pairExtractorsSkippedReason?: string;
}

function hasNetworkData(payload: unknown): boolean {
  return payloadHasNetworkLists(payload);
}

export async function runTwitterIngestPipeline(
  env: IngestPipelineEnv,
  ctx: RunTwitterIngestPipelineContext
): Promise<TwitterIngestPipelineResult> {
  const now = ctx.now ?? new Date().toISOString();
  const parsedTweets = ctx.parsedTweets ?? parseApifyTwitterItems(ctx.payload);
  const handles = ctx.handles ?? extractAllHandlesFromApifyTwitter(ctx.payload);

  const manifest = new ManifestStore({ bucket: env.archive });

  await manifest.append({
    hash: ctx.rawHash,
    source: 'apify-twitter',
    collectedAt: now,
    investigationId: ctx.investigationId,
    collectionMethod: { tool: 'apify', version: '1' },
    mimeType: 'application/json',
    status: 'present',
  } as never);

  const timelines = aggregateParsedTweetsByAccount(parsedTweets);
  const timelineArchive = await archiveAccountTimelines(
    { ARCHIVE: env.archive as R2Bucket },
    {
      investigationId: ctx.investigationId,
      timelines,
      collectedAt: now,
    }
  );

  const profiles = aggregateProfilesFromParsedTweets(parsedTweets);
  const profileArchive = await archiveAccountProfiles(
    { ARCHIVE: env.archive as R2Bucket },
    {
      investigationId: ctx.investigationId,
      profiles,
      collectedAt: now,
    }
  );

  const imageCorpora = buildPostedImageCorporaFromTimelines(timelines);
  const profileImageCorpora = buildProfileImageCorporaFromProfiles(profiles);
  const allImageCorpora = await enrichPostedImageCorporaWithDhash([
    ...imageCorpora,
    ...profileImageCorpora,
  ]);
  const imageCorpusArchive = await archivePostedImageCorpora(
    { ARCHIVE: env.archive as R2Bucket },
    {
      investigationId: ctx.investigationId,
      corpora: allImageCorpora,
      collectedAt: now,
    }
  );

  const networkLists = extractNetworkListsFromPayload(ctx.payload);
  const networkArchive = await archiveNetworkLists(
    { ARCHIVE: env.archive as R2Bucket },
    {
      investigationId: ctx.investigationId,
      lists: networkLists,
      collectedAt: now,
    }
  );

  const manifestHashes = [
    ...timelineArchive.manifestHashes,
    ...profileArchive.manifestHashes,
    ...imageCorpusArchive.manifestHashes,
    ...networkArchive.manifestHashes,
  ];
  const artifactsCreated =
    timelineArchive.artifactsCreated +
    profileArchive.artifactsCreated +
    imageCorpusArchive.artifactsCreated +
    networkArchive.artifactsCreated;

  let seedsRegistered = 0;
  for (const handle of handles) {
    try {
      await env.db
        .prepare(
          `INSERT IGNORE INTO seed_accounts
           (investigation_id, platform, account_identifier, basis_statement, added_at)
           VALUES (?, 'twitter', ?, 'Uploaded via Apify Twitter ingest', ?)`
        )
        .bind(ctx.investigationId, handle, now)
        .run();
      seedsRegistered++;
    } catch {
      // duplicate or constraint — continue
    }
  }

  await env.db
    .prepare(`UPDATE ingest_jobs SET manifest_hashes = ? WHERE job_id = ?`)
    .bind(JSON.stringify(manifestHashes), ctx.jobId)
    .run();

  const useNetwork = hasNetworkData(ctx.payload);
  const accountExtractors = TWITTER_ACCOUNT_EXTRACTORS.filter(
    (e) => !/network/i.test(e.name) || useNetwork
  );

  const runnerEnv = { DB: env.db, ARCHIVE: env.archive as R2Bucket };

  const accountRuns = await runAccountExtractors(runnerEnv, {
    investigationId: ctx.investigationId,
    extractors: accountExtractors,
    accountFilter: handles.length > 0 ? handles : undefined,
  });

  await runResponseLatencyExtraction(runnerEnv, {
    investigationId: ctx.investigationId,
    accountFilter: handles.length > 0 ? handles : undefined,
  });

  const eventRuns = await runEventExtractors(runnerEnv, {
    investigationId: ctx.investigationId,
    extractors: TWITTER_EVENT_EXTRACTORS,
    accountFilter: handles.length > 0 ? handles : undefined,
  });

  let pairRuns: unknown[] = [];
  let engagementPairRuns: unknown[] = [];
  let pairExtractorsSkipped = false;
  let pairExtractorsSkippedReason: string | undefined;

  if (handles.length >= 2) {
    pairRuns = await runPairExtractors(runnerEnv, {
      investigationId: ctx.investigationId,
      extractors: TWITTER_PAIR_EXTRACTORS,
      accountFilter: handles.length > 0 ? handles : undefined,
    });
    engagementPairRuns = await runEngagementPairExtractors(runnerEnv, {
      investigationId: ctx.investigationId,
      extractors: TWITTER_ENGAGEMENT_PAIR_EXTRACTORS,
      accountFilter: handles.length > 0 ? handles : undefined,
    });
  } else {
    pairExtractorsSkipped = true;
    pairExtractorsSkippedReason = `Pair extractors require at least 2 accounts; got ${handles.length}`;
  }

  await completeIngestJob(env.db, ctx.jobId, manifestHashes);

  return {
    investigationId: ctx.investigationId,
    rawPayloadHash: ctx.rawHash,
    tweetsProcessed: parsedTweets.length,
    uniqueAccounts: handles.length,
    artifactsCreated,
    seedsRegistered,
    jobId: ctx.jobId,
    extractorsRan: true,
    accountExtractorRuns: accountRuns,
    eventExtractorRuns: eventRuns,
    pairExtractorRuns: pairRuns,
    engagementPairExtractorRuns: engagementPairRuns,
    pairExtractorsSkipped,
    pairExtractorsSkippedReason,
  };
}

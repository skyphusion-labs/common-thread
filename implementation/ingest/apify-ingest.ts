// implementation/ingest/apify-ingest.ts

import { ArchiveStore } from '../archive/store';
import { parseApifyTwitterItems, extractAllHandlesFromApifyTwitter } from './apify-twitter-parser';
import { runAccountExtractors } from '../extractors/runner';
import { runPairExtractors } from '../extractors/pair-runner';
import {
  ALL_ACCOUNT_EXTRACTORS,
  ALL_PAIR_EXTRACTORS,
} from '../extractors';
import type { AccountFeatureExtractor } from '../extractors/types';
import type { PairFeatureExtractor } from '../extractors/pair-types';
import type { Env } from '../workers/index';
import { execute, resolveDatabase } from '../db';
import { dispatchIngestJob } from './dispatch';

export interface ApifyIngestResult {
  investigationId: string;
  rawPayloadHash: string;
  tweetsProcessed: number;
  uniqueAccounts: number;
  artifactsCreated: number;
  seedsRegistered: number;
  jobId?: string;
  delegatedToVpc?: boolean;
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

  return items.some((item: any) =>
    item &&
    (Array.isArray(item.followers) ||
     Array.isArray(item.following) ||
     Array.isArray(item.friends) ||
     item.followers || item.following ||
     (item.author && (item.author.followers || item.author.following)))
  );
}

function vpcIngestEnabled(env: Env): boolean {
  return Boolean(env.VPC_INGEST && env.INGEST_WORKER_URL);
}

/**
 * Ingest an Apify Twitter export.
 *
 * Production path (VPC_INGEST configured): archive raw JSON once, enqueue job,
 * dispatch to self-hosted Docker over Workers VPC. Per-tweet R2 writes and
 * extraction run on the ingest worker with local disk.
 *
 * Fallback (no VPC): optional inline extraction when runExtractors=true for
 * local development only.
 */
export async function ingestApifyTwitter(
  env: Env,
  investigationId: string,
  payload: any,
  runExtractors: boolean = false
): Promise<ApifyIngestResult> {
  const parsedTweets = parseApifyTwitterItems(payload);
  const handles = extractAllHandlesFromApifyTwitter(payload);
  const now = new Date().toISOString();
  const jobId = `job_${crypto.randomUUID()}`;

  // Archive the raw export once. The ingest worker fetches this by hash.
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const rawBytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const { hash: rawHash } = await archive.put(rawBytes, {
    mimeType: 'application/json',
    extension: 'json',
  });

  await execute(
    env.DB,
    `INSERT INTO ingest_jobs 
     (job_id, investigation_id, provider, status, item_count, manifest_hashes, raw_file_hashes, created_at)
     VALUES (?, ?, 'twitter', 'queued', ?, ?, ?, ?)`,
    [
      jobId,
      investigationId,
      parsedTweets.length,
      JSON.stringify([]),
      JSON.stringify([rawHash]),
      now,
    ]
  );

  if (vpcIngestEnabled(env)) {
    const dispatchResponse = await dispatchIngestJob(env, {
      jobId,
      investigationId,
      provider: 'twitter',
      rawFileHash: rawHash,
      runExtractors,
      itemCount: parsedTweets.length,
      accounts: handles,
    });

    if (!dispatchResponse.ok) {
      const detail = await dispatchResponse.text();
      await execute(
        env.DB,
        `UPDATE ingest_jobs SET status = 'failed', error_message = ? WHERE job_id = ?`,
        [`Ingest worker dispatch failed: ${dispatchResponse.status} ${detail}`, jobId]
      );
      throw new Error(`Ingest worker dispatch failed: ${dispatchResponse.status}`);
    }

    return {
      investigationId,
      rawPayloadHash: rawHash,
      tweetsProcessed: parsedTweets.length,
      uniqueAccounts: handles.length,
      artifactsCreated: 0,
      seedsRegistered: 0,
      jobId,
      delegatedToVpc: true,
    };
  }

  if (!runExtractors) {
    throw new Error(
      'VPC_INGEST is not configured and runExtractors is false. ' +
        'Configure [[vpc_services]] and INGEST_WORKER_URL, or pass ?runExtractors=true for local dev.'
    );
  }

  // Local dev fallback: inline extraction (still archives per-tweet to R2).
  return runInlineIngest(env, {
    investigationId,
    payload,
    rawHash,
    jobId,
    parsedTweets,
    handles,
    now,
  });
}

async function runInlineIngest(
  env: Env,
  ctx: {
    investigationId: string;
    payload: any;
    rawHash: string;
    jobId: string;
    parsedTweets: ReturnType<typeof parseApifyTwitterItems>;
    handles: string[];
    now: string;
  }
): Promise<ApifyIngestResult> {
  const { ManifestStore } = await import('../archive/manifest');
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE });

  await manifest.append({
    hash: ctx.rawHash,
    source: 'apify-twitter',
    collectedAt: ctx.now,
    investigationId: ctx.investigationId,
    collectionMethod: { tool: 'apify', version: '1' },
    mimeType: 'application/json',
    status: 'present',
  } as any);

  const manifestHashes: string[] = [];
  for (const pt of ctx.parsedTweets) {
    const tweetBytes = new TextEncoder().encode(JSON.stringify(pt.tweet));
    const { hash: tweetHash } = await archive.put(tweetBytes, {
      mimeType: 'application/json',
      extension: 'json',
    });

    await manifest.append({
      hash: tweetHash,
      account: pt.account,
      source: 'apify-twitter',
      collectedAt: pt.collectedAt || ctx.now,
      investigationId: ctx.investigationId,
      collectionMethod: {
        tool: 'apify-twitter',
        version: '1',
        platform: 'twitter',
      },
      mimeType: 'application/json',
      status: 'present',
    } as any);

    manifestHashes.push(tweetHash);
  }

  let seedsRegistered = 0;
  for (const handle of ctx.handles) {
    try {
      await execute(
        env.DB,
        `INSERT IGNORE INTO seed_accounts 
         (investigation_id, platform, account_identifier, basis_statement, added_at)
         VALUES (?, 'twitter', ?, 'Uploaded via Apify Twitter ingest', ?)`,
        [ctx.investigationId, handle, ctx.now]
      );
      seedsRegistered++;
    } catch {}
  }

  await execute(
    env.DB,
    `UPDATE ingest_jobs SET manifest_hashes = ? WHERE job_id = ?`,
    [JSON.stringify(manifestHashes), ctx.jobId]
  );

  const useNetwork = hasNetworkData(ctx.payload);
  const accountExtractors = TWITTER_ACCOUNT_EXTRACTORS.filter(e =>
    !/network/i.test(e.name) || useNetwork
  );

  const db = resolveDatabase(env.DB);
  const accountRuns = await runAccountExtractors(
    { DB: db, ARCHIVE: env.ARCHIVE },
    {
      investigationId: ctx.investigationId,
      extractors: accountExtractors,
      accountFilter: ctx.handles.length > 0 ? ctx.handles : undefined,
    }
  );

  let pairRuns: any[] = [];
  let pairExtractorsSkipped = false;
  let pairExtractorsSkippedReason: string | undefined;

  if (ctx.handles.length >= 2) {
    pairRuns = await runPairExtractors(
      { DB: db, ARCHIVE: env.ARCHIVE },
      {
        investigationId: ctx.investigationId,
        extractors: TWITTER_PAIR_EXTRACTORS,
        accountFilter: ctx.handles.length > 0 ? ctx.handles : undefined,
      }
    );
  } else {
    pairExtractorsSkipped = true;
    pairExtractorsSkippedReason = `Pair extractors require at least 2 accounts; got ${ctx.handles.length}`;
  }

  await execute(env.DB, `UPDATE ingest_jobs SET status = 'completed' WHERE job_id = ?`, [ctx.jobId]);

  return {
    investigationId: ctx.investigationId,
    rawPayloadHash: ctx.rawHash,
    tweetsProcessed: ctx.parsedTweets.length,
    uniqueAccounts: ctx.handles.length,
    artifactsCreated: manifestHashes.length,
    seedsRegistered,
    jobId: ctx.jobId,
    delegatedToVpc: false,
    accountExtractorRuns: accountRuns,
    pairExtractorRuns: pairRuns,
    pairExtractorsSkipped,
    pairExtractorsSkippedReason,
  };
}

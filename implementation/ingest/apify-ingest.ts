// implementation/ingest/apify-ingest.ts

import { ArchiveStore } from '../archive/store';
import { execute, resolveDatabase } from '../db';
import { dispatchIngestJob } from './dispatch';
import {
  parseApifyTwitterItems,
  extractAllHandlesFromApifyTwitter,
} from './apify-twitter-parser';
import { runTwitterIngestPipeline } from './pipeline';
import type { Env } from '../workers/index';

export type { ApifyIngestResult } from './apify-ingest-types';
export {
  TWITTER_ACCOUNT_EXTRACTORS,
  TWITTER_PAIR_EXTRACTORS,
  TWITTER_EVENT_EXTRACTORS,
  TWITTER_ENGAGEMENT_PAIR_EXTRACTORS,
} from './twitter-extractors';

import type { ApifyIngestResult } from './apify-ingest-types';

function vpcIngestEnabled(env: Env): boolean {
  return Boolean(env.VPC_INGEST && env.INGEST_WORKER_URL && env.INGEST_SECRET);
}

/**
 * Ingest an Apify Twitter export.
 *
 * Production (VPC_INGEST configured): archive raw JSON once, enqueue job,
 * dispatch to the self-hosted extraction container, return immediately.
 *
 * Local dev fallback: runs the full archive + extraction pipeline inline.
 */
export async function ingestApifyTwitter(
  env: Env,
  investigationId: string,
  payload: unknown
): Promise<ApifyIngestResult> {
  const parsedTweets = parseApifyTwitterItems(payload);
  const handles = extractAllHandlesFromApifyTwitter(payload);
  const now = new Date().toISOString();
  const jobId = `job_${crypto.randomUUID()}`;

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
     VALUES (?, ?, 'twitter', ?, ?, ?, ?, ?)`,
    [
      jobId,
      investigationId,
      vpcIngestEnabled(env) ? 'queued' : 'running',
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
      delegatedToContainer: true,
      extractorsRan: false,
    };
  }

  const db = resolveDatabase(env.DB);
  const result = await runTwitterIngestPipeline(
    { db, archive: env.ARCHIVE, manifestCoordinator: env.MANIFEST_COORDINATOR },
    {
      investigationId,
      payload,
      rawHash,
      jobId,
      parsedTweets,
      handles,
      now,
    }
  );

  return { ...result, delegatedToContainer: false };
}

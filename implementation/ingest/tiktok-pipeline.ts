/**
 * TikTok ingest + extraction pipeline.
 */

import type { R2BucketLike } from '../archive/store';
import type { DatabaseClient } from '../db';
import { runAccountExtractors } from '../extractors/runner';
import { runPairExtractors } from '../extractors/pair-runner';
import { parseInvestigationMetadata } from '../investigations/metadata';
import { packTextCell, readTextCell } from '../crypto/feature-cells';
import { completeIngestJob } from './jobs';
import { manifestStoreFor, type ArchiveManifestBinding } from './manifest-env';
import { archiveAccountTimelines } from './apify-timeline';
import { aggregateTikTokByAccount, extractTikTokHandles } from './tiktok-parser';
import { TIKTOK_ACCOUNT_EXTRACTORS, TIKTOK_PAIR_EXTRACTORS } from './platform-extractors';
import type { TwitterIngestPipelineResult } from './pipeline';
import { parseTimestamp } from '../extractors/temporal/helpers';

export const APIFY_TIKTOK_TIMELINE_TOOL = 'apify-tiktok-timeline';

export interface IngestPipelineEnv {
  db: DatabaseClient;
  archive: R2BucketLike;
  manifestCoordinator?: DurableObjectNamespace;
  manifestRemoteAppend?: ArchiveManifestBinding['MANIFEST_REMOTE_APPEND'];
}

export interface RunTikTokIngestContext {
  investigationId: string;
  payload: unknown;
  rawHash: string;
  jobId: string;
  now?: string;
  encKey?: CryptoKey | null;
  skipComplete?: boolean;
}

function manifestBinding(env: IngestPipelineEnv): ArchiveManifestBinding {
  return {
    ARCHIVE: env.archive as R2Bucket,
    MANIFEST_COORDINATOR: env.manifestCoordinator,
    MANIFEST_REMOTE_APPEND: env.manifestRemoteAppend,
  };
}

export async function runTikTokIngestPipeline(
  env: IngestPipelineEnv,
  ctx: RunTikTokIngestContext
): Promise<TwitterIngestPipelineResult> {
  const now = ctx.now ?? new Date().toISOString();
  const handles = extractTikTokHandles(ctx.payload);
  const archiveEnv = manifestBinding(env);
  const manifest = manifestStoreFor(archiveEnv, ctx.investigationId);

  await manifest.append({
    hash: ctx.rawHash,
    source: 'apify-tiktok',
    collectedAt: now,
    investigationId: ctx.investigationId,
    collectionMethod: { tool: 'apify', version: '1', platform: 'tiktok' },
    mimeType: 'application/json',
    status: 'present',
  } as never);

  const metaRow = await env.db
    .prepare('SELECT metadata_json FROM investigations WHERE id = ?')
    .bind(ctx.investigationId)
    .first<{ metadata_json: string | null }>();
  const metadataPlain = await readTextCell(metaRow?.metadata_json ?? null, {
    key: ctx.encKey ?? null,
    investigationId: ctx.investigationId,
    column: 'investigations.metadata_json',
  });
  const timeBounds = parseInvestigationMetadata(metadataPlain).time_bounds;

  let listings = aggregateTikTokByAccount(ctx.payload);
  if (timeBounds) {
    const startMs = Date.parse(timeBounds.start);
    const endMs = Date.parse(timeBounds.end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      listings = listings
        .map((listing) => ({
          ...listing,
          posts: listing.posts.filter((post) => {
            const ms = parseTimestamp(post.createdAt);
            return ms !== null && ms >= startMs && ms <= endMs;
          }),
        }))
        .filter((listing) => listing.posts.length > 0);
    }
  }

  const timelineArchive = await archiveAccountTimelines(archiveEnv, {
    investigationId: ctx.investigationId,
    timelines: listings.map((listing) => ({ account: listing.account, tweets: listing.posts })),
    collectedAt: now,
    timeBounds,
    tool: APIFY_TIKTOK_TIMELINE_TOOL,
    platform: 'tiktok',
    sourceFor: (account) => `https://www.tiktok.com/@${account}`,
    itemCountKey: 'post_count',
  });

  let seedsRegistered = 0;
  for (const handle of handles) {
    try {
      const basis = await packTextCell('Uploaded via Apify TikTok ingest', {
        key: ctx.encKey ?? null,
        investigationId: ctx.investigationId,
        column: 'seed_accounts.basis_statement',
      });
      await env.db
        .prepare(
          `INSERT IGNORE INTO seed_accounts
           (investigation_id, platform, account_identifier, basis_statement, added_at)
           VALUES (?, 'tiktok', ?, ?, ?)`
        )
        .bind(ctx.investigationId, handle, basis, now)
        .run();
      seedsRegistered++;
    } catch {
      // duplicate
    }
  }

  await env.db
    .prepare(`UPDATE ingest_jobs SET manifest_hashes = ? WHERE job_id = ?`)
    .bind(JSON.stringify(timelineArchive.manifestHashes), ctx.jobId)
    .run();

  const runnerEnv = { DB: env.db, ARCHIVE: env.archive as R2Bucket };
  const encKey = ctx.encKey ?? null;
  const accountRuns = await runAccountExtractors(runnerEnv, {
    investigationId: ctx.investigationId,
    extractors: TIKTOK_ACCOUNT_EXTRACTORS,
    accountFilter: handles.length > 0 ? handles : undefined,
    encKey,
  });

  let pairRuns: unknown[] = [];
  let pairExtractorsSkipped = false;
  let pairExtractorsSkippedReason: string | undefined;
  if (handles.length >= 2) {
    pairRuns = await runPairExtractors(runnerEnv, {
      investigationId: ctx.investigationId,
      extractors: TIKTOK_PAIR_EXTRACTORS,
      accountFilter: handles,
      encKey,
    });
  } else {
    pairExtractorsSkipped = true;
    pairExtractorsSkippedReason = `Pair extractors require at least 2 accounts; got ${handles.length}`;
  }

  if (!ctx.skipComplete) {
    await completeIngestJob(env.db, ctx.jobId, timelineArchive.manifestHashes);
  }

  return {
    investigationId: ctx.investigationId,
    rawPayloadHash: ctx.rawHash,
    tweetsProcessed: listings.reduce((n, l) => n + l.posts.length, 0),
    uniqueAccounts: handles.length,
    artifactsCreated: timelineArchive.artifactsCreated,
    seedsRegistered,
    jobId: ctx.jobId,
    extractorsRan: true,
    accountExtractorRuns: accountRuns,
    pairExtractorRuns: pairRuns,
    pairExtractorsSkipped,
    pairExtractorsSkippedReason,
  };
}

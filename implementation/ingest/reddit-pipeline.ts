/**
 * Reddit ingest + extraction pipeline.
 *
 * Normalizes Apify Reddit rows (and native listings) into per-account
 * children, archives them, registers seeds, and runs Reddit stylometric /
 * temporal / account-metadata extractors plus shared pair extractors.
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
import {
  aggregateRedditByAccount,
  extractRedditHandles,
} from './reddit-parser';
import { REDDIT_ACCOUNT_EXTRACTORS, REDDIT_PAIR_EXTRACTORS } from './platform-extractors';
import type { TwitterIngestPipelineResult } from './pipeline';

export const APIFY_REDDIT_LISTING_TOOL = 'apify-reddit-listing';

export interface IngestPipelineEnv {
  db: DatabaseClient;
  archive: R2BucketLike;
  manifestCoordinator?: DurableObjectNamespace;
  manifestRemoteAppend?: ArchiveManifestBinding['MANIFEST_REMOTE_APPEND'];
}

export interface RunRedditIngestContext {
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

export async function runRedditIngestPipeline(
  env: IngestPipelineEnv,
  ctx: RunRedditIngestContext
): Promise<TwitterIngestPipelineResult> {
  const now = ctx.now ?? new Date().toISOString();
  const handles = extractRedditHandles(ctx.payload);
  const archiveEnv = manifestBinding(env);
  const manifest = manifestStoreFor(archiveEnv, ctx.investigationId);

  await manifest.append({
    hash: ctx.rawHash,
    source: 'apify-reddit',
    collectedAt: now,
    investigationId: ctx.investigationId,
    collectionMethod: { tool: 'apify', version: '1', platform: 'reddit' },
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

  let listings = aggregateRedditByAccount(ctx.payload);
  if (timeBounds) {
    const startMs = Date.parse(timeBounds.start);
    const endMs = Date.parse(timeBounds.end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      listings = listings
        .map((listing) => ({
          ...listing,
          children: listing.children.filter((child) => {
            const ms = child.data.created_utc * 1000;
            return ms >= startMs && ms <= endMs;
          }),
        }))
        .filter((listing) => listing.children.length > 0);
    }
  }

  const timelines = listings.map((listing) => ({
    account: listing.account,
    tweets: listing.children,
  }));

  const timelineArchive = await archiveAccountTimelines(archiveEnv, {
    investigationId: ctx.investigationId,
    timelines,
    collectedAt: now,
    timeBounds,
    tool: APIFY_REDDIT_LISTING_TOOL,
    platform: 'reddit',
    sourceFor: (account) => `https://www.reddit.com/user/${account}/`,
    itemCountKey: 'item_count',
  });

  let seedsRegistered = 0;
  for (const handle of handles) {
    try {
      const basis = await packTextCell('Uploaded via Apify Reddit ingest', {
        key: ctx.encKey ?? null,
        investigationId: ctx.investigationId,
        column: 'seed_accounts.basis_statement',
      });
      await env.db
        .prepare(
          `INSERT IGNORE INTO seed_accounts
           (investigation_id, platform, account_identifier, basis_statement, added_at)
           VALUES (?, 'reddit', ?, ?, ?)`
        )
        .bind(ctx.investigationId, handle, basis, now)
        .run();
      seedsRegistered++;
    } catch {
      // duplicate or constraint
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
    extractors: REDDIT_ACCOUNT_EXTRACTORS,
    accountFilter: handles.length > 0 ? handles : undefined,
    encKey,
  });

  let pairRuns: unknown[] = [];
  let pairExtractorsSkipped = false;
  let pairExtractorsSkippedReason: string | undefined;
  if (handles.length >= 2) {
    pairRuns = await runPairExtractors(runnerEnv, {
      investigationId: ctx.investigationId,
      extractors: REDDIT_PAIR_EXTRACTORS,
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
    tweetsProcessed: listings.reduce((n, l) => n + l.children.length, 0),
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

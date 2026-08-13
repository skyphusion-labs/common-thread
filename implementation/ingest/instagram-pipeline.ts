/**
 * Instagram ingest + extraction pipeline.
 *
 * Archives per-account post lists from Apify Instagram scrapers, registers
 * seeds, and runs the Instagram stylometric / temporal extractors plus the
 * shared pair extractors.
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
  aggregateInstagramPostsByAccount,
  extractInstagramHandles,
} from './instagram-parser';
import { INSTAGRAM_ACCOUNT_EXTRACTORS, INSTAGRAM_PAIR_EXTRACTORS } from './platform-extractors';
import type { TwitterIngestPipelineResult } from './pipeline';

export const APIFY_INSTAGRAM_TIMELINE_TOOL = 'apify-instagram-timeline';

export interface IngestPipelineEnv {
  db: DatabaseClient;
  archive: R2BucketLike;
  manifestCoordinator?: DurableObjectNamespace;
  manifestRemoteAppend?: ArchiveManifestBinding['MANIFEST_REMOTE_APPEND'];
}

export interface RunInstagramIngestContext {
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

export async function runInstagramIngestPipeline(
  env: IngestPipelineEnv,
  ctx: RunInstagramIngestContext
): Promise<TwitterIngestPipelineResult> {
  const now = ctx.now ?? new Date().toISOString();
  const handles = extractInstagramHandles(ctx.payload);
  const archiveEnv = manifestBinding(env);
  const manifest = manifestStoreFor(archiveEnv, ctx.investigationId);

  await manifest.append({
    hash: ctx.rawHash,
    source: 'apify-instagram',
    collectedAt: now,
    investigationId: ctx.investigationId,
    collectionMethod: { tool: 'apify', version: '1', platform: 'instagram' },
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

  let listings = aggregateInstagramPostsByAccount(ctx.payload);
  if (timeBounds) {
    const startMs = Date.parse(timeBounds.start);
    const endMs = Date.parse(timeBounds.end);
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
      listings = listings
        .map((listing) => ({
          ...listing,
          posts: listing.posts.filter((post) => {
            const raw = post.timestamp ?? post.createdAt ?? post.createTimeISO;
            const ms = typeof raw === 'number' ? (raw > 1e12 ? raw : raw * 1000) : Date.parse(String(raw ?? ''));
            return Number.isFinite(ms) && ms >= startMs && ms <= endMs;
          }),
        }))
        .filter((listing) => listing.posts.length > 0);
    }
  }

  const timelines = listings.map((listing) => ({
    account: listing.account,
    tweets: listing.posts,
  }));

  const timelineArchive = await archiveAccountTimelines(archiveEnv, {
    investigationId: ctx.investigationId,
    timelines,
    collectedAt: now,
    timeBounds,
    tool: APIFY_INSTAGRAM_TIMELINE_TOOL,
    platform: 'instagram',
    sourceFor: (account) => `https://www.instagram.com/${account}/`,
    itemCountKey: 'post_count',
  });

  let seedsRegistered = 0;
  for (const handle of handles) {
    try {
      const basis = await packTextCell('Uploaded via Apify Instagram ingest', {
        key: ctx.encKey ?? null,
        investigationId: ctx.investigationId,
        column: 'seed_accounts.basis_statement',
      });
      await env.db
        .prepare(
          `INSERT IGNORE INTO seed_accounts
           (investigation_id, platform, account_identifier, basis_statement, added_at)
           VALUES (?, 'instagram', ?, ?, ?)`
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
    extractors: INSTAGRAM_ACCOUNT_EXTRACTORS,
    accountFilter: handles.length > 0 ? handles : undefined,
    encKey,
  });

  let pairRuns: unknown[] = [];
  let pairExtractorsSkipped = false;
  let pairExtractorsSkippedReason: string | undefined;
  if (handles.length >= 2) {
    pairRuns = await runPairExtractors(runnerEnv, {
      investigationId: ctx.investigationId,
      extractors: INSTAGRAM_PAIR_EXTRACTORS,
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

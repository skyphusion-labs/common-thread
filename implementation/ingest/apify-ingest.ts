// implementation/ingest/apify-ingest.ts

import { ArchiveStore } from '../archive/store';
import { execute, readCommittedRow, resolveDatabase } from '../db';
import { sealInvestigationKeyForVpcHandoff } from '../crypto/investigation-key';
import { dispatchIngestJob } from './dispatch';
import {
  parseApifyTwitterItems,
  extractAllHandlesFromApifyTwitter,
} from './apify-twitter-parser';
import { runTwitterIngestPipeline } from './pipeline';
import { runInstagramIngestPipeline } from './instagram-pipeline';
import { runRedditIngestPipeline } from './reddit-pipeline';
import { runBlueskyIngestPipeline } from './bluesky-pipeline';
import { runMastodonIngestPipeline } from './mastodon-pipeline';
import { runTikTokIngestPipeline } from './tiktok-pipeline';
import { runYouTubeIngestPipeline } from './youtube-pipeline';
import { runFacebookIngestPipeline } from './facebook-pipeline';
import { completeIngestJob } from './jobs';
import { extractInstagramHandles } from './instagram-parser';
import { extractRedditHandles } from './reddit-parser';
import { extractBlueskyHandles } from './bluesky-parser';
import { extractMastodonHandles } from './mastodon-parser';
import { extractTikTokHandles } from './tiktok-parser';
import { extractYouTubeHandles } from './youtube-parser';
import { extractFacebookHandles } from './facebook-parser';
import { dominantProvider as detectDominant, splitApifyPayload } from './platform-detect';
import type { Env } from '../workers/index';
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
 * Thrown when an encrypted investigation would have been ingested without a
 * request-scoped key (would write plaintext features / basis). Callers map
 * this to HTTP 400/503 as appropriate.
 */
export class EncryptedIngestKeyRequiredError extends Error {
  override name = 'EncryptedIngestKeyRequiredError';
  constructor(investigationId: string) {
    super(
      `Investigation ${investigationId} is encrypted at rest; ingest requires the request-scoped encryption key (key-on-dispatch or inline).`
    );
  }
}

/**
 * Ingest an Apify Twitter export.
 *
 * Production (VPC_INGEST configured): archive raw JSON once, enqueue job,
 * dispatch to the self-hosted extraction container, return immediately.
 *
 * Encrypted investigations (#246 / §3.5): VPC dispatch is allowed when the
 * request-scoped key is present; raw key material is sent only in the VPC
 * handoff body (never written to ingest_jobs). Missing key on crypto_version
 * investigations fails closed.
 *
 * Local dev / no VPC: full pipeline inline.
 */
export async function ingestApifyTwitter(
  env: Env,
  investigationId: string,
  payload: unknown,
  options?: {
    encKey?: CryptoKey | null;
    /** Access token for sealing VPC handoff material (#246). Required when encrypted + VPC. */
    accessToken?: string;
  }
): Promise<ApifyIngestResult> {
  const encKey = options?.encKey ?? null;
  const accessToken = options?.accessToken;
  const parsedTweets = parseApifyTwitterItems(payload);
  const handles = extractAllHandlesFromApifyTwitter(payload);
  const now = new Date().toISOString();
  const jobId = `job_${crypto.randomUUID()}`;

  // crypto_version is the durable encryption flag. Read COMMITTED (not the
  // Hyperdrive query cache): the container talks to MySQL primary and will
  // fail closed if we skip key material because a cached read said "plaintext"
  // while the row is already encrypted (#246 live miss 2026-08-04).
  const inv = await readCommittedRow<{ crypto_version: string | null }>(
    env.DB,
    'SELECT crypto_version FROM investigations WHERE id = ?',
    [investigationId]
  );
  // Also treat a present request-scoped key as encrypted (create always encrypts
  // now; belt against any remaining replica lag on crypto_version).
  const isEncrypted = Boolean(inv?.crypto_version) || Boolean(encKey);
  if (isEncrypted && !encKey) {
    throw new EncryptedIngestKeyRequiredError(investigationId);
  }

  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const rawBytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const { hash: rawHash } = await archive.put(rawBytes, {
    mimeType: 'application/json',
    extension: 'json',
  });

  // VPC when bound. Encrypted jobs carry key material in the handoff (#246).
  const useVpc = vpcIngestEnabled(env);

  await execute(
    env.DB,
    `INSERT INTO ingest_jobs
     (job_id, investigation_id, provider, status, item_count, manifest_hashes, raw_file_hashes, created_at)
     VALUES (?, ?, 'twitter', ?, ?, ?, ?, ?)`,
    [
      jobId,
      investigationId,
      useVpc ? 'queued' : 'running',
      parsedTweets.length,
      JSON.stringify([]),
      JSON.stringify([rawHash]),
      now,
    ]
  );

  if (useVpc) {
    let encryptionKeyMaterial: string | undefined;
    // Prefer sealing whenever the capability token is present: container
    // ignores material on legacy plaintext rows, and Hyperdrive lag must not
    // strip material from an encrypted inv (container fail-closed message).
    if (accessToken && env.INGEST_SECRET) {
      encryptionKeyMaterial = await sealInvestigationKeyForVpcHandoff(
        accessToken,
        investigationId,
        env.INGEST_SECRET
      );
    } else if (isEncrypted) {
      throw new EncryptedIngestKeyRequiredError(investigationId);
    }
    const dispatchResponse = await dispatchIngestJob(env, {
      jobId,
      investigationId,
      provider: 'twitter',
      rawFileHash: rawHash,
      itemCount: parsedTweets.length,
      accounts: handles,
      manifestAppendBaseUrl: env.PUBLIC_API_BASE_URL
        ? `${env.PUBLIC_API_BASE_URL.replace(/\/$/, '')}/internal/manifest`
        : undefined,
      encryptionKeyMaterial,
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
      encKey,
    }
  );

  return { ...result, delegatedToContainer: false };
}

export class EmptyApifyIngestError extends Error {
  override name = 'EmptyApifyIngestError';
  constructor() {
    super('No supported social items found in the upload');
  }
}

export async function ingestApify(
  env: Env,
  investigationId: string,
  payload: unknown,
  options?: {
    encKey?: CryptoKey | null;
    accessToken?: string;
  }
): Promise<ApifyIngestResult> {
  const split = splitApifyPayload(payload);
  const provider = detectDominant(split);
  if (!provider) throw new EmptyApifyIngestError();
  if (provider === 'twitter') {
    return ingestApifyTwitter(env, investigationId, payload, options);
  }
  return ingestApifyExport(env, investigationId, payload, provider, options);
}

export async function ingestApifyInstagram(
  env: Env,
  investigationId: string,
  payload: unknown,
  options?: {
    encKey?: CryptoKey | null;
    accessToken?: string;
  }
): Promise<ApifyIngestResult> {
  return ingestApifyExport(env, investigationId, payload, 'instagram', options);
}

export async function ingestApifyReddit(
  env: Env,
  investigationId: string,
  payload: unknown,
  options?: {
    encKey?: CryptoKey | null;
    accessToken?: string;
  }
): Promise<ApifyIngestResult> {
  return ingestApifyExport(env, investigationId, payload, 'reddit', options);
}

export async function ingestApifyBluesky(
  env: Env,
  investigationId: string,
  payload: unknown,
  options?: {
    encKey?: CryptoKey | null;
    accessToken?: string;
  }
): Promise<ApifyIngestResult> {
  return ingestApifyExport(env, investigationId, payload, 'bluesky', options);
}

export async function ingestApifyMastodon(
  env: Env,
  investigationId: string,
  payload: unknown,
  options?: {
    encKey?: CryptoKey | null;
    accessToken?: string;
  }
): Promise<ApifyIngestResult> {
  return ingestApifyExport(env, investigationId, payload, 'mastodon', options);
}

export async function ingestApifyTikTok(
  env: Env,
  investigationId: string,
  payload: unknown,
  options?: {
    encKey?: CryptoKey | null;
    accessToken?: string;
  }
): Promise<ApifyIngestResult> {
  return ingestApifyExport(env, investigationId, payload, 'tiktok', options);
}

export async function ingestApifyYouTube(
  env: Env,
  investigationId: string,
  payload: unknown,
  options?: {
    encKey?: CryptoKey | null;
    accessToken?: string;
  }
): Promise<ApifyIngestResult> {
  return ingestApifyExport(env, investigationId, payload, 'youtube', options);
}

export async function ingestApifyFacebook(
  env: Env,
  investigationId: string,
  payload: unknown,
  options?: {
    encKey?: CryptoKey | null;
    accessToken?: string;
  }
): Promise<ApifyIngestResult> {
  return ingestApifyExport(env, investigationId, payload, 'facebook', options);
}

async function ingestApifyExport(
  env: Env,
  investigationId: string,
  payload: unknown,
  provider: 'instagram' | 'reddit' | 'bluesky' | 'mastodon' | 'tiktok' | 'youtube' | 'facebook' | 'mixed',
  options?: {
    encKey?: CryptoKey | null;
    accessToken?: string;
  }
): Promise<ApifyIngestResult> {
  const encKey = options?.encKey ?? null;
  const accessToken = options?.accessToken;
  const split = splitApifyPayload(payload);
  const handles = [
    ...extractAllHandlesFromApifyTwitter(split.twitter),
    ...extractInstagramHandles(split.instagram),
    ...extractRedditHandles(split.reddit),
    ...extractBlueskyHandles(split.bluesky),
    ...extractMastodonHandles(split.mastodon),
    ...extractTikTokHandles(split.tiktok),
    ...extractYouTubeHandles(split.youtube),
    ...extractFacebookHandles(split.facebook),
  ];
  const itemCount =
    split.twitter.length +
    split.instagram.length +
    split.reddit.length +
    split.bluesky.length +
    split.mastodon.length +
    split.tiktok.length +
    split.youtube.length +
    split.facebook.length;
  const now = new Date().toISOString();
  const jobId = `job_${crypto.randomUUID()}`;

  const inv = await readCommittedRow<{ crypto_version: string | null }>(
    env.DB,
    'SELECT crypto_version FROM investigations WHERE id = ?',
    [investigationId]
  );
  const isEncrypted = Boolean(inv?.crypto_version) || Boolean(encKey);
  if (isEncrypted && !encKey) {
    throw new EncryptedIngestKeyRequiredError(investigationId);
  }

  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const rawBytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const { hash: rawHash } = await archive.put(rawBytes, {
    mimeType: 'application/json',
    extension: 'json',
  });

  const useVpc = vpcIngestEnabled(env);

  await execute(
    env.DB,
    `INSERT INTO ingest_jobs
     (job_id, investigation_id, provider, status, item_count, manifest_hashes, raw_file_hashes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      jobId,
      investigationId,
      provider,
      useVpc ? 'queued' : 'running',
      itemCount,
      JSON.stringify([]),
      JSON.stringify([rawHash]),
      now,
    ]
  );

  if (useVpc) {
    let encryptionKeyMaterial: string | undefined;
    if (accessToken && env.INGEST_SECRET) {
      encryptionKeyMaterial = await sealInvestigationKeyForVpcHandoff(
        accessToken,
        investigationId,
        env.INGEST_SECRET
      );
    } else if (isEncrypted) {
      throw new EncryptedIngestKeyRequiredError(investigationId);
    }
    const dispatchResponse = await dispatchIngestJob(env, {
      jobId,
      investigationId,
      provider,
      rawFileHash: rawHash,
      itemCount,
      accounts: handles,
      manifestAppendBaseUrl: env.PUBLIC_API_BASE_URL
        ? `${env.PUBLIC_API_BASE_URL.replace(/\/$/, '')}/internal/manifest`
        : undefined,
      encryptionKeyMaterial,
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
      tweetsProcessed: itemCount,
      uniqueAccounts: handles.length,
      artifactsCreated: 0,
      seedsRegistered: 0,
      jobId,
      delegatedToContainer: true,
      extractorsRan: false,
    };
  }

  const db = resolveDatabase(env.DB);
  const pipelineEnv = {
    db,
    archive: env.ARCHIVE,
    manifestCoordinator: env.MANIFEST_COORDINATOR,
  };
  const skipComplete = provider === 'mixed';
  const results: ApifyIngestResult[] = [];

  if (split.twitter.length > 0) {
    results.push(
      await runTwitterIngestPipeline(pipelineEnv, {
        investigationId,
        payload: split.twitter,
        rawHash,
        jobId,
        now,
        encKey,
        skipComplete,
      })
    );
  }
  if (split.instagram.length > 0) {
    results.push(
      await runInstagramIngestPipeline(pipelineEnv, {
        investigationId,
        payload: split.instagram,
        rawHash,
        jobId,
        now,
        encKey,
        skipComplete,
      })
    );
  }
  if (split.reddit.length > 0) {
    results.push(
      await runRedditIngestPipeline(pipelineEnv, {
        investigationId,
        payload: split.reddit,
        rawHash,
        jobId,
        now,
        encKey,
        skipComplete,
      })
    );
  }
  if (split.bluesky.length > 0) {
    results.push(
      await runBlueskyIngestPipeline(pipelineEnv, {
        investigationId,
        payload: split.bluesky,
        rawHash,
        jobId,
        now,
        encKey,
        skipComplete,
      })
    );
  }
  if (split.mastodon.length > 0) {
    results.push(
      await runMastodonIngestPipeline(pipelineEnv, {
        investigationId,
        payload: split.mastodon,
        rawHash,
        jobId,
        now,
        encKey,
        skipComplete,
      })
    );
  }
  if (split.tiktok.length > 0) {
    results.push(
      await runTikTokIngestPipeline(pipelineEnv, {
        investigationId,
        payload: split.tiktok,
        rawHash,
        jobId,
        now,
        encKey,
        skipComplete,
      })
    );
  }
  if (split.youtube.length > 0) {
    results.push(
      await runYouTubeIngestPipeline(pipelineEnv, {
        investigationId,
        payload: split.youtube,
        rawHash,
        jobId,
        now,
        encKey,
        skipComplete,
      })
    );
  }
  if (split.facebook.length > 0) {
    results.push(
      await runFacebookIngestPipeline(pipelineEnv, {
        investigationId,
        payload: split.facebook,
        rawHash,
        jobId,
        now,
        encKey,
        skipComplete,
      })
    );
  }

  if (skipComplete) {
    await completeIngestJob(db, jobId, []);
  }

  return mergeIngestResults(investigationId, rawHash, jobId, results);
}

function mergeIngestResults(
  investigationId: string,
  rawHash: string,
  jobId: string,
  results: ApifyIngestResult[]
): ApifyIngestResult {
  const merged: ApifyIngestResult = {
    investigationId,
    rawPayloadHash: rawHash,
    tweetsProcessed: 0,
    uniqueAccounts: 0,
    artifactsCreated: 0,
    seedsRegistered: 0,
    jobId,
    delegatedToContainer: false,
    extractorsRan: results.some((r) => r.extractorsRan),
    accountExtractorRuns: [],
    pairExtractorRuns: [],
  };
  const accounts = new Set<string>();
  for (const r of results) {
    merged.tweetsProcessed += r.tweetsProcessed;
    merged.artifactsCreated += r.artifactsCreated;
    merged.seedsRegistered += r.seedsRegistered;
    if (Array.isArray(r.accountExtractorRuns)) {
      merged.accountExtractorRuns = [
        ...(merged.accountExtractorRuns as unknown[]),
        ...r.accountExtractorRuns,
      ];
    }
    if (Array.isArray(r.pairExtractorRuns)) {
      merged.pairExtractorRuns = [
        ...(merged.pairExtractorRuns as unknown[]),
        ...r.pairExtractorRuns,
      ];
    }
  }
  merged.uniqueAccounts = results.reduce((n, r) => n + r.uniqueAccounts, 0);
  void accounts;
  return merged;
}

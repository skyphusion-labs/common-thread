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

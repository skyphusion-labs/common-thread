// implementation/ingest/apify-ingest.ts

import { ArchiveStore } from '../archive/store';
import { ManifestStore } from '../archive/manifest';
import type { ManifestEntry } from '../archive/types';
import { extractAllHandlesFromApifyTwitter } from './apify-twitter-parser';
import { runAccountExtractors } from '../extractors/runner';
import { runPairExtractors } from '../extractors/pair-runner';
import { ALL_ACCOUNT_EXTRACTORS, ALL_PAIR_EXTRACTORS } from '../extractors/index';

export interface ApifyIngestResult {
  investigationId: string;
  handles: string[];
  artifactsArchived: number;
  seedsRegistered: number;
  accountExtractorRuns: any[];
  pairExtractorRuns: any[];
}

export async function ingestApifyTwitter(
  env: { DB: D1Database; ARCHIVE: R2Bucket },
  investigationId: string,
  payload: any
): Promise<ApifyIngestResult> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE });

  const rawBytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  const { hash } = await archive.put(rawBytes, {
    mimeType: 'application/json',
    extension: 'json',
  });

  const now = new Date().toISOString();

  // NOTE: Only use fields allowed by your ManifestEntry type
  const entry: ManifestEntry = {
    hash,
    source: 'apify-twitter',
    collectedAt: now,
    investigationId,
    collectionMethod: {
      tool: 'apify',
      version: '1',
      config: { platform: 'twitter' },   // ← put platform-specific info here
    },
    status: 'present',
  };
  await manifest.append(entry);

  // Extract handles
  const handles = extractAllHandlesFromApifyTwitter(payload);

  // Register seed accounts
  let seedsRegistered = 0;
  for (const handle of handles) {
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO seed_accounts 
         (investigation_id, platform, account_identifier, basis_statement, added_at)
         VALUES (?, 'twitter', ?, 'Uploaded via Apify Twitter ingest', ?)`
      ).bind(investigationId, handle, now).run();
      seedsRegistered++;
    } catch {
      // duplicate / constraint — ignore
    }
  }

  // Run extractors (Option B)
  const accountRuns = await runAccountExtractors(env, {
    investigationId,
    extractors: ALL_ACCOUNT_EXTRACTORS,
    accountFilter: handles.length > 0 ? handles : undefined,
  });

  const pairRuns = await runPairExtractors(env, {
    investigationId,
    extractors: ALL_PAIR_EXTRACTORS,
    accountFilter: handles.length > 0 ? handles : undefined,
  });

  return {
    investigationId,
    handles,
    artifactsArchived: 1,
    seedsRegistered,
    accountExtractorRuns: accountRuns,
    pairExtractorRuns: pairRuns,
  };
}

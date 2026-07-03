/**
 * Event extractor runner.
 *
 * Reads manifest entries, runs event extractors, and writes
 * event_features rows with provenance. Mirrors the account runner
 * (§3.4 reproducibility: manifest hash recorded per extractor run).
 */

import { ArchiveStore } from '../archive/store';
import { ManifestStore } from '../archive/manifest';
import type { DatabaseClient } from '../db';
import type { ManifestEntry } from '../archive/types';
import { sourceMatchesHost } from './platform';
import type { EventFeatureExtractor, ExtractedEvent } from './event-types';

export interface EventRunnerEnv {
  DB: DatabaseClient;
  ARCHIVE: R2Bucket;
}

export interface RunEventExtractorsOptions {
  investigationId: string;
  accountFilter?: string[];
  extractors: EventFeatureExtractor[];
}

export interface EventExtractorRunResult {
  extractorName: string;
  extractorVersion: string;
  extractorRunId: number;
  inputArtifactCount: number;
  outputEventCount: number;
  durationMs: number;
}

export async function runEventExtractors(
  env: EventRunnerEnv,
  options: RunEventExtractorsOptions
): Promise<EventExtractorRunResult[]> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId: options.investigationId });

  const manifestHash = await manifest.manifestHash();
  if (!manifestHash) {
    throw new Error(
      'Cannot run event extractors against empty manifest. Collect artifacts first.'
    );
  }

  const entries = await manifest.list({
    investigationId: options.investigationId,
    status: 'present',
  });

  const results: EventExtractorRunResult[] = [];

  for (const extractor of options.extractors) {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    const runResult = await env.DB.prepare(
      `INSERT INTO extractor_runs (
         investigation_id, extractor_name, extractor_version,
         manifest_hash_at_run, started_at, status
       ) VALUES (?, ?, ?, ?, ?, 'running')`
    )
      .bind(
        options.investigationId,
        extractor.name,
        extractor.version,
        manifestHash,
        startedAt
      )
      .run();

    const extractorRunId = runResult.meta.last_row_id as number;
    let inputCount = 0;
    let outputCount = 0;

    try {
      for (const entry of entries) {
        if (!entry.account) continue;
        if (
          options.accountFilter &&
          !options.accountFilter.includes(entry.account)
        ) {
          continue;
        }
        if (extractor.filterEntry && !extractor.filterEntry(entry)) continue;

        const artifact = await archive.get(entry.hash, undefined);
        if (!artifact) continue;

        inputCount++;
        const events = extractor.extract({
          bytes: artifact.bytes,
          entry,
          mimeType: entry.mimeType,
        });

        const platform = inferPlatform(entry);
        for (const event of events) {
          await writeEventFeature(env.DB, {
            investigationId: options.investigationId,
            account: entry.account,
            platform,
            event,
            extractorName: extractor.name,
            extractorVersion: extractor.version,
            extractorRunId,
            artifactHash: entry.hash,
            manifestEntryHash: entry.hash,
          });
          outputCount++;
        }
      }

      const completedAt = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE extractor_runs SET
           completed_at = ?, status = 'completed',
           input_artifact_count = ?, output_feature_count = ?
         WHERE id = ?`
      )
        .bind(completedAt, inputCount, outputCount, extractorRunId)
        .run();

      results.push({
        extractorName: extractor.name,
        extractorVersion: extractor.version,
        extractorRunId,
        inputArtifactCount: inputCount,
        outputEventCount: outputCount,
        durationMs: Date.now() - startMs,
      });
    } catch (err) {
      const completedAt = new Date().toISOString();
      const message = err instanceof Error ? err.message : String(err);
      await env.DB.prepare(
        `UPDATE extractor_runs SET
           completed_at = ?, status = 'failed',
           input_artifact_count = ?, output_feature_count = ?,
           error_message = ?
         WHERE id = ?`
      )
        .bind(completedAt, inputCount, outputCount, message, extractorRunId)
        .run();
      throw err;
    }
  }

  return results;
}

async function writeEventFeature(
  db: DatabaseClient,
  params: {
    investigationId: string;
    account: string;
    platform: string;
    event: ExtractedEvent;
    extractorName: string;
    extractorVersion: string;
    extractorRunId: number;
    artifactHash: string;
    manifestEntryHash?: string;
  }
): Promise<void> {
  const extractedAt = new Date().toISOString();

  const result = await db
    .prepare(
      `INSERT INTO event_features (
         investigation_id, platform, account_identifier,
         event_timestamp, event_type, event_data_json,
         extracted_at, extractor_name, extractor_version, extractor_run_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      params.investigationId,
      params.platform,
      params.account,
      params.event.eventTimestamp,
      params.event.eventType,
      JSON.stringify(params.event.eventData),
      extractedAt,
      params.extractorName,
      params.extractorVersion,
      params.extractorRunId
    )
    .run();

  const eventFeatureId = result.meta.last_row_id as number;

  await db
    .prepare(
      `INSERT INTO event_feature_provenance (
         event_feature_id, artifact_hash, manifest_entry_hash
       ) VALUES (?, ?, ?)`
    )
    .bind(eventFeatureId, params.artifactHash, params.manifestEntryHash ?? null)
    .run();
}

function inferPlatform(entry: ManifestEntry): string {
  const tool = entry.collectionMethod.tool.toLowerCase();
  const source = entry.source.toLowerCase();

  if (tool.includes('twitter') || tool.includes('x-com') || tool.includes('apify')) {
    return 'twitter';
  }
  if (tool.includes('reddit')) return 'reddit';

  if (sourceMatchesHost(source, 'twitter.com', 'x.com')) return 'twitter';
  if (sourceMatchesHost(source, 'reddit.com')) return 'reddit';

  return 'unknown';
}

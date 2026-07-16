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
import { inferPlatform } from './platform';
import type { EventFeatureExtractor, ExtractedEvent } from './event-types';
import {
  prepareEventFeatureWrite,
  type FeatureWritePolicyOptions,
} from './feature-write-policy';
import { selectManifestEntriesForExtraction } from '../ingest/recollection';

export interface EventRunnerEnv {
  DB: DatabaseClient;
  ARCHIVE: R2Bucket;
}

export interface RunEventExtractorsOptions {
  investigationId: string;
  accountFilter?: string[];
  extractors: EventFeatureExtractor[];
  /** §6.1.2 explicit cross-version replace. Default false. */
  replacePriorVersions?: boolean;
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

  const entries = selectManifestEntriesForExtraction(
    await manifest.list({
      investigationId: options.investigationId,
      status: 'present',
    })
  );

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
    let unknownPlatformCount = 0;
    let missingArtifactCount = 0;

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

        // getForEntry resolves the storage extension from the entry's
        // mimeType so writer '.json' objects are found (#108).
        const artifact = await archive.getForEntry(entry);
        if (!artifact) {
          missingArtifactCount++;
          continue;
        }

        inputCount++;
        const events = extractor.extract({
          bytes: artifact.bytes,
          entry,
          mimeType: entry.mimeType,
        });

        const platform = inferPlatform(entry);
        if (platform === 'unknown') unknownPlatformCount++;

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
            replacePriorVersions: options.replacePriorVersions,
          });
          outputCount++;
        }
      }

      const completedAt = new Date().toISOString();
      const configurationJson =
        unknownPlatformCount > 0
          ? JSON.stringify({ unknown_platform_artifact_count: unknownPlatformCount })
          : null;
      // A miss on a filter-passing entry means a manifest-present artifact
      // is absent from the archive (#108): mark the run 'partial' + record
      // the count rather than completing silently with fewer inputs.
      const runStatus = missingArtifactCount > 0 ? 'partial' : 'completed';
      const missingNote =
        missingArtifactCount > 0
          ? `${missingArtifactCount} artifact(s) referenced by the manifest were not found in the archive (possible archive key mismatch)`
          : null;
      await env.DB.prepare(
        `UPDATE extractor_runs SET
           completed_at = ?, status = ?,
           input_artifact_count = ?, output_feature_count = ?,
           configuration_json = COALESCE(?, configuration_json),
           error_message = ?
         WHERE id = ?`
      )
        .bind(completedAt, runStatus, inputCount, outputCount, configurationJson, missingNote, extractorRunId)
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
  } & FeatureWritePolicyOptions
): Promise<void> {
  await prepareEventFeatureWrite(
    db,
    {
      investigationId: params.investigationId,
      platform: params.platform,
      accountIdentifier: params.account,
      eventTimestamp: params.event.eventTimestamp,
      eventType: params.event.eventType,
      extractorName: params.extractorName,
      extractorVersion: params.extractorVersion,
    },
    { replacePriorVersions: params.replacePriorVersions }
  );

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

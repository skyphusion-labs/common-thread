/**
 * Extractor runner.
 *
 * Reads manifest entries for an investigation, runs one or more
 * extractors against each entry's archived artifact, and writes the
 * resulting features (with provenance) to MySQL.
 *
 * Also writes an extractor_runs row recording the manifest hash at
 * run time, supporting the methodology's reproducibility commitment
 * (§3.4): rerunning an extractor against the same manifest hash
 * should produce the same feature rows (modulo timestamps).
 */

import { ArchiveStore } from '../archive/store';
import { ManifestStore } from '../archive/manifest';
import type { DatabaseClient } from '../db';
import { packFeatureValue } from '../schema/db-types';
import { inferPlatform } from './platform';
import type { AccountFeatureExtractor, ExtractedFeature } from './types';
import { deriveStoredConfidence } from './confidence';
import {
  prepareAccountFeatureWrite,
  type FeatureWritePolicyOptions,
} from './feature-write-policy';
import { selectManifestEntriesForExtraction } from '../ingest/recollection';

export interface RunnerEnv {
  DB: DatabaseClient;
  ARCHIVE: R2Bucket;
}

export interface RunAccountExtractorsOptions {
  investigationId: string;

  /** Optional: only process artifacts for these accounts. */
  accountFilter?: string[];

  /** Extractors to run, in order. */
  extractors: AccountFeatureExtractor[];

  /**
   * §6.1.2: when true, delete prior-version rows for the same logical feature
   * before writing. Default false (prior versions remain).
   */
  replacePriorVersions?: boolean;
}

export interface ExtractorRunResult {
  extractorName: string;
  extractorVersion: string;
  extractorRunId: number;
  inputArtifactCount: number;
  outputFeatureCount: number;
  durationMs: number;
}

/**
 * Run a set of account-feature extractors over an investigation's manifest.
 *
 * For each extractor:
 *   1. Insert an extractor_runs row with status='running' and the current
 *      manifest hash.
 *   2. For each manifest entry that the extractor's filterEntry accepts:
 *      a. Read the artifact bytes from R2.
 *      b. Call extract() to produce feature rows.
 *      c. Write each feature row to account_features.
 *      d. Write provenance rows to account_feature_provenance.
 *   3. Update the extractor_runs row to status='completed' with counts.
 *
 * If any step fails, the extractor_runs row is marked status='failed'
 * with an error message. Partial work is preserved (rows already written
 * are not rolled back), consistent with the methodology's preference for
 * append-only behavior.
 */
export async function runAccountExtractors(
  env: RunnerEnv,
  options: RunAccountExtractorsOptions
): Promise<ExtractorRunResult[]> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId: options.investigationId });

  const manifestHash = await manifest.manifestHash();
  if (!manifestHash) {
    throw new Error(
      'Cannot run extractors against empty manifest. Collect artifacts first.'
    );
  }

  const entries = selectManifestEntriesForExtraction(
    await manifest.list({
      investigationId: options.investigationId,
      status: 'present',
    })
  );

  const results: ExtractorRunResult[] = [];

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

        // Pre-filter on manifest entry metadata
        if (extractor.filterEntry && !extractor.filterEntry(entry)) continue;

        // Read artifact bytes from R2 (with integrity verification).
        // getForEntry resolves the storage-path extension from the entry's
        // mimeType so writer '.json' objects are found (#108).
        const artifact = await archive.getForEntry(entry);
        if (!artifact) {
          // Entry passed the extractor filter but its artifact is absent
          // from the archive: a real archive/key error, not a silent skip.
          missingArtifactCount++;
          continue;
        }

        inputCount++;

        // Extract features
        const features = extractor.extract({
          bytes: artifact.bytes,
          entry,
          mimeType: entry.mimeType,
        });

        // Write features + provenance
        const platform = inferPlatform(entry);
        if (platform === 'unknown') unknownPlatformCount++;

        for (const feature of features) {
          await writeAccountFeature(env.DB, {
            investigationId: options.investigationId,
            account: entry.account,
            platform,
            feature,
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
      // A miss on a filter-passing entry means an artifact the manifest
      // lists as present is not in the archive (#108). Surface it loudly:
      // mark the run 'partial' and record the count, instead of completing
      // silently with fewer inputs, so a 100% silent feature loss cannot
      // recur unnoticed.
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
        outputFeatureCount: outputCount,
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

async function writeAccountFeature(
  db: DatabaseClient,
  params: {
    investigationId: string;
    account: string;
    platform: string;
    feature: ExtractedFeature;
    extractorName: string;
    extractorVersion: string;
    extractorRunId: number;
    artifactHash: string;
    manifestEntryHash?: string;
  } & FeatureWritePolicyOptions
): Promise<void> {
  await prepareAccountFeatureWrite(
    db,
    {
      investigationId: params.investigationId,
      platform: params.platform,
      accountIdentifier: params.account,
      featureCategory: params.feature.category,
      featureName: params.feature.name,
      extractorName: params.extractorName,
      extractorVersion: params.extractorVersion,
    },
    { replacePriorVersions: params.replacePriorVersions }
  );

  const packed = packFeatureValue(params.feature.value);
  const extractedAt = new Date().toISOString();
  const confidenceFlag =
    params.feature.confidence ??
    deriveStoredConfidence(params.feature.category, params.feature.name, params.feature.value);

  const result = await db
    .prepare(
      `INSERT INTO account_features (
         investigation_id, platform, account_identifier,
         feature_category, feature_name,
         feature_value_text, feature_value_numeric, feature_value_json,
         extracted_at, extractor_name, extractor_version, extractor_run_id,
         confidence_flag
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      params.investigationId,
      params.platform,
      params.account,
      params.feature.category,
      params.feature.name,
      packed.feature_value_text,
      packed.feature_value_numeric,
      packed.feature_value_json,
      extractedAt,
      params.extractorName,
      params.extractorVersion,
      params.extractorRunId,
      confidenceFlag
    )
    .run();

  const featureId = result.meta.last_row_id as number;

  await db
    .prepare(
      `INSERT INTO account_feature_provenance (
         account_feature_id, artifact_hash, manifest_entry_hash
       ) VALUES (?, ?, ?)`
    )
    .bind(featureId, params.artifactHash, params.manifestEntryHash ?? null)
    .run();
}

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
import type { ManifestEntry } from '../archive/types';
import { sourceMatchesHost } from './platform';
import type { AccountFeatureExtractor, ExtractedFeature } from './types';
import { deriveStoredConfidence } from './confidence';

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

  const entries = await manifest.list({
    investigationId: options.investigationId,
    status: 'present',
  });

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

        // Read artifact bytes from R2 (with integrity verification)
        const artifact = await archive.get(entry.hash, undefined);
        if (!artifact) continue;

        inputCount++;

        // Extract features
        const features = extractor.extract({
          bytes: artifact.bytes,
          entry,
          mimeType: entry.mimeType,
        });

        // Write features + provenance
        const platform = inferPlatform(entry);
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
  }
): Promise<void> {
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

/**
 * Infer the platform from a manifest entry.
 *
 * TODO(manifest-schema): The manifest entry should have an explicit
 * `platform` field. Inferring from collection_method.tool and source
 * URL is a stopgap. Add `platform: string` to ManifestEntry in the
 * archive layer types and update collectArtifact() to require it.
 */
function inferPlatform(entry: ManifestEntry): string {
  const tool = entry.collectionMethod.tool.toLowerCase();
  const source = entry.source.toLowerCase();

  if (tool.includes('twitter') || tool.includes('x-com')) return 'twitter';
  if (tool.includes('reddit')) return 'reddit';
  if (tool.includes('bluesky') || tool.includes('atproto')) return 'bluesky';
  if (tool.includes('mastodon')) return 'mastodon';

  if (sourceMatchesHost(source, 'twitter.com', 'x.com')) return 'twitter';
  if (sourceMatchesHost(source, 'reddit.com')) return 'reddit';
  if (sourceMatchesHost(source, 'bsky.app', 'bsky.social')) return 'bluesky';

  return 'unknown';
}

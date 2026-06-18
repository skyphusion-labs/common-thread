/**
 * Pair extractor runner.
 *
 * Iterates ordered pairs of accounts in an investigation, loads each
 * account's required features from MySQL, calls each pair extractor's
 * extract() method, and writes the resulting features to pair_features
 * with provenance traced from the contributing account features.
 *
 * Structurally different from the account runner:
 *   - Iterates N*(N-1)/2 pairs (N = seed account count), not manifest entries
 *   - Reads from MySQL (account_features), not R2 (artifacts)
 *   - Provenance traced transitively through account_feature_provenance,
 *     since pair features derive from already-extracted account features
 *     which themselves derive from artifacts
 *
 * Reproducibility: each pair extractor run records the manifest hash at
 * run time (the same hash the account extractors saw). Rerunning with
 * the same manifest hash and the same input account features produces
 * the same pair feature rows.
 *
 * Platform handling (migration 0002): pair_features stores platform_a
 * and platform_b paired by index with account_a and account_b. The
 * runner resolves each candidate account's platform from seed_accounts
 * (or account_features as fallback) and threads platform_a / platform_b
 * through to writePairFeature.
 */

import {
  canonicalPlatformedPair,
  packFeatureValue,
  readFeatureValue,
} from '../schema/db-types';
import { ManifestStore } from '../archive/manifest';
import type { DatabaseClient } from '../db';
import type { PairFeatureExtractor, AccountFeatureMap } from './pair-types';
import type { ExtractedFeature } from './types';
import type { FeatureValue } from '../schema/db-types';
import { deriveStoredConfidence } from './confidence';

export interface PairRunnerEnv {
  DB: DatabaseClient;
  ARCHIVE: R2Bucket;
}

export interface RunPairExtractorsOptions {
  investigationId: string;

  /** Optional: restrict to this subset of seed accounts. */
  accountFilter?: string[];

  /** Pair extractors to run, in order. */
  extractors: PairFeatureExtractor[];
}

export interface PairExtractorRunResult {
  extractorName: string;
  extractorVersion: string;
  extractorRunId: number;
  accountCount: number;
  pairCount: number;
  outputFeatureCount: number;
  durationMs: number;
}

interface AccountFeatureRow {
  account_identifier: string;
  feature_name: string;
  feature_value_text: string | null;
  feature_value_numeric: number | null;
  feature_value_json: string | null;
  account_feature_id: number;
}

export async function runPairExtractors(
  env: PairRunnerEnv,
  options: RunPairExtractorsOptions
): Promise<PairExtractorRunResult[]> {
  const manifest = new ManifestStore({ bucket: env.ARCHIVE });
  const manifestHash = await manifest.manifestHash();
  if (!manifestHash) {
    throw new Error(
      'Cannot run pair extractors against empty manifest. Collect artifacts first.'
    );
  }

  // Determine the candidate account set, resolving platforms for each.
  // accountFilter takes the filter path (resolveAccountPlatforms); seed
  // path loads from seed_accounts directly.
  const candidatesWithPlatforms: Array<{ account: string; platform: string }> =
    options.accountFilter && options.accountFilter.length > 0
      ? await resolveAccountPlatforms(
          env.DB,
          options.investigationId,
          [...new Set(options.accountFilter)].sort()
        )
      : await loadSeedAccounts(env.DB, options.investigationId);

  if (candidatesWithPlatforms.length < 2) {
    throw new Error(
      `Pair extractors require at least 2 accounts; got ${candidatesWithPlatforms.length}`
    );
  }

  const accountPlatformMap = new Map<string, string>();
  for (const cp of candidatesWithPlatforms) {
    accountPlatformMap.set(cp.account, cp.platform);
  }
  const candidates: string[] = candidatesWithPlatforms.map(cp => cp.account);

  const results: PairExtractorRunResult[] = [];

  for (const extractor of options.extractors) {
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    const runRes = await env.DB.prepare(
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
    const extractorRunId = runRes.meta.last_row_id as number;

    let pairCount = 0;
    let outputCount = 0;

    try {
      // Load required features for all candidate accounts, plus the
      // account_feature row IDs for provenance tracing.
      const featureRows = await loadAccountFeatures(
        env.DB,
        options.investigationId,
        candidates,
        extractor.requiredAccountFeatures
      );

      // Group by account: account → Map<feature_name, FeatureValue>
      // and account → Map<feature_name, account_feature_id>
      const accountFeatures = new Map<string, AccountFeatureMap>();
      const accountFeatureIds = new Map<string, Map<string, number>>();

      for (const row of featureRows) {
        const fv = readFeatureValue({
          feature_value_text: row.feature_value_text,
          feature_value_numeric: row.feature_value_numeric,
          feature_value_json: row.feature_value_json,
        });

        let acctMap = accountFeatures.get(row.account_identifier);
        if (!acctMap) {
          acctMap = new Map();
          accountFeatures.set(row.account_identifier, acctMap);
        }
        acctMap.set(row.feature_name, fv);

        let idMap = accountFeatureIds.get(row.account_identifier);
        if (!idMap) {
          idMap = new Map();
          accountFeatureIds.set(row.account_identifier, idMap);
        }
        idMap.set(row.feature_name, row.account_feature_id);
      }

      // Filter to accounts that have all required features.
      const ready = candidates.filter(acct => {
        const features = accountFeatures.get(acct);
        if (!features) return false;
        return extractor.requiredAccountFeatures.every(name => features.has(name));
      });

      if (ready.length < 2) {
        // Not enough accounts have the needed features; finish empty.
        await markRunCompleted(env.DB, extractorRunId, 0, 0, new Date().toISOString());
        results.push({
          extractorName: extractor.name,
          extractorVersion: extractor.version,
          extractorRunId,
          accountCount: ready.length,
          pairCount: 0,
          outputFeatureCount: 0,
          durationMs: Date.now() - startMs,
        });
        continue;
      }

      // Build context once, if the extractor wants it.
      const controlFlags = await loadSeedControlFlags(
        env.DB,
        options.investigationId,
        ready
      );
      const seedAccountInputs = ready.map(acct => ({
        account: acct,
        features: accountFeatures.get(acct)!,
        isControl: controlFlags.get(acct) ?? false,
      }));
      const context = extractor.buildContext
        ? extractor.buildContext(seedAccountInputs)
        : undefined;

      // Iterate canonical pairs (account + platform travel together).
      for (let i = 0; i < ready.length - 1; i++) {
        for (let j = i + 1; j < ready.length; j++) {
          const left = { account: ready[i], platform: accountPlatformMap.get(ready[i])! };
          const right = { account: ready[j], platform: accountPlatformMap.get(ready[j])! };
          const [canonLeft, canonRight] = canonicalPlatformedPair(left, right);
          const a = canonLeft.account;
          const b = canonRight.account;
          const platformA = canonLeft.platform;
          const platformB = canonRight.platform;
          const featuresA = accountFeatures.get(a)!;
          const featuresB = accountFeatures.get(b)!;

          const pairFeatures = extractor.extract(a, b, featuresA, featuresB, context);
          if (pairFeatures.length === 0) {
            pairCount++;
            continue;
          }

          // Collect contributing account_feature_ids for provenance.
          const contributingIds: number[] = [];
          for (const fname of extractor.requiredAccountFeatures) {
            const idA = accountFeatureIds.get(a)?.get(fname);
            const idB = accountFeatureIds.get(b)?.get(fname);
            if (idA !== undefined) contributingIds.push(idA);
            if (idB !== undefined) contributingIds.push(idB);
          }

          // Gather artifact_hashes that produced those contributing features.
          const artifactHashes = await tracProvenance(env.DB, contributingIds);

          for (const feature of pairFeatures) {
            await writePairFeature(env.DB, {
              investigationId: options.investigationId,
              platformA,
              platformB,
              accountA: a,
              accountB: b,
              feature,
              extractorName: extractor.name,
              extractorVersion: extractor.version,
              extractorRunId,
              artifactHashes,
            });
            outputCount++;
          }
          pairCount++;
        }
      }

      const completedAt = new Date().toISOString();
      await markRunCompleted(env.DB, extractorRunId, pairCount, outputCount, completedAt);

      results.push({
        extractorName: extractor.name,
        extractorVersion: extractor.version,
        extractorRunId,
        accountCount: ready.length,
        pairCount,
        outputFeatureCount: outputCount,
        durationMs: Date.now() - startMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const completedAt = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE extractor_runs SET
           completed_at = ?, status = 'failed',
           input_artifact_count = ?, output_feature_count = ?,
           error_message = ?
         WHERE id = ?`
      )
        .bind(completedAt, pairCount, outputCount, message, extractorRunId)
        .run();
      throw err;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// MySQL helpers
// ---------------------------------------------------------------------------

/**
 * Load active seed accounts for the investigation, one row per
 * account_identifier. If the same identifier exists on multiple
 * platforms in seed_accounts (rare), MIN(platform) selects one
 * deterministically. This preserves the runner's prior "one platform
 * per identifier" assumption (which the cross-platform plumbing in
 * migration 0002 does not yet change at the runner level).
 */
async function loadSeedAccounts(
  db: DatabaseClient,
  investigationId: string
): Promise<Array<{ account: string; platform: string }>> {
  const res = await db
    .prepare(
      `SELECT account_identifier, MIN(platform) AS platform
       FROM seed_accounts
       WHERE investigation_id = ? AND removed_at IS NULL
       GROUP BY account_identifier
       ORDER BY account_identifier ASC`
    )
    .bind(investigationId)
    .all<{ account_identifier: string; platform: string }>();
  return (res.results ?? []).map(r => ({
    account: r.account_identifier,
    platform: r.platform,
  }));
}

/**
 * Resolve platforms for a caller-supplied list of account identifiers
 * (the accountFilter path). Two-pass resolution:
 *
 *   Pass 1: seed_accounts for the investigation (ignores removed_at,
 *           so historical seeds still resolve).
 *   Pass 2: account_features fallback for identifiers not in
 *           seed_accounts (e.g., accounts that were never seeded but
 *           have features extracted via another path).
 *
 * Throws if any identifier cannot be resolved in either pass; this is
 * a hard error rather than a silent drop because pair_features cannot
 * be written without a platform.
 */
async function resolveAccountPlatforms(
  db: DatabaseClient,
  investigationId: string,
  accounts: string[]
): Promise<Array<{ account: string; platform: string }>> {
  if (accounts.length === 0) return [];

  const placeholders = accounts.map(() => '?').join(', ');

  // Pass 1: seed_accounts (any removed_at).
  const seedRes = await db
    .prepare(
      `SELECT account_identifier, MIN(platform) AS platform
       FROM seed_accounts
       WHERE investigation_id = ?
         AND account_identifier IN (${placeholders})
       GROUP BY account_identifier`
    )
    .bind(investigationId, ...accounts)
    .all<{ account_identifier: string; platform: string }>();

  const resolved = new Map<string, string>();
  for (const row of seedRes.results ?? []) {
    resolved.set(row.account_identifier, row.platform);
  }

  // Pass 2: account_features fallback for any identifiers not yet resolved.
  const unresolved = accounts.filter(a => !resolved.has(a));
  if (unresolved.length > 0) {
    const fbPlaceholders = unresolved.map(() => '?').join(', ');
    const fbRes = await db
      .prepare(
        `SELECT account_identifier, MIN(platform) AS platform
         FROM account_features
         WHERE investigation_id = ?
           AND account_identifier IN (${fbPlaceholders})
         GROUP BY account_identifier`
      )
      .bind(investigationId, ...unresolved)
      .all<{ account_identifier: string; platform: string }>();

    for (const row of fbRes.results ?? []) {
      resolved.set(row.account_identifier, row.platform);
    }
  }

  // Hard error on still-unresolved identifiers.
  const stillUnresolved = accounts.filter(a => !resolved.has(a));
  if (stillUnresolved.length > 0) {
    throw new Error(
      `Cannot resolve platform for accounts in investigation '${investigationId}': ` +
        `[${stillUnresolved.join(', ')}]. ` +
        `Account must exist in seed_accounts (current or historical) or in ` +
        `account_features for the investigation.`
    );
  }

  return accounts.map(a => ({ account: a, platform: resolved.get(a)! }));
}

async function loadAccountFeatures(
  db: DatabaseClient,
  investigationId: string,
  accounts: string[],
  featureNames: ReadonlyArray<string>
): Promise<AccountFeatureRow[]> {
  if (accounts.length === 0 || featureNames.length === 0) return [];

  // Build IN placeholders for accounts and feature names.
  const acctPh = accounts.map(() => '?').join(', ');
  const namePh = featureNames.map(() => '?').join(', ');

  const sql = `
    SELECT
      account_identifier,
      feature_name,
      feature_value_text,
      feature_value_numeric,
      feature_value_json,
      id AS account_feature_id
    FROM account_features
    WHERE investigation_id = ?
      AND account_identifier IN (${acctPh})
      AND feature_name IN (${namePh})
    ORDER BY account_identifier, feature_name, extracted_at DESC
  `;

  const bindings: unknown[] = [investigationId, ...accounts, ...featureNames];
  const res = await db.prepare(sql).bind(...bindings).all<AccountFeatureRow>();

  // Deduplicate: take the most recent row per (account, feature_name).
  // The ORDER BY above puts the newest first, so the first occurrence wins.
  const seen = new Set<string>();
  const deduped: AccountFeatureRow[] = [];
  for (const row of res.results ?? []) {
    const key = `${row.account_identifier}|${row.feature_name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

async function tracProvenance(
  db: DatabaseClient,
  accountFeatureIds: number[]
): Promise<Array<{ artifact_hash: string; manifest_entry_hash: string | null }>> {
  if (accountFeatureIds.length === 0) return [];
  const placeholders = accountFeatureIds.map(() => '?').join(', ');
  const sql = `
    SELECT DISTINCT artifact_hash, manifest_entry_hash
    FROM account_feature_provenance
    WHERE account_feature_id IN (${placeholders})
  `;
  const res = await db
    .prepare(sql)
    .bind(...accountFeatureIds)
    .all<{ artifact_hash: string; manifest_entry_hash: string | null }>();
  return res.results ?? [];
}

async function writePairFeature(
  db: DatabaseClient,
  params: {
    investigationId: string;
    platformA: string;
    platformB: string;
    accountA: string;
    accountB: string;
    feature: ExtractedFeature;
    extractorName: string;
    extractorVersion: string;
    extractorRunId: number;
    artifactHashes: Array<{ artifact_hash: string; manifest_entry_hash: string | null }>;
  }
): Promise<void> {
  const packed = packFeatureValue(params.feature.value);
  const extractedAt = new Date().toISOString();
  const confidenceFlag =
    params.feature.confidence ??
    deriveStoredConfidence(params.feature.category, params.feature.name, params.feature.value);

  const result = await db
    .prepare(
      `INSERT INTO pair_features (
         investigation_id, platform_a, platform_b, account_a, account_b,
         feature_category, feature_name,
         feature_value_text, feature_value_numeric, feature_value_json,
         extracted_at, extractor_name, extractor_version, extractor_run_id,
         confidence_flag
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      params.investigationId,
      params.platformA,
      params.platformB,
      params.accountA,
      params.accountB,
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

  const pairFeatureId = result.meta.last_row_id as number;

  for (const prov of params.artifactHashes) {
    await db
      .prepare(
        `INSERT IGNORE INTO pair_feature_provenance (
           pair_feature_id, artifact_hash, manifest_entry_hash
         ) VALUES (?, ?, ?)`
      )
      .bind(pairFeatureId, prov.artifact_hash, prov.manifest_entry_hash)
      .run();
  }
}

async function loadSeedControlFlags(
  db: DatabaseClient,
  investigationId: string,
  accounts: string[]
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (accounts.length === 0) return out;

  const placeholders = accounts.map(() => '?').join(', ');
  const res = await db
    .prepare(
      `SELECT account_identifier, MAX(is_control) AS is_control
       FROM seed_accounts
       WHERE investigation_id = ?
         AND removed_at IS NULL
         AND account_identifier IN (${placeholders})
       GROUP BY account_identifier`
    )
    .bind(investigationId, ...accounts)
    .all<{ account_identifier: string; is_control: number }>();

  for (const row of res.results ?? []) {
    out.set(row.account_identifier, row.is_control === 1);
  }
  return out;
}

async function markRunCompleted(
  db: DatabaseClient,
  extractorRunId: number,
  inputCount: number,
  outputCount: number,
  completedAt: string
): Promise<void> {
  await db
    .prepare(
      `UPDATE extractor_runs SET
         completed_at = ?, status = 'completed',
         input_artifact_count = ?, output_feature_count = ?
       WHERE id = ?`
    )
    .bind(completedAt, inputCount, outputCount, extractorRunId)
    .run();
}

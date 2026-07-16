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
import {
  preparePairFeatureWrite,
  type FeatureWritePolicyOptions,
} from './feature-write-policy';

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

  /** §6.1.2 explicit cross-version replace. Default false. */
  replacePriorVersions?: boolean;
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
  platform: string;
  account_identifier: string;
  feature_name: string;
  feature_value_text: string | null;
  feature_value_numeric: number | null;
  feature_value_json: string | null;
  account_feature_id: number;
}

interface PlatformedAccount {
  account: string;
  platform: string;
}

function candidateKey(candidate: PlatformedAccount): string {
  return `${candidate.platform}\0${candidate.account}`;
}

export async function runPairExtractors(
  env: PairRunnerEnv,
  options: RunPairExtractorsOptions
): Promise<PairExtractorRunResult[]> {
  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId: options.investigationId });
  const manifestHash = await manifest.manifestHash();
  if (!manifestHash) {
    throw new Error(
      'Cannot run pair extractors against empty manifest. Collect artifacts first.'
    );
  }

  // Determine the candidate account set, resolving platforms for each.
  // accountFilter takes the filter path (resolveAccountPlatforms); seed
  // path loads from seed_accounts directly.
  const candidatesWithPlatforms: PlatformedAccount[] =
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
        candidatesWithPlatforms,
        extractor.requiredAccountFeatures
      );

      // Group by platform+account: key → Map<feature_name, FeatureValue>
      const accountFeatures = new Map<string, AccountFeatureMap>();
      const accountFeatureIds = new Map<string, Map<string, number>>();

      for (const row of featureRows) {
        const key = candidateKey({
          platform: row.platform,
          account: row.account_identifier,
        });
        const fv = readFeatureValue({
          feature_value_text: row.feature_value_text,
          feature_value_numeric: row.feature_value_numeric,
          feature_value_json: row.feature_value_json,
        });

        let acctMap = accountFeatures.get(key);
        if (!acctMap) {
          acctMap = new Map();
          accountFeatures.set(key, acctMap);
        }
        acctMap.set(row.feature_name, fv);

        let idMap = accountFeatureIds.get(key);
        if (!idMap) {
          idMap = new Map();
          accountFeatureIds.set(key, idMap);
        }
        idMap.set(row.feature_name, row.account_feature_id);
      }

      const ready = candidatesWithPlatforms.filter(candidate => {
        const key = candidateKey(candidate);
        const features = accountFeatures.get(key);
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
        ready.map(c => c.account)
      );
      const seedAccountInputs = ready.map(candidate => ({
        account: candidate.account,
        features: accountFeatures.get(candidateKey(candidate))!,
        isControl: controlFlags.get(candidate.account) ?? false,
      }));
      const context = extractor.buildContext
        ? extractor.buildContext(seedAccountInputs)
        : undefined;

      // Iterate canonical pairs (account + platform travel together).
      for (let i = 0; i < ready.length - 1; i++) {
        for (let j = i + 1; j < ready.length; j++) {
          const left = ready[i];
          const right = ready[j];
          const [canonLeft, canonRight] = canonicalPlatformedPair(left, right);
          const a = canonLeft.account;
          const b = canonRight.account;
          const platformA = canonLeft.platform;
          const platformB = canonRight.platform;
          const featuresA = accountFeatures.get(candidateKey(canonLeft))!;
          const featuresB = accountFeatures.get(candidateKey(canonRight))!;

          const pairFeatures = extractor.extract(a, b, featuresA, featuresB, context);
          if (pairFeatures.length === 0) {
            pairCount++;
            continue;
          }

          // Collect contributing account_feature_ids for provenance.
          const contributingIds: number[] = [];
          for (const fname of extractor.requiredAccountFeatures) {
            const idA = accountFeatureIds.get(candidateKey(canonLeft))?.get(fname);
            const idB = accountFeatureIds.get(candidateKey(canonRight))?.get(fname);
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
              replacePriorVersions: options.replacePriorVersions,
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
 * Load active seed accounts for the investigation. Returns one row per
 * (platform, account_identifier) pair so cross-platform seeds with
 * distinct handles are all included.
 */
async function loadSeedAccounts(
  db: DatabaseClient,
  investigationId: string
): Promise<PlatformedAccount[]> {
  const res = await db
    .prepare(
      `SELECT account_identifier, platform
       FROM seed_accounts
       WHERE investigation_id = ? AND removed_at IS NULL
       ORDER BY account_identifier ASC, platform ASC`
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
): Promise<PlatformedAccount[]> {
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
  candidates: PlatformedAccount[],
  featureNames: ReadonlyArray<string>
): Promise<AccountFeatureRow[]> {
  if (candidates.length === 0 || featureNames.length === 0) return [];

  const tuplePh = candidates.map(() => '(?, ?)').join(', ');
  const namePh = featureNames.map(() => '?').join(', ');

  const sql = `
    SELECT
      platform,
      account_identifier,
      feature_name,
      feature_value_text,
      feature_value_numeric,
      feature_value_json,
      id AS account_feature_id
    FROM account_features
    WHERE investigation_id = ?
      AND (platform, account_identifier) IN (${tuplePh})
      AND feature_name IN (${namePh})
    ORDER BY platform, account_identifier, feature_name, extracted_at DESC
  `;

  const bindings: unknown[] = [
    investigationId,
    ...candidates.flatMap(c => [c.platform, c.account]),
    ...featureNames,
  ];
  const res = await db.prepare(sql).bind(...bindings).all<AccountFeatureRow>();

  const seen = new Set<string>();
  const deduped: AccountFeatureRow[] = [];
  for (const row of res.results ?? []) {
    const key = `${row.platform}|${row.account_identifier}|${row.feature_name}`;
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
  } & FeatureWritePolicyOptions
): Promise<void> {
  await preparePairFeatureWrite(
    db,
    {
      investigationId: params.investigationId,
      platformA: params.platformA,
      platformB: params.platformB,
      accountA: params.accountA,
      accountB: params.accountB,
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

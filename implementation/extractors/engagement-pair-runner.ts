/**
 * Engagement pair extractor runner.
 *
 * Loads event_features rows written by engagement event extractors,
 * runs §4.4.3 / §4.4.4 pair extractors, and writes pair_features with
 * provenance traced through event_feature_provenance.
 */

import {
  canonicalPlatformedPair,
  packFeatureValue,
} from '../schema/db-types';
import { ManifestStore } from '../archive/manifest';
import type { DatabaseClient } from '../db';
import type {
  EngagementEventRecord,
  EngagementPairFeatureExtractor,
} from './event-types';
import type { ExtractedFeature } from './types';
import { parseEngagementEventData } from './network/engagement-parse';
import {
  preparePairFeatureWrite,
  type FeatureWritePolicyOptions,
} from './feature-write-policy';

export interface EngagementPairRunnerEnv {
  DB: DatabaseClient;
  ARCHIVE: R2Bucket;
}

export interface RunEngagementPairExtractorsOptions {
  investigationId: string;
  accountFilter?: string[];
  extractors: EngagementPairFeatureExtractor[];
  /** §6.1.2 explicit cross-version replace. Default false. */
  replacePriorVersions?: boolean;
}

export interface EngagementPairExtractorRunResult {
  extractorName: string;
  extractorVersion: string;
  extractorRunId: number;
  accountCount: number;
  pairCount: number;
  outputFeatureCount: number;
  durationMs: number;
}

interface EventFeatureRow {
  id: number;
  platform: string;
  account_identifier: string;
  event_timestamp: string;
  event_type: string;
  event_data_json: string | null;
}

export async function runEngagementPairExtractors(
  env: EngagementPairRunnerEnv,
  options: RunEngagementPairExtractorsOptions
): Promise<EngagementPairExtractorRunResult[]> {
  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId: options.investigationId });
  const manifestHash = await manifest.manifestHash();
  if (!manifestHash) {
    throw new Error(
      'Cannot run engagement pair extractors against empty manifest. Collect artifacts first.'
    );
  }

  const candidatesWithPlatforms =
    options.accountFilter && options.accountFilter.length > 0
      ? await resolveAccountPlatforms(
          env.DB,
          options.investigationId,
          [...new Set(options.accountFilter)].sort()
        )
      : await loadSeedAccounts(env.DB, options.investigationId);

  if (candidatesWithPlatforms.length < 2) {
    throw new Error(
      `Engagement pair extractors require at least 2 accounts; got ${candidatesWithPlatforms.length}`
    );
  }

  const accountPlatformMap = new Map(
    candidatesWithPlatforms.map(cp => [cp.account, cp.platform])
  );
  const candidates = candidatesWithPlatforms.map(cp => cp.account);
  const results: EngagementPairExtractorRunResult[] = [];

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
      const eventRows = await loadEngagementEvents(
        env.DB,
        options.investigationId,
        candidates,
        extractor.requiredEventTypes
      );

      const eventsByAccount = new Map<string, EngagementEventRecord[]>();
      const eventIdsByAccount = new Map<string, number[]>();

      for (const row of eventRows) {
        const parsed = parseEngagementEventData(row.event_type, row.event_data_json);
        if (!parsed) continue;

        const tsMs = Date.parse(row.event_timestamp);
        if (!Number.isFinite(tsMs)) continue;

        const record: EngagementEventRecord = {
          account: row.account_identifier,
          platform: row.platform,
          eventFeatureId: row.id,
          timestampMs: tsMs,
          eventTimestamp: row.event_timestamp,
          eventType: parsed.engagement_kind,
          targetPostId: parsed.target_post_id,
          targetAuthor: parsed.target_author,
          engagementTargetKey: parsed.engagement_target_key,
          sourcePostId: parsed.source_post_id,
          conversationId: parsed.conversation_id ?? null,
        };

        let list = eventsByAccount.get(row.account_identifier);
        if (!list) {
          list = [];
          eventsByAccount.set(row.account_identifier, list);
        }
        list.push(record);

        let ids = eventIdsByAccount.get(row.account_identifier);
        if (!ids) {
          ids = [];
          eventIdsByAccount.set(row.account_identifier, ids);
        }
        ids.push(row.id);
      }

      const ready = candidates.filter(acct => {
        const evs = eventsByAccount.get(acct);
        return evs && evs.length > 0;
      });

      if (ready.length < 2) {
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

      const seedInputs = ready.map(acct => ({
        account: acct,
        events: eventsByAccount.get(acct)!,
      }));
      const context = extractor.buildContext ? extractor.buildContext(seedInputs) : undefined;

      for (let i = 0; i < ready.length - 1; i++) {
        for (let j = i + 1; j < ready.length; j++) {
          const left = {
            account: ready[i],
            platform: accountPlatformMap.get(ready[i])!,
          };
          const right = {
            account: ready[j],
            platform: accountPlatformMap.get(ready[j])!,
          };
          const [canonLeft, canonRight] = canonicalPlatformedPair(left, right);
          const a = canonLeft.account;
          const b = canonRight.account;

          const pairFeatures = extractor.extract(
            a,
            b,
            eventsByAccount.get(a)!,
            eventsByAccount.get(b)!,
            context
          );

          pairCount++;

          if (pairFeatures.length === 0) continue;

          const contributingIds = [
            ...(eventIdsByAccount.get(a) ?? []),
            ...(eventIdsByAccount.get(b) ?? []),
          ];
          const artifactHashes = await traceEventProvenance(env.DB, contributingIds);

          for (const feature of pairFeatures) {
            await writePairFeature(env.DB, {
              investigationId: options.investigationId,
              platformA: canonLeft.platform,
              platformB: canonRight.platform,
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

async function resolveAccountPlatforms(
  db: DatabaseClient,
  investigationId: string,
  accounts: string[]
): Promise<Array<{ account: string; platform: string }>> {
  if (accounts.length === 0) return [];

  const placeholders = accounts.map(() => '?').join(', ');
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

  const unresolved = accounts.filter(a => !resolved.has(a));
  if (unresolved.length > 0) {
    const fbPlaceholders = unresolved.map(() => '?').join(', ');
    const fbRes = await db
      .prepare(
        `SELECT account_identifier, MIN(platform) AS platform
         FROM event_features
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

  const stillUnresolved = accounts.filter(a => !resolved.has(a));
  if (stillUnresolved.length > 0) {
    throw new Error(
      `Cannot resolve platform for accounts in investigation '${investigationId}': ` +
        `[${stillUnresolved.join(', ')}].`
    );
  }

  return accounts.map(a => ({ account: a, platform: resolved.get(a)! }));
}

async function loadEngagementEvents(
  db: DatabaseClient,
  investigationId: string,
  accounts: string[],
  eventTypes: ReadonlyArray<string>
): Promise<EventFeatureRow[]> {
  if (accounts.length === 0 || eventTypes.length === 0) return [];

  const acctPh = accounts.map(() => '?').join(', ');
  const typePh = eventTypes.map(() => '?').join(', ');

  const res = await db
    .prepare(
      `SELECT id, platform, account_identifier, event_timestamp, event_type, event_data_json
       FROM event_features
       WHERE investigation_id = ?
         AND account_identifier IN (${acctPh})
         AND event_type IN (${typePh})
       ORDER BY event_timestamp ASC`
    )
    .bind(investigationId, ...accounts, ...eventTypes)
    .all<EventFeatureRow>();

  return res.results ?? [];
}

async function traceEventProvenance(
  db: DatabaseClient,
  eventFeatureIds: number[]
): Promise<Array<{ artifact_hash: string; manifest_entry_hash: string | null }>> {
  if (eventFeatureIds.length === 0) return [];
  const placeholders = eventFeatureIds.map(() => '?').join(', ');
  const res = await db
    .prepare(
      `SELECT DISTINCT artifact_hash, manifest_entry_hash
       FROM event_feature_provenance
       WHERE event_feature_id IN (${placeholders})`
    )
    .bind(...eventFeatureIds)
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

  const result = await db
    .prepare(
      `INSERT INTO pair_features (
         investigation_id, platform_a, platform_b, account_a, account_b,
         feature_category, feature_name,
         feature_value_text, feature_value_numeric, feature_value_json,
         extracted_at, extractor_name, extractor_version, extractor_run_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      params.extractorRunId
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

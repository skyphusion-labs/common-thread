/**
 * §6.1.2 extractor version write policy.
 *
 * Signal rows from prior extractor versions remain valid. A new version INSERTs
 * alongside them by default. Removing rows written by a *different*
 * extractor_version requires an explicit `replacePriorVersions` operation.
 *
 * Same-version re-runs are idempotent: matching rows for the incoming version
 * are cleared before insert (not a cross-version overwrite).
 */

import type { DatabaseClient } from '../db';

export interface FeatureWritePolicyOptions {
  /**
   * Explicit §6.1.2 operation: delete rows for this extractor_name that share
   * the logical feature identity but were written by a *different*
   * extractor_version, then allow the new insert.
   */
  replacePriorVersions?: boolean;
}

export interface AccountFeatureIdentity {
  investigationId: string;
  platform: string;
  accountIdentifier: string;
  featureCategory: string;
  featureName: string;
  extractorName: string;
  extractorVersion: string;
}

export interface PairFeatureIdentity {
  investigationId: string;
  platformA: string;
  platformB: string;
  accountA: string;
  accountB: string;
  featureCategory: string;
  featureName: string;
  extractorName: string;
  extractorVersion: string;
}

export interface EventFeatureIdentity {
  investigationId: string;
  platform: string;
  accountIdentifier: string;
  eventTimestamp: string;
  eventType: string;
  extractorName: string;
  extractorVersion: string;
}

/**
 * Prepare account_features for a write under §6.1.2.
 * Clears same-version rows; clears other versions only when explicitly requested.
 */
export async function prepareAccountFeatureWrite(
  db: DatabaseClient,
  identity: AccountFeatureIdentity,
  options: FeatureWritePolicyOptions = {}
): Promise<void> {
  if (options.replacePriorVersions) {
    await db
      .prepare(
        `DELETE FROM account_features
         WHERE investigation_id = ?
           AND platform = ?
           AND account_identifier = ?
           AND feature_category = ?
           AND feature_name = ?
           AND extractor_name = ?
           AND extractor_version != ?`
      )
      .bind(
        identity.investigationId,
        identity.platform,
        identity.accountIdentifier,
        identity.featureCategory,
        identity.featureName,
        identity.extractorName,
        identity.extractorVersion
      )
      .run();
  }

  await db
    .prepare(
      `DELETE FROM account_features
       WHERE investigation_id = ?
         AND platform = ?
         AND account_identifier = ?
         AND feature_category = ?
         AND feature_name = ?
         AND extractor_name = ?
         AND extractor_version = ?`
    )
    .bind(
      identity.investigationId,
      identity.platform,
      identity.accountIdentifier,
      identity.featureCategory,
      identity.featureName,
      identity.extractorName,
      identity.extractorVersion
    )
    .run();
}

export async function preparePairFeatureWrite(
  db: DatabaseClient,
  identity: PairFeatureIdentity,
  options: FeatureWritePolicyOptions = {}
): Promise<void> {
  if (options.replacePriorVersions) {
    await db
      .prepare(
        `DELETE FROM pair_features
         WHERE investigation_id = ?
           AND platform_a = ? AND platform_b = ?
           AND account_a = ? AND account_b = ?
           AND feature_category = ?
           AND feature_name = ?
           AND extractor_name = ?
           AND extractor_version != ?`
      )
      .bind(
        identity.investigationId,
        identity.platformA,
        identity.platformB,
        identity.accountA,
        identity.accountB,
        identity.featureCategory,
        identity.featureName,
        identity.extractorName,
        identity.extractorVersion
      )
      .run();
  }

  await db
    .prepare(
      `DELETE FROM pair_features
       WHERE investigation_id = ?
         AND platform_a = ? AND platform_b = ?
         AND account_a = ? AND account_b = ?
         AND feature_category = ?
         AND feature_name = ?
         AND extractor_name = ?
         AND extractor_version = ?`
    )
    .bind(
      identity.investigationId,
      identity.platformA,
      identity.platformB,
      identity.accountA,
      identity.accountB,
      identity.featureCategory,
      identity.featureName,
      identity.extractorName,
      identity.extractorVersion
    )
    .run();
}

export async function prepareEventFeatureWrite(
  db: DatabaseClient,
  identity: EventFeatureIdentity,
  options: FeatureWritePolicyOptions = {}
): Promise<void> {
  if (options.replacePriorVersions) {
    await db
      .prepare(
        `DELETE FROM event_features
         WHERE investigation_id = ?
           AND platform = ?
           AND account_identifier = ?
           AND event_timestamp = ?
           AND event_type = ?
           AND extractor_name = ?
           AND extractor_version != ?`
      )
      .bind(
        identity.investigationId,
        identity.platform,
        identity.accountIdentifier,
        identity.eventTimestamp,
        identity.eventType,
        identity.extractorName,
        identity.extractorVersion
      )
      .run();
  }

  await db
    .prepare(
      `DELETE FROM event_features
       WHERE investigation_id = ?
         AND platform = ?
         AND account_identifier = ?
         AND event_timestamp = ?
         AND event_type = ?
         AND extractor_name = ?
         AND extractor_version = ?`
    )
    .bind(
      identity.investigationId,
      identity.platform,
      identity.accountIdentifier,
      identity.eventTimestamp,
      identity.eventType,
      identity.extractorName,
      identity.extractorVersion
    )
    .run();
}

/**
 * Count prior-version rows that would be removed by replacePriorVersions.
 * Used by tests and diagnostics; not required on the write path.
 */
export async function countPriorAccountFeatureVersions(
  db: DatabaseClient,
  identity: Omit<AccountFeatureIdentity, 'extractorVersion'> & {
    extractorVersion: string;
  }
): Promise<number> {
  const res = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM account_features
       WHERE investigation_id = ?
         AND platform = ?
         AND account_identifier = ?
         AND feature_category = ?
         AND feature_name = ?
         AND extractor_name = ?
         AND extractor_version != ?`
    )
    .bind(
      identity.investigationId,
      identity.platform,
      identity.accountIdentifier,
      identity.featureCategory,
      identity.featureName,
      identity.extractorName,
      identity.extractorVersion
    )
    .first<{ n: number }>();
  return Number(res?.n ?? 0);
}

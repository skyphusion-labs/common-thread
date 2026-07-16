/**
 * §6.1.2: prior extractor versions are preserved unless replacePriorVersions.
 */

import { describe, expect, it } from 'vitest';
import {
  countPriorAccountFeatureVersions,
  prepareAccountFeatureWrite,
} from '../../implementation/extractors/feature-write-policy';
import {
  createInvestigation,
  insertAccountFeature,
  startExtractorRun,
} from '../helpers/db';
import { testDb } from '../helpers/test-env';

describe('feature-write-policy (§6.1.2)', () => {
  it('keeps prior-version rows when writing a new version (default)', async () => {
    const db = testDb();
    const investigationId = `ver-overwrite-keep-${Date.now()}`;
    await createInvestigation(db, { id: investigationId });
    const runV1 = await startExtractorRun(db, {
      investigationId,
      extractorName: 'demo_extractor',
      extractorVersion: '1.0.0',
    });
    await insertAccountFeature(db, {
      investigationId,
      platform: 'twitter',
      account: 'alice',
      category: 'account_metadata',
      name: 'display_name',
      value: { kind: 'text', value: 'Alice v1' },
      extractorName: 'demo_extractor',
      extractorVersion: '1.0.0',
      extractorRunId: runV1,
    });

    await prepareAccountFeatureWrite(db, {
      investigationId,
      platform: 'twitter',
      accountIdentifier: 'alice',
      featureCategory: 'account_metadata',
      featureName: 'display_name',
      extractorName: 'demo_extractor',
      extractorVersion: '2.0.0',
    });

    const prior = await countPriorAccountFeatureVersions(db, {
      investigationId,
      platform: 'twitter',
      accountIdentifier: 'alice',
      featureCategory: 'account_metadata',
      featureName: 'display_name',
      extractorName: 'demo_extractor',
      extractorVersion: '2.0.0',
    });
    expect(prior).toBe(1);

    const runV2 = await startExtractorRun(db, {
      investigationId,
      extractorName: 'demo_extractor',
      extractorVersion: '2.0.0',
    });
    await insertAccountFeature(db, {
      investigationId,
      platform: 'twitter',
      account: 'alice',
      category: 'account_metadata',
      name: 'display_name',
      value: { kind: 'text', value: 'Alice v2' },
      extractorName: 'demo_extractor',
      extractorVersion: '2.0.0',
      extractorRunId: runV2,
    });

    const rows = await db
      .prepare(
        `SELECT extractor_version, feature_value_text FROM account_features
         WHERE investigation_id = ? AND feature_name = 'display_name'
         ORDER BY extractor_version`
      )
      .bind(investigationId)
      .all<{ extractor_version: string; feature_value_text: string }>();
    expect(rows.results).toHaveLength(2);
    expect(rows.results?.map((r) => r.extractor_version)).toEqual(['1.0.0', '2.0.0']);
  });

  it('removes prior-version rows only with replacePriorVersions: true', async () => {
    const db = testDb();
    const investigationId = `ver-overwrite-replace-${Date.now()}`;
    await createInvestigation(db, { id: investigationId });
    const runV1 = await startExtractorRun(db, {
      investigationId,
      extractorName: 'demo_extractor',
      extractorVersion: '1.0.0',
    });
    await insertAccountFeature(db, {
      investigationId,
      platform: 'twitter',
      account: 'bob',
      category: 'account_metadata',
      name: 'display_name',
      value: { kind: 'text', value: 'Bob v1' },
      extractorName: 'demo_extractor',
      extractorVersion: '1.0.0',
      extractorRunId: runV1,
    });

    await prepareAccountFeatureWrite(
      db,
      {
        investigationId,
        platform: 'twitter',
        accountIdentifier: 'bob',
        featureCategory: 'account_metadata',
        featureName: 'display_name',
        extractorName: 'demo_extractor',
        extractorVersion: '2.0.0',
      },
      { replacePriorVersions: true }
    );

    const prior = await countPriorAccountFeatureVersions(db, {
      investigationId,
      platform: 'twitter',
      accountIdentifier: 'bob',
      featureCategory: 'account_metadata',
      featureName: 'display_name',
      extractorName: 'demo_extractor',
      extractorVersion: '2.0.0',
    });
    expect(prior).toBe(0);

    const runV2 = await startExtractorRun(db, {
      investigationId,
      extractorName: 'demo_extractor',
      extractorVersion: '2.0.0',
    });
    await insertAccountFeature(db, {
      investigationId,
      platform: 'twitter',
      account: 'bob',
      category: 'account_metadata',
      name: 'display_name',
      value: { kind: 'text', value: 'Bob v2' },
      extractorName: 'demo_extractor',
      extractorVersion: '2.0.0',
      extractorRunId: runV2,
    });

    const rows = await db
      .prepare(
        `SELECT extractor_version, feature_value_text FROM account_features
         WHERE investigation_id = ? AND feature_name = 'display_name'`
      )
      .bind(investigationId)
      .all<{ extractor_version: string; feature_value_text: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results?.[0].extractor_version).toBe('2.0.0');
    expect(rows.results?.[0].feature_value_text).toBe('Bob v2');
  });

  it('same-version re-run is idempotent (clears then allows rewrite)', async () => {
    const db = testDb();
    const investigationId = `ver-overwrite-same-${Date.now()}`;
    await createInvestigation(db, { id: investigationId });
    const run1 = await startExtractorRun(db, {
      investigationId,
      extractorName: 'demo_extractor',
      extractorVersion: '1.0.0',
    });
    await insertAccountFeature(db, {
      investigationId,
      platform: 'twitter',
      account: 'carol',
      category: 'account_metadata',
      name: 'display_name',
      value: { kind: 'text', value: 'Carol old' },
      extractorName: 'demo_extractor',
      extractorVersion: '1.0.0',
      extractorRunId: run1,
    });

    await prepareAccountFeatureWrite(db, {
      investigationId,
      platform: 'twitter',
      accountIdentifier: 'carol',
      featureCategory: 'account_metadata',
      featureName: 'display_name',
      extractorName: 'demo_extractor',
      extractorVersion: '1.0.0',
    });

    const afterClear = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features WHERE investigation_id = ?`
      )
      .bind(investigationId)
      .first<{ n: number }>();
    expect(Number(afterClear?.n ?? 0)).toBe(0);

    const run2 = await startExtractorRun(db, {
      investigationId,
      extractorName: 'demo_extractor',
      extractorVersion: '1.0.0',
    });
    await insertAccountFeature(db, {
      investigationId,
      platform: 'twitter',
      account: 'carol',
      category: 'account_metadata',
      name: 'display_name',
      value: { kind: 'text', value: 'Carol new' },
      extractorName: 'demo_extractor',
      extractorVersion: '1.0.0',
      extractorRunId: run2,
    });

    const rows = await db
      .prepare(
        `SELECT feature_value_text FROM account_features WHERE investigation_id = ?`
      )
      .bind(investigationId)
      .all<{ feature_value_text: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results?.[0].feature_value_text).toBe('Carol new');
  });
});

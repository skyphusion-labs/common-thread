/**
 * Writer-then-runner round-trip + missing-artifact loudness (#108).
 *
 * #108: the ingest writers archive artifacts at sha256/ab/cd/<hash>.json
 * (extension:'json') while the extractor runner read sha256/ab/cd/<hash> (no
 * extension) and silently skipped every miss, so every run completed with 0
 * inputs / 0 features. The existing extractor tests seeded R2 via collectArtifact
 * at the bare-hash path (matching the buggy reader), so they never exercised the
 * real writer/reader key contract.
 *
 * These tests archive through the REAL ingest writer and assert the runner finds
 * what was written, and that a genuinely-missing artifact makes the run LOUD
 * (status 'partial' + recorded reason) instead of a silent 0-feature completion.
 * Runs in the node-db project. Unique investigation id per test.
 */

import { describe, expect, it } from 'vitest';
import { env, testDb } from '../helpers/test-env';
import { createInvestigation } from '../helpers/db';
import { archiveAccountProfiles } from '../../implementation/ingest/apify-profile';
import { runAccountExtractors } from '../../implementation/extractors/runner';
import { TwitterAccountMetadataExtractor } from '../../implementation/extractors/account-metadata/twitter';
import { ArchiveStore } from '../../implementation/archive/store';
import { ManifestStore } from '../../implementation/archive/manifest';
import { extensionForMimeType } from '../../implementation/archive/paths';
import type { AccountFeatureExtractor } from '../../implementation/extractors/types';

const SAMPLE_PROFILE: Record<string, unknown> = {
  id: '1234567890',
  username: 'alice',
  name: 'Alice Example',
  description: 'Test bio',
  followersCount: 100,
  friendsCount: 50,
  statusesCount: 200,
};

async function latestRun(investigationId: string) {
  return testDb()
    .prepare(
      `SELECT status, input_artifact_count, output_feature_count, error_message
       FROM extractor_runs WHERE investigation_id = ? ORDER BY id DESC LIMIT 1`
    )
    .bind(investigationId)
    .first<{
      status: string;
      input_artifact_count: number;
      output_feature_count: number;
      error_message: string | null;
    }>();
}

describe('artifact key extension round trip (#108)', () => {
  it('archives via the real ingest writer, then the runner finds it and lands features', async () => {
    const investigationId = `roundtrip-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });

    // The real writer stores at sha256/ab/cd/<hash>.json (extension:'json').
    await archiveAccountProfiles(
      { ARCHIVE: env.ARCHIVE },
      {
        investigationId,
        collectedAt: new Date().toISOString(),
        profiles: [{ account: 'alice', profile: SAMPLE_PROFILE }],
      }
    );

    const results = await runAccountExtractors(
      { DB: testDb(), ARCHIVE: env.ARCHIVE },
      { investigationId, extractors: [new TwitterAccountMetadataExtractor()] }
    );

    // Before the fix the reader looked at the bare-hash key, missed, and
    // completed with 0 inputs / 0 features. The round trip must now succeed.
    expect(results[0].inputArtifactCount).toBeGreaterThan(0);
    expect(results[0].outputFeatureCount).toBeGreaterThan(0);

    const run = await latestRun(investigationId);
    expect(run?.status).toBe('completed');
    expect(run?.input_artifact_count).toBeGreaterThan(0);
    expect(run?.error_message).toBeNull();

    const count = await testDb()
      .prepare(`SELECT COUNT(*) AS n FROM account_features WHERE investigation_id = ?`)
      .bind(investigationId)
      .first<{ n: number }>();
    expect(count?.n).toBeGreaterThan(0);
  });

  it('marks the run partial and records the reason when a manifest-present artifact is missing', async () => {
    const investigationId = `missing-artifact-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });

    // A manifest entry referencing an artifact that was never stored in R2.
    const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId });
    await manifest.append({
      hash: 'a'.repeat(64),
      account: 'ghost',
      source: 'https://x.com/ghost/profile',
      collectedAt: new Date().toISOString(),
      investigationId,
      collectionMethod: { tool: 'test-missing', version: '1.0.0' },
      mimeType: 'application/json',
      status: 'present',
    } as never);

    // A minimal extractor with no filter reads every entry.
    const probe: AccountFeatureExtractor = {
      name: 'missing_artifact_probe',
      version: '1.0.0',
      extract: () => [],
    };

    const results = await runAccountExtractors(
      { DB: testDb(), ARCHIVE: env.ARCHIVE },
      { investigationId, extractors: [probe] }
    );

    expect(results[0].inputArtifactCount).toBe(0);

    const run = await latestRun(investigationId);
    expect(run?.status).toBe('partial');
    expect(run?.error_message).toMatch(/not found in the archive/);
  });
});

describe('ArchiveStore.getForEntry (#108)', () => {
  it('resolves a json-suffixed object via the entry mimeType', async () => {
    const store = new ArchiveStore({ bucket: env.ARCHIVE });
    const bytes = new TextEncoder().encode(JSON.stringify({ hello: 'world', n: Date.now() }));
    const { hash } = await store.put(bytes, { mimeType: 'application/json', extension: 'json' });

    // Bare-hash read misses (object is at <hash>.json)...
    expect(await store.get(hash, undefined)).toBeNull();
    // ...getForEntry derives .json from the mimeType and finds it.
    const found = await store.getForEntry({ hash, mimeType: 'application/json' });
    expect(found).not.toBeNull();
    expect(new TextDecoder().decode(found!.bytes)).toContain('world');
  });

  it('falls back to the bare-hash layout when no extension applies', async () => {
    const store = new ArchiveStore({ bucket: env.ARCHIVE });
    const bytes = new TextEncoder().encode(`legacy-${Date.now()}`);
    const { hash } = await store.put(bytes, {}); // bare hash, no extension
    const found = await store.getForEntry({ hash, mimeType: 'application/json' });
    expect(found).not.toBeNull();
  });

  it('extensionForMimeType maps known types and ignores parameters', () => {
    expect(extensionForMimeType('application/json')).toBe('json');
    expect(extensionForMimeType('application/json; charset=utf-8')).toBe('json');
    expect(extensionForMimeType('image/png')).toBe('png');
    expect(extensionForMimeType('image/jpeg')).toBe('jpg');
    expect(extensionForMimeType('text/html')).toBe('html');
    expect(extensionForMimeType(undefined)).toBeUndefined();
    expect(extensionForMimeType('application/octet-stream')).toBeUndefined();
  });
});

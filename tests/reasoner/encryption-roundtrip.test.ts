/**
 * Integration test for attribution encryption at rest (§3.5).
 *
 * Exercises the real write path (runAttribution -> attribution_runs INSERT with
 * the investigation key) and the real read path (getAttributionRun) end to end
 * against the test MySQL database, and asserts:
 *   1. an encrypted investigation stores output_summary + output_json as
 *      ciphertext at rest (enc:1: cells), while structural columns (band,
 *      accounts, platforms) stay plaintext and queryable;
 *   2. reading with the derived key restores the plaintext conclusion;
 *   3. a legacy (unencrypted) investigation still stores + reads plaintext,
 *      so the change is backward compatible.
 *
 * Uses the simplest triage-filter path (obviously_not_coordinated -> an
 * 'insufficient' row is written) so only a triage LLM response is mocked; the
 * declination default still populates output_summary + output_json, which is
 * all this test needs.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMock } from '../helpers/undici-mock';

vi.mock('../../implementation/archive/manifest', () => ({
  ManifestStore: class {
    constructor(_opts: unknown) {}
    async manifestHash(): Promise<string> {
      return TEST_MANIFEST_HASH;
    }
  },
}));

import { runAttribution } from '../../implementation/reasoner/runner';
import { getAttributionRun } from '../../implementation/attribution/query';
import {
  deriveInvestigationKey,
  isEncryptedCell,
} from '../../implementation/crypto/investigation-key';
import {
  TEST_MANIFEST_HASH,
  addSeedAccount,
  createInvestigation,
  insertPairFeature,
  insertAccountFeature,
  readAttributionRuns,
  startExtractorRun,
} from '../helpers/db';
import { testDb, testReasonerEnv } from '../helpers/test-env';
import { mockTriageResponse } from '../helpers/llm';
import type { Hyperdrive } from '@cloudflare/workers-types';

/** getAttributionRun is typed to Hyperdrive; the test client resolves at runtime. */
const hd = () => testDb() as unknown as Hyperdrive;

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

beforeEach(() => {
  fetchMock.assertNoPendingInterceptors();
});

async function seedPair(investigationId: string, encrypted: boolean) {
  const created = await createInvestigation(testDb(), { id: investigationId, encrypted });
  const a = 'alice';
  const b = 'bob';
  await addSeedAccount(testDb(), { investigationId, platform: 'twitter', account: a });
  await addSeedAccount(testDb(), { investigationId, platform: 'twitter', account: b });
  const extractorRunId = await startExtractorRun(testDb(), {
    investigationId,
    extractorName: 'test_stylometric',
    status: 'completed',
  });
  await insertPairFeature(testDb(), {
    investigationId,
    platformA: 'twitter',
    platformB: 'twitter',
    accountA: a,
    accountB: b,
    category: 'stylometric',
    name: 'burrows_delta',
    value: { kind: 'numeric', value: 0.42 },
    extractorRunId,
    artifactHashes: ['deadbeef' + '0'.repeat(56)],
  });
  await insertAccountFeature(testDb(), {
    investigationId,
    platform: 'twitter',
    account: a,
    category: 'stylometric',
    name: 'function_word_distribution',
    value: { kind: 'json', value: { the: 0.1 } },
    extractorRunId,
    artifactHashes: ['deadbeef' + '0'.repeat(56)],
  });
  return { created, pair: { a, b } };
}

describe('attribution encryption at rest', () => {
  it('encrypts output at rest and restores it on read for an encrypted investigation', async () => {
    const investigationId = `inv_enc_roundtrip-${Date.now()}`;
    const { created } = await seedPair(investigationId, true);
    expect(created.encKey).not.toBeNull();

    mockTriageResponse({
      verdict: 'obviously_not_coordinated',
      reason: 'no shared signals of substance',
    });

    const summaries = await runAttribution(testReasonerEnv(), {
      investigationId,
      encKey: created.encKey,
    });
    expect(summaries).toHaveLength(1);
    expect(summaries[0].confidence_band).toBe('insufficient');

    // At rest: the analytic payload is ciphertext; structure stays plaintext.
    const rows = await readAttributionRuns(testDb(), investigationId);
    expect(rows).toHaveLength(1);
    expect(isEncryptedCell(rows[0].output_json)).toBe(true);
    expect(isEncryptedCell(rows[0].output_summary)).toBe(true);
    expect(rows[0].confidence_band).toBe('insufficient');
    expect(rows[0].account_a).toBe('alice');
    expect(rows[0].account_b).toBe('bob');
    // The ciphertext must not leak the plaintext reason.
    expect(rows[0].output_summary).not.toMatch(/no shared signals of substance/);
    expect(rows[0].output_json).not.toMatch(/insufficient/);

    // On read with the derived key: the plaintext conclusion is restored.
    const detail = await getAttributionRun(hd(), investigationId, rows[0].id, created.encKey);
    expect(detail).not.toBeNull();
    expect(detail!.output_summary).toMatch(/no shared signals of substance/);
    expect(detail!.output).toBeTypeOf('object');
    expect((detail!.output as { parse_error?: boolean }).parse_error).toBeUndefined();
  });

  it('cannot decrypt the output under a different key', async () => {
    const investigationId = `inv_enc_wrongkey-${Date.now()}`;
    await seedPair(investigationId, true);
    mockTriageResponse({ verdict: 'obviously_not_coordinated', reason: 'x' });

    const key = await deriveInvestigationKey('ct_the_real_token', investigationId);
    // Write under a token, then attempt to read under a different derived key.
    const rows0 = await runAttribution(testReasonerEnv(), { investigationId, encKey: key });
    expect(rows0).toHaveLength(1);
    const rows = await readAttributionRuns(testDb(), investigationId);
    const wrongKey = await deriveInvestigationKey('ct_a_different_token', investigationId);
    await expect(
      getAttributionRun(hd(), investigationId, rows[0].id, wrongKey)
    ).rejects.toThrow();
  });

  it('stores and reads plaintext for a legacy unencrypted investigation', async () => {
    const investigationId = `inv_legacy_plain-${Date.now()}`;
    const { created } = await seedPair(investigationId, false);
    expect(created.encKey).toBeNull();

    mockTriageResponse({ verdict: 'obviously_not_coordinated', reason: 'nope' });

    await runAttribution(testReasonerEnv(), { investigationId });

    const rows = await readAttributionRuns(testDb(), investigationId);
    expect(rows).toHaveLength(1);
    expect(isEncryptedCell(rows[0].output_json)).toBe(false);
    expect(rows[0].output_summary).toMatch(/nope/);

    // Read path with a null key returns the plaintext unchanged.
    const detail = await getAttributionRun(hd(), investigationId, rows[0].id, null);
    expect(detail!.output_summary).toMatch(/nope/);
  });
});

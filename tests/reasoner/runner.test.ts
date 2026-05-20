/**
 * Integration test for reasoner/runner.ts.
 *
 * Exercises the full runAttribution flow: candidate resolution from
 * seed_accounts, signal-table assembly via SQL JOINs against pair_features,
 * account_features, and extractor_runs, triage call, conditional reasoning
 * call, and attribution_runs INSERT. The AI Gateway is intercepted via
 * fetchMock; ManifestStore is mocked at the module level.
 *
 * The schema is applied to the test D1 binding in tests/setup.ts. This
 * file seeds the database with a minimal investigation containing two
 * accounts and a handful of features sufficient to populate a non-empty
 * signal table.
 *
 * Test scope:
 *   1. Triage filter path: triage returns 'obviously_not_coordinated',
 *      runner records an 'insufficient' attribution_runs row, reasoning
 *      is not invoked.
 *   2. Triage escalation + reasoning success path with multi-category
 *      seeding: triage escalates, reasoning returns a valid 'consistent'
 *      claim citing signals from three distinct categories (the §7.3.1
 *      minimum), runner records a 'consistent' row.
 *   3. Canonical account ordering on insert.
 *
 * Module-level unit tests for triage and reasoner behavior live in
 * triage.test.ts and reasoner.test.ts. This file covers the
 * orchestrator integration; the per-module suites cover triage's
 * conservative-escalation paths and the reasoner retry loop / declination.
 *
 * Still deferred:
 *   - Cluster claim handling in derivePairBand (the cluster band is
 *     persisted in output_json but not selected for the pair row's
 *     confidence_band; covered conceptually in derivePairBand's spec
 *     comment, no test yet).
 *   - Determinism: seededShuffle reproducibility test.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env, fetchMock } from 'cloudflare:test';

// Mock ManifestStore at the module level. Hoisted by vi.mock; must
// appear before any import that transitively imports the manifest
// module. The runner only uses .manifestHash().
vi.mock('../../implementation/archive/manifest', () => ({
  ManifestStore: class {
    constructor(_opts: { bucket: R2Bucket }) {}
    async manifestHash(): Promise<string> {
      return TEST_MANIFEST_HASH;
    }
  },
}));

import { runAttribution } from '../../implementation/reasoner/runner';
import type { ReasoningClaim } from '../../implementation/reasoner/types';
import {
  TEST_MANIFEST_HASH,
  addSeedAccount,
  createInvestigation,
  insertAccountFeature,
  insertPairFeature,
  readAttributionRuns,
  startExtractorRun,
} from '../helpers/db';
import {
  mockReasoningResponse,
  mockTriageResponse,
} from '../helpers/llm';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

beforeEach(async () => {
  // Each test gets a fresh investigation ID to avoid cross-test
  // pollution against the shared test D1 binding. The schema is
  // applied once in tests/setup.ts; data accumulates within a run
  // unless tests scope themselves.
  fetchMock.assertNoPendingInterceptors();
});

// ---------------------------------------------------------------------------
// Scenario builder: minimal two-account investigation
// ---------------------------------------------------------------------------

interface ScenarioOpts {
  investigationId: string;
  /** Account A's identifier; will be canonicalized to < account_b. */
  accountA?: string;
  accountB?: string;
  /** If true, include some pair features in addition to account features. */
  withPairFeatures?: boolean;
}

async function buildTwoAccountScenario(opts: ScenarioOpts): Promise<{
  pair: { account_a: string; account_b: string; platform_a: string; platform_b: string };
  extractorRunId: number;
}> {
  // Canonicalize so account_a < account_b matches the schema CHECK.
  const rawA = opts.accountA ?? 'alice';
  const rawB = opts.accountB ?? 'bob';
  const [a, b] = rawA < rawB ? [rawA, rawB] : [rawB, rawA];

  await createInvestigation(env.DB, { id: opts.investigationId });
  await addSeedAccount(env.DB, {
    investigationId: opts.investigationId,
    platform: 'twitter',
    account: a,
    basisStatement: `seed reason for ${a}`,
  });
  await addSeedAccount(env.DB, {
    investigationId: opts.investigationId,
    platform: 'twitter',
    account: b,
    basisStatement: `seed reason for ${b}`,
  });

  const extractorRunId = await startExtractorRun(env.DB, {
    investigationId: opts.investigationId,
    extractorName: 'test_stylometric',
    status: 'completed',
  });

  await insertAccountFeature(env.DB, {
    investigationId: opts.investigationId,
    platform: 'twitter',
    account: a,
    category: 'stylometric',
    name: 'function_word_distribution',
    value: { kind: 'json', value: { the: 0.1, a: 0.05 } },
    extractorRunId,
    artifactHashes: ['deadbeef' + '0'.repeat(56)],
  });
  await insertAccountFeature(env.DB, {
    investigationId: opts.investigationId,
    platform: 'twitter',
    account: b,
    category: 'stylometric',
    name: 'function_word_distribution',
    value: { kind: 'json', value: { the: 0.11, a: 0.04 } },
    extractorRunId,
    artifactHashes: ['cafebabe' + '0'.repeat(56)],
  });

  if (opts.withPairFeatures) {
    await insertPairFeature(env.DB, {
      investigationId: opts.investigationId,
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
  }

  return {
    pair: { account_a: a, account_b: b, platform_a: 'twitter', platform_b: 'twitter' },
    extractorRunId,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAttribution', () => {
  it('records an insufficient row when triage filters the pair', async () => {
    const investigationId = 'inv_triage_filter';
    const { pair } = await buildTwoAccountScenario({
      investigationId,
      withPairFeatures: true,
    });

    mockTriageResponse({
      verdict: 'obviously_not_coordinated',
      reason: 'no shared signals of substance',
    });

    const summaries = await runAttribution(env, { investigationId });

    expect(summaries).toHaveLength(1);
    const [s] = summaries;
    expect(s.account_a).toBe(pair.account_a);
    expect(s.account_b).toBe(pair.account_b);
    expect(s.confidence_band).toBe('insufficient');
    expect(s.triage_verdict).toBe('obviously_not_coordinated');
    expect(s.reasoning_invoked).toBe(false);
    expect(s.reasoning_declined).toBe(false);

    const rows = await readAttributionRuns(env.DB, investigationId);
    expect(rows).toHaveLength(1);
    expect(rows[0].confidence_band).toBe('insufficient');
    expect(rows[0].account_a).toBe(pair.account_a);
    expect(rows[0].account_b).toBe(pair.account_b);
    expect(rows[0].platform_a).toBe('twitter');
    expect(rows[0].platform_b).toBe('twitter');
    expect(rows[0].manifest_hash_at_run).toBe(TEST_MANIFEST_HASH);
    expect(rows[0].output_summary).toMatch(/Triage filtered/);
    expect(rows[0].output_summary).toMatch(/no shared signals of substance/);
    expect(rows[0].reasoning_prompt_version).toBe('triage-v1');
  });

  it('escalates to reasoning and persists a consistent claim when reasoning cites three distinct categories', async () => {
    const investigationId = 'inv_reasoning_consistent';
    const a = 'alice';
    const b = 'bob';

    // Seed multi-category features so the validator can pass §7.3.1's
    // >=3 distinct categories rule for the 'consistent' band. All
    // features are attached to account `a` for simplicity; the runner
    // pulls account_features for either account in the pair, and a
    // single account contributing >=3 categories is sufficient to
    // satisfy the citation aggregate.
    await createInvestigation(env.DB, { id: investigationId });
    await addSeedAccount(env.DB, {
      investigationId,
      platform: 'twitter',
      account: a,
      basisStatement: `seed reason for ${a}`,
    });
    await addSeedAccount(env.DB, {
      investigationId,
      platform: 'twitter',
      account: b,
      basisStatement: `seed reason for ${b}`,
    });
    const erId = await startExtractorRun(env.DB, {
      investigationId,
      extractorName: 'multi_category_test',
      status: 'completed',
    });
    const styloId = await insertAccountFeature(env.DB, {
      investigationId,
      platform: 'twitter',
      account: a,
      category: 'stylometric',
      name: 'function_word_top50',
      value: { kind: 'json', value: { the: 0.1, a: 0.05 } },
      extractorRunId: erId,
    });
    const tempoId = await insertAccountFeature(env.DB, {
      investigationId,
      platform: 'twitter',
      account: a,
      category: 'temporal',
      name: 'active_hour_pattern',
      value: { kind: 'json', value: { hours: [1, 2, 3] } },
      extractorRunId: erId,
    });
    const netId = await insertAccountFeature(env.DB, {
      investigationId,
      platform: 'twitter',
      account: a,
      category: 'network',
      name: 'follower_count_ratio',
      value: { kind: 'numeric', value: 0.42 },
      extractorRunId: erId,
    });

    mockTriageResponse({ verdict: 'warrants_further_analysis' });

    const claim: ReasoningClaim = {
      subject: {
        type: 'pair',
        account_a: a,
        account_b: b,
        platform_a: 'twitter',
        platform_b: 'twitter',
      },
      confidence_band: 'consistent',
      citations: [
        { signal_id: `account:${styloId}` },
        { signal_id: `account:${tempoId}` },
        { signal_id: `account:${netId}` },
      ],
      reasoning: `Cites account:${styloId} (stylometric), account:${tempoId} (temporal), and account:${netId} (network) across three categories consistent with a common operator.`,
    };
    mockReasoningResponse({
      claims: [claim],
      alternative_explanations: [
        {
          claim_index: 0,
          alternative: 'shared_editorial_coordination',
          assessment: 'weighs_against',
          citations: [],
          reasoning: 'No editorial overlap signals are present in the seeded scenario.',
        },
      ],
    });

    const summaries = await runAttribution(env, { investigationId });

    expect(summaries).toHaveLength(1);
    const [s] = summaries;
    expect(s.account_a).toBe(a);
    expect(s.account_b).toBe(b);
    expect(s.confidence_band).toBe('consistent');
    expect(s.triage_verdict).toBe('warrants_further_analysis');
    expect(s.reasoning_invoked).toBe(true);
    expect(s.reasoning_declined).toBe(false);
    expect(s.reasoning_attempts).toBe(1);

    const rows = await readAttributionRuns(env.DB, investigationId);
    expect(rows).toHaveLength(1);
    expect(rows[0].confidence_band).toBe('consistent');
    expect(rows[0].reasoning_prompt_version).toBe('reasoning-v1');
    expect(rows[0].output_summary).toMatch(/^consistent/);

    const parsed = JSON.parse(rows[0].output_json) as Record<string, unknown>;
    expect(parsed.triage).toBeTruthy();
    const persistedClaims = parsed.claims as Array<{ confidence_band: string }>;
    expect(persistedClaims).toHaveLength(1);
    expect(persistedClaims[0].confidence_band).toBe('consistent');
  });

  it('uses canonical account ordering on insert', async () => {
    // Pass accountA and accountB in non-canonical order (z before a)
    // and confirm the schema's CHECK (account_a < account_b) does not
    // get violated because the runner canonicalizes via
    // canonicalPlatformedPair.
    const investigationId = 'inv_canonical_order';
    const { pair } = await buildTwoAccountScenario({
      investigationId,
      accountA: 'zebra',
      accountB: 'aardvark',
      withPairFeatures: true,
    });
    expect(pair.account_a).toBe('aardvark');
    expect(pair.account_b).toBe('zebra');

    mockTriageResponse({ verdict: 'obviously_not_coordinated', reason: 'test' });

    const summaries = await runAttribution(env, { investigationId });
    expect(summaries).toHaveLength(1);
    expect(summaries[0].account_a).toBe('aardvark');
    expect(summaries[0].account_b).toBe('zebra');

    const rows = await readAttributionRuns(env.DB, investigationId);
    expect(rows).toHaveLength(1);
    expect(rows[0].account_a).toBe('aardvark');
    expect(rows[0].account_b).toBe('zebra');
  });
});

// ---------------------------------------------------------------------------
// Cluster claim handling (deferred)
// ---------------------------------------------------------------------------
//
// derivePairBand intentionally ignores cluster claims when selecting
// the band for an attribution_runs row. The cluster band is still
// persisted in output_json. A future test should seed three accounts,
// mock a reasoning output with two pair claims and one cluster claim,
// and assert that the cluster band appears in the persisted JSON but
// does not influence the per-pair confidence_band column.

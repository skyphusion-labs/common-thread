/**
 * Tests for reasoner/triage.ts.
 *
 * Triage is a one-shot LLM call with no validation pass. The
 * methodology constraint is §7.5.2: the triage model may only emit
 * 'obviously_not_coordinated' or 'warrants_further_analysis'. On any
 * deviation (malformed JSON, missing verdict, off-spec verdict) the
 * implementation conservatively escalates because false-negative
 * triage (silently filtering a coordinated pair) is the methodology's
 * most serious failure mode.
 *
 * Test coverage:
 *
 *   Success paths:
 *     - 'obviously_not_coordinated' with reason → preserved
 *     - 'warrants_further_analysis' with reason → preserved
 *     - 'obviously_not_coordinated' without reason → undefined reason
 *
 *   Conservative escalation paths:
 *     - Malformed JSON
 *     - Valid JSON missing the verdict field
 *     - Off-spec verdict ('consistent')
 *     - Off-spec verdict ('strongly_consistent')
 *     - Off-spec verdict (arbitrary string)
 *
 *   Methodology metadata:
 *     - prompt_version is 'triage-v1'
 *     - model_identifier matches the input model alias
 *     - model_version matches the response's resolved model field
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { fetchMock } from '../helpers/undici-mock';

import { runTriage } from '../../implementation/reasoner/triage';
import type { SignalId, SignalTable } from '../../implementation/reasoner/types';
import {
  mockTriageMalformed,
  mockTriageResponse,
} from '../helpers/llm';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSignalTable(): SignalTable {
  return {
    investigation_id: 'inv_triage_test',
    basis_statements: [
      { account: 'alice', platform: 'twitter', statement: 'seed reason for alice' },
      { account: 'bob', platform: 'twitter', statement: 'seed reason for bob' },
    ],
    signals: [
      {
        signal_id: 'pair:1' as SignalId,
        category: 'stylometric',
        feature_name: 'burrows_delta',
        scope: {
          type: 'pair',
          account_a: 'alice',
          account_b: 'bob',
          platform_a: 'twitter',
          platform_b: 'twitter',
        },
        value: { kind: 'numeric', value: 0.42 },
        confidence_flag: 'sufficient',
        provenance_fingerprint: 'deadbeef',
      },
    ],
    randomization_seed: 'fixed-seed-for-triage-tests',
  };
}

const PAIR = {
  account_a: 'alice',
  account_b: 'bob',
  platform_a: 'twitter',
  platform_b: 'twitter',
};

const BASE_OPTS = {
  apiKey: 'sk-test',
  gatewayUrl: 'https://gateway.test/anthropic',
  model: 'claude-haiku-4-5',
  pair: PAIR,
};

// ---------------------------------------------------------------------------
// Success paths
// ---------------------------------------------------------------------------

describe('runTriage: success paths', () => {
  it("preserves 'obviously_not_coordinated' with its reason", async () => {
    mockTriageResponse({
      verdict: 'obviously_not_coordinated',
      reason: 'no shared signals of substance',
    });
    const out = await runTriage({ ...BASE_OPTS, signal_table: makeSignalTable() });
    expect(out.verdict).toBe('obviously_not_coordinated');
    expect(out.reason).toBe('no shared signals of substance');
  });

  it("preserves 'warrants_further_analysis' with its reason", async () => {
    mockTriageResponse({
      verdict: 'warrants_further_analysis',
      reason: 'temporal pattern overlap above threshold',
    });
    const out = await runTriage({ ...BASE_OPTS, signal_table: makeSignalTable() });
    expect(out.verdict).toBe('warrants_further_analysis');
    expect(out.reason).toBe('temporal pattern overlap above threshold');
  });

  it("returns undefined reason when the model omits it", async () => {
    mockTriageResponse({ verdict: 'obviously_not_coordinated' });
    const out = await runTriage({ ...BASE_OPTS, signal_table: makeSignalTable() });
    expect(out.verdict).toBe('obviously_not_coordinated');
    expect(out.reason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Conservative escalation paths (§7.5.2 default-behavior rule)
// ---------------------------------------------------------------------------

describe('runTriage: conservative escalation', () => {
  it('escalates on malformed JSON', async () => {
    mockTriageMalformed('this is not json at all');
    const out = await runTriage({ ...BASE_OPTS, signal_table: makeSignalTable() });
    expect(out.verdict).toBe('warrants_further_analysis');
    expect(out.reason).toMatch(/§7\.5\.2/);
  });

  it('escalates when the model omits the verdict field', async () => {
    mockTriageMalformed('{"reason": "I forgot to include the verdict"}');
    const out = await runTriage({ ...BASE_OPTS, signal_table: makeSignalTable() });
    expect(out.verdict).toBe('warrants_further_analysis');
    expect(out.reason).toMatch(/§7\.5\.2/);
  });

  it("escalates when the model emits off-spec verdict 'consistent'", async () => {
    mockTriageMalformed('{"verdict": "consistent"}');
    const out = await runTriage({ ...BASE_OPTS, signal_table: makeSignalTable() });
    expect(out.verdict).toBe('warrants_further_analysis');
    expect(out.reason).toMatch(/§7\.5\.2/);
  });

  it("escalates when the model emits off-spec verdict 'strongly_consistent'", async () => {
    mockTriageMalformed('{"verdict": "strongly_consistent"}');
    const out = await runTriage({ ...BASE_OPTS, signal_table: makeSignalTable() });
    expect(out.verdict).toBe('warrants_further_analysis');
    expect(out.reason).toMatch(/§7\.5\.2/);
  });

  it('escalates when the model emits a random string as verdict', async () => {
    mockTriageMalformed('{"verdict": "i am not following instructions"}');
    const out = await runTriage({ ...BASE_OPTS, signal_table: makeSignalTable() });
    expect(out.verdict).toBe('warrants_further_analysis');
    expect(out.reason).toMatch(/§7\.5\.2/);
  });
});

// ---------------------------------------------------------------------------
// Methodology metadata authoring
// ---------------------------------------------------------------------------

describe('runTriage: methodology_metadata', () => {
  it('populates methodology_metadata with prompt_version, model_identifier, and model_version', async () => {
    mockTriageResponse({
      verdict: 'obviously_not_coordinated',
      modelVersion: 'claude-haiku-4-5-20260101',
    });
    const out = await runTriage({
      ...BASE_OPTS,
      model: 'claude-haiku-4-5',
      signal_table: makeSignalTable(),
    });

    expect(out.methodology_metadata.prompt_version).toBe('triage-v1');
    expect(out.methodology_metadata.model_identifier).toBe('claude-haiku-4-5');
    expect(out.methodology_metadata.model_version).toBe('claude-haiku-4-5-20260101');
    // randomization_seed propagates from the signal table.
    expect(out.methodology_metadata.randomization_seed).toBe('fixed-seed-for-triage-tests');
    // run_timestamp is ISO 8601 UTC; assert shape rather than exact value.
    expect(out.methodology_metadata.run_timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
    );
  });

  it('still populates methodology_metadata on escalation paths', async () => {
    mockTriageMalformed('not json');
    const out = await runTriage({ ...BASE_OPTS, signal_table: makeSignalTable() });

    expect(out.methodology_metadata.prompt_version).toBe('triage-v1');
    expect(out.methodology_metadata.model_identifier).toBe('claude-haiku-4-5');
    // model_version may fall back to the input model if the response
    // didn't include a model field; the ai-gateway layer handles this
    // by returning input model as a sentinel. Either way it's a
    // non-empty string.
    expect(out.methodology_metadata.model_version.length).toBeGreaterThan(0);
  });
});

/**
 * Tests for reasoner/reasoner.ts.
 *
 * Covers the §7.4 reasoning call wrapped by the §7.2.3 retry loop:
 *
 *   Happy path:
 *     - First-attempt success: validator passes, attempts=1, declined=false
 *
 *   Retry on format failure (§7.2.3):
 *     - Malformed JSON on attempt 1, valid output on attempt 2 →
 *       attempts=2, declined=false
 *
 *   Retry on content failure (§7.2.2):
 *     - Output with insufficient category coverage on attempt 1
 *       ('consistent' but only one category cited), valid on attempt 2
 *       → attempts=2, declined=false
 *
 *   Declination on exhaustion:
 *     - Three malformed attempts → attempts=3, declined=true,
 *       declined_pairs populated from every pair-scope signal in the
 *       signal table
 *
 *   Methodology metadata authoring:
 *     - The model's self-reported methodology_metadata is overwritten
 *       with run-source values regardless of what the model returned
 *
 *   buildRetryPromptAddition unit tests (separate describe block):
 *     - Includes attempt and max_attempts numbers
 *     - Lists every failure with its layer and reason
 *     - Locates failures by claim/citation/alternative index
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fetchMock } from '../helpers/undici-mock';

import { buildRetryPromptAddition } from '../../implementation/reasoner/prompts';
import { runReasoning } from '../../implementation/reasoner/reasoner';
import type {
  PresentedSignal,
  ReasoningClaim,
  SignalId,
  SignalTable,
  ValidationFailure,
} from '../../implementation/reasoner/types';
import {
  mockReasoningMalformed,
  mockReasoningResponse,
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

const PAIR_SUBJECT = {
  type: 'pair' as const,
  account_a: 'alice',
  account_b: 'bob',
  platform_a: 'twitter',
  platform_b: 'twitter',
};

const BASE_OPTS = {
  apiKey: 'sk-test',
  gatewayUrl: 'https://gateway.test/anthropic',
  model: 'claude-opus-4-7',
};

/**
 * Build a SignalTable with one pair signal plus three account signals
 * across three distinct categories (stylometric, temporal, network).
 * This is the minimum shape needed to mock 'consistent' claims that
 * pass §7.3.1's three-category rule.
 */
function makeMultiCategorySignalTable(): SignalTable {
  const signals: PresentedSignal[] = [
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
    {
      signal_id: 'account:1' as SignalId,
      category: 'stylometric',
      feature_name: 'function_word_top50',
      scope: { type: 'account', account: 'alice', platform: 'twitter' },
      value: { kind: 'json', value: { the: 0.10 } },
      confidence_flag: 'sufficient',
      provenance_fingerprint: 'cafebabe',
    },
    {
      signal_id: 'account:2' as SignalId,
      category: 'temporal',
      feature_name: 'active_hour_pattern',
      scope: { type: 'account', account: 'alice', platform: 'twitter' },
      value: { kind: 'json', value: { hours: [1, 2, 3] } },
      confidence_flag: 'sufficient',
      provenance_fingerprint: 'feedface',
    },
    {
      signal_id: 'account:3' as SignalId,
      category: 'network',
      feature_name: 'follower_count_ratio',
      scope: { type: 'account', account: 'alice', platform: 'twitter' },
      value: { kind: 'numeric', value: 0.42 },
      confidence_flag: 'sufficient',
      provenance_fingerprint: 'badc0ffe',
    },
  ];
  return {
    investigation_id: 'inv_reasoner_test',
    basis_statements: [
      { account: 'alice', platform: 'twitter', statement: 'seed reason for alice' },
      { account: 'bob', platform: 'twitter', statement: 'seed reason for bob' },
    ],
    signals,
    randomization_seed: 'fixed-seed-for-reasoner-tests',
  };
}

/**
 * Build a 'consistent' claim citing three distinct categories
 * (stylometric, temporal, network) for the canonical pair. Paired
 * with the standard alternative_explanation, this passes the
 * validator's format and content layers.
 */
function makeValidConsistentClaim(): ReasoningClaim {
  return {
    subject: PAIR_SUBJECT,
    confidence_band: 'consistent',
    citations: [
      { signal_id: 'account:1' },
      { signal_id: 'account:2' },
      { signal_id: 'account:3' },
    ],
    reasoning:
      'Cites account:1 (stylometric), account:2 (temporal), account:3 (network) showing consistent patterns across three categories.',
  };
}

function makeValidAlternative(claimIndex: number) {
  return {
    claim_index: claimIndex,
    alternative: 'shared_editorial_coordination',
    assessment: 'weighs_against' as const,
    citations: [],
    reasoning: 'No editorial overlap signals are present in the seeded scenario.',
  };
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('runReasoning: first-attempt success', () => {
  it('returns the validated output with attempts=1 and declined=false', async () => {
    mockReasoningResponse({
      claims: [makeValidConsistentClaim()],
      alternative_explanations: [makeValidAlternative(0)],
    });

    const result = await runReasoning({
      ...BASE_OPTS,
      signal_table: makeMultiCategorySignalTable(),
    });

    expect(result.attempts).toBe(1);
    expect(result.declined).toBe(false);
    expect(result.final_failures).toHaveLength(0);
    expect(result.output.claims).toHaveLength(1);
    expect(result.output.claims[0].confidence_band).toBe('consistent');
  });
});

// ---------------------------------------------------------------------------
// Retry on format failure
// ---------------------------------------------------------------------------

describe('runReasoning: retry on format failure', () => {
  it('retries once when the first response is malformed JSON and succeeds on attempt 2', async () => {
    // Attempt 1: malformed (not JSON at all)
    mockReasoningMalformed('this is not json');
    // Attempt 2: valid output
    mockReasoningResponse({
      claims: [makeValidConsistentClaim()],
      alternative_explanations: [makeValidAlternative(0)],
    });

    const result = await runReasoning({
      ...BASE_OPTS,
      signal_table: makeMultiCategorySignalTable(),
    });

    expect(result.attempts).toBe(2);
    expect(result.declined).toBe(false);
    expect(result.output.claims).toHaveLength(1);
    expect(result.output.claims[0].confidence_band).toBe('consistent');
  });
});

// ---------------------------------------------------------------------------
// Retry on content failure
// ---------------------------------------------------------------------------

describe('runReasoning: retry on content failure', () => {
  it("retries when a 'consistent' claim cites only one category, then succeeds on attempt 2", async () => {
    // Attempt 1: 'consistent' claim but only ONE category cited.
    // Validator's CLAIM_AGGREGATE_RULES requires >=3 categories for
    // 'consistent' (§7.3.1), so this fails the content layer.
    const insufficientClaim: ReasoningClaim = {
      subject: PAIR_SUBJECT,
      confidence_band: 'consistent',
      citations: [{ signal_id: 'account:1' }], // single stylometric citation
      reasoning: 'Only one category cited; validator will reject.',
    };
    mockReasoningResponse({
      claims: [insufficientClaim],
      alternative_explanations: [makeValidAlternative(0)],
    });

    // Attempt 2: valid 'consistent' claim with three categories.
    mockReasoningResponse({
      claims: [makeValidConsistentClaim()],
      alternative_explanations: [makeValidAlternative(0)],
    });

    const result = await runReasoning({
      ...BASE_OPTS,
      signal_table: makeMultiCategorySignalTable(),
    });

    expect(result.attempts).toBe(2);
    expect(result.declined).toBe(false);
    expect(result.output.claims[0].confidence_band).toBe('consistent');
    expect(result.output.claims[0].citations).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Declination on exhaustion
// ---------------------------------------------------------------------------

describe('runReasoning: declination on exhausted retries', () => {
  it('declines after max_attempts=3 malformed responses', async () => {
    mockReasoningMalformed('attempt one not json');
    mockReasoningMalformed('attempt two also not json');
    mockReasoningMalformed('attempt three still not json');

    const result = await runReasoning({
      ...BASE_OPTS,
      signal_table: makeMultiCategorySignalTable(),
    });

    expect(result.attempts).toBe(3);
    expect(result.declined).toBe(true);
    expect(result.output.claims).toHaveLength(0);
    expect(result.output.alternative_explanations).toHaveLength(0);
    // declined_pairs is populated from every pair-scope signal in the
    // signal table. Our fixture has one pair-scope signal (pair:1) so
    // declined_pairs should have exactly one entry for that pair.
    expect(result.output.declined_pairs).toHaveLength(1);
    const [dp] = result.output.declined_pairs;
    expect(dp.account_a).toBe('alice');
    expect(dp.account_b).toBe('bob');
    expect(dp.platform_a).toBe('twitter');
    expect(dp.platform_b).toBe('twitter');
    expect(dp.reason).toMatch(/§7\.2\.3/);
  });

  it('respects the max_attempts override', async () => {
    mockReasoningMalformed('attempt 1');
    mockReasoningMalformed('attempt 2');

    const result = await runReasoning({
      ...BASE_OPTS,
      signal_table: makeMultiCategorySignalTable(),
      max_attempts: 2,
    });

    expect(result.attempts).toBe(2);
    expect(result.declined).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Methodology metadata authoring
// ---------------------------------------------------------------------------

describe('runReasoning: methodology metadata authoring', () => {
  it('overwrites model-self-reported methodology_metadata with run-source values', async () => {
    // The mockReasoningResponse helper writes placeholder metadata into
    // the body; the reasoner.ts overwrite logic should replace it with
    // run-source values regardless of what the model returned.
    mockReasoningResponse({
      claims: [makeValidConsistentClaim()],
      alternative_explanations: [makeValidAlternative(0)],
      modelVersion: 'claude-opus-4-7-20260101',
    });

    const result = await runReasoning({
      ...BASE_OPTS,
      model: 'claude-opus-4-7',
      signal_table: makeMultiCategorySignalTable(),
    });

    const md = result.output.methodology_metadata;
    expect(md.model_identifier).toBe('claude-opus-4-7');
    expect(md.model_version).toBe('claude-opus-4-7-20260101');
    expect(md.prompt_version).toBe('reasoning-v1');
    // The seed from the input SignalTable propagates, NOT the
    // placeholder the mock helper wrote into the body.
    expect(md.randomization_seed).toBe('fixed-seed-for-reasoner-tests');
    expect(md.run_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('populates methodology_metadata on declination output too', async () => {
    mockReasoningMalformed('1');
    mockReasoningMalformed('2');
    mockReasoningMalformed('3');

    const result = await runReasoning({
      ...BASE_OPTS,
      signal_table: makeMultiCategorySignalTable(),
    });

    const md = result.output.methodology_metadata;
    expect(md.model_identifier).toBe('claude-opus-4-7');
    expect(md.prompt_version).toBe('reasoning-v1');
    expect(md.randomization_seed).toBe('fixed-seed-for-reasoner-tests');
    expect(md.run_timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// buildRetryPromptAddition unit tests
// ---------------------------------------------------------------------------

describe('buildRetryPromptAddition', () => {
  it('includes the attempt number and max attempts in the header', () => {
    const out = buildRetryPromptAddition({
      attempt_number: 2,
      max_attempts: 3,
      failures: [{ layer: 'format', reason: 'something' }],
    });
    expect(out).toMatch(/attempt 2 of 3/);
  });

  it('cites §7.2.3 declination as the final-failure consequence', () => {
    const out = buildRetryPromptAddition({
      attempt_number: 2,
      max_attempts: 3,
      failures: [{ layer: 'format', reason: 'something' }],
    });
    expect(out).toMatch(/§7\.2\.3/);
  });

  it('lists every failure with its layer tag and reason', () => {
    const failures: ValidationFailure[] = [
      { layer: 'format', reason: 'first failure reason' },
      { layer: 'content', reason: 'second failure reason' },
    ];
    const out = buildRetryPromptAddition({
      attempt_number: 2,
      max_attempts: 3,
      failures,
    });
    expect(out).toContain('[format]');
    expect(out).toContain('first failure reason');
    expect(out).toContain('[content]');
    expect(out).toContain('second failure reason');
  });

  it('locates failures by claim_index, citation_index, and alternative_index when supplied', () => {
    const failures: ValidationFailure[] = [
      { layer: 'format', claim_index: 0, citation_index: 1, reason: 'r1' },
      { layer: 'content', alternative_index: 2, reason: 'r2' },
    ];
    const out = buildRetryPromptAddition({
      attempt_number: 2,
      max_attempts: 3,
      failures,
    });
    expect(out).toContain('claim[0]');
    expect(out).toContain('citation[1]');
    expect(out).toContain('alternative[2]');
  });

  it('emits a non-empty addition even with zero failures', () => {
    // Defensive: reasoner.ts only invokes this with attempt > 1 AND
    // lastFailures populated, but the function itself should still
    // produce something usable if called with empty failures.
    const out = buildRetryPromptAddition({
      attempt_number: 2,
      max_attempts: 3,
      failures: [],
    });
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/attempt 2 of 3/);
  });
});

// ---------------------------------------------------------------------------
// Retry feedback wire-up
// ---------------------------------------------------------------------------
//
// Confirms that buildRetryPromptAddition's output actually reaches the
// LLM on attempt 2+. The other retry tests verify the `attempts`
// counter and final-output shape but not the on-wire prompt content.
// This test bypasses fetchMock for the duration of the test by
// spying on globalThis.fetch directly, captures both request bodies,
// and asserts that the §7.2.3 retry feedback appears in attempt 2's
// user message and does NOT appear in attempt 1's.

describe('runReasoning: retry feedback wire-up', () => {
  it('appends §7.2.3 retry feedback to the user prompt on attempt 2 after a format failure', async () => {
    const capturedBodies: string[] = [];

    const validEmptyOutput = JSON.stringify({
      claims: [],
      alternative_explanations: [],
      declined_pairs: [],
      methodology_metadata: {
        model_identifier: 'test',
        model_version: 'test',
        prompt_version: 'test',
        randomization_seed: 'test',
        run_timestamp: '2026-05-20T21:00:00Z',
      },
    });

    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      const body = (init?.body ?? '') as string;
      capturedBodies.push(body);
      const attempt = capturedBodies.length;
      const innerText = attempt === 1 ? 'this is not json' : validEmptyOutput;
      return new Response(
        JSON.stringify({
          id: `msg_test_${attempt}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: innerText }],
          model: 'claude-opus-4-7-20260101',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      );
    });

    try {
      const result = await runReasoning({
        ...BASE_OPTS,
        signal_table: makeMultiCategorySignalTable(),
      });

      expect(result.attempts).toBe(2);
      expect(result.declined).toBe(false);
    } finally {
      spy.mockRestore();
    }

    expect(capturedBodies).toHaveLength(2);

    const attempt1Body = JSON.parse(capturedBodies[0]) as {
      messages: Array<{ content: string }>;
    };
    const attempt2Body = JSON.parse(capturedBodies[1]) as {
      messages: Array<{ content: string }>;
    };

    const attempt1UserMsg = attempt1Body.messages[0].content;
    const attempt2UserMsg = attempt2Body.messages[0].content;

    // Attempt 1 must NOT contain retry feedback (first try).
    expect(attempt1UserMsg).not.toMatch(/RETRY \(attempt/);

    // Attempt 2 MUST contain the retry feedback header, the §7.2.3
    // consequence statement, the Failures: listing, and the specific
    // failure reason that the validator emitted for attempt 1's
    // malformed JSON.
    expect(attempt2UserMsg).toMatch(/RETRY \(attempt 2 of 3\)/);
    expect(attempt2UserMsg).toMatch(/§7\.2\.3/);
    expect(attempt2UserMsg).toMatch(/Failures:/);
    expect(attempt2UserMsg).toMatch(/not parseable as a JSON object/);
  });
});

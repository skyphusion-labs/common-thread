/**
 * Pure-function tests for runner.ts internals exported for testability:
 *   - derivePairBand: how the runner picks an attribution_runs row's
 *     confidence_band from a ReasoningOutput
 *   - seededShuffle: deterministic shuffle used to order candidate
 *     pairs and signals
 *
 * These tests have no D1, fetch, or env dependency. They construct
 * minimal ReasoningOutput and array inputs in JS and assert on the
 * direct return values.
 */

import { describe, expect, it } from 'vitest';

import {
  derivePairBand,
  seededShuffle,
} from '../../implementation/reasoner/runner';
import type {
  AlternativeExplanation,
  ReasoningClaim,
  ReasoningOutput,
} from '../../implementation/reasoner/types';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const PAIR = {
  account_a: 'alice',
  account_b: 'bob',
  platform_a: 'twitter',
  platform_b: 'twitter',
};

const OTHER_PAIR = {
  account_a: 'alice',
  account_b: 'carol',
  platform_a: 'twitter',
  platform_b: 'twitter',
};

function pairClaim(
  band: ReasoningClaim['confidence_band'],
  subject = PAIR
): ReasoningClaim {
  return {
    subject: {
      type: 'pair',
      account_a: subject.account_a,
      account_b: subject.account_b,
      platform_a: subject.platform_a,
      platform_b: subject.platform_b,
    },
    confidence_band: band,
    citations: [{ signal_id: 'account:1' }],
    reasoning: 'test claim',
  };
}

function clusterClaim(
  band: ReasoningClaim['confidence_band'],
  composed_from: number[]
): ReasoningClaim {
  return {
    subject: {
      type: 'cluster',
      accounts: [
        { account: 'alice', platform: 'twitter' },
        { account: 'bob', platform: 'twitter' },
        { account: 'carol', platform: 'twitter' },
      ],
      composed_from,
    },
    confidence_band: band,
    citations: [{ signal_id: 'account:1' }],
    reasoning: 'cluster claim',
  };
}

function altFor(claimIndex: number): AlternativeExplanation {
  return {
    claim_index: claimIndex,
    alternative: 'shared_editorial_coordination',
    assessment: 'weighs_against',
    citations: [],
    reasoning: 'placeholder',
  };
}

function outputWith(claims: ReasoningClaim[]): ReasoningOutput {
  return {
    claims,
    alternative_explanations: claims.map((_, i) => altFor(i)),
    declined_pairs: [],
    methodology_metadata: {
      model_identifier: 'test',
      model_version: 'test',
      prompt_version: 'test',
      randomization_seed: 'test',
      run_timestamp: '2026-05-20T21:00:00Z',
    },
  };
}

// ---------------------------------------------------------------------------
// derivePairBand
// ---------------------------------------------------------------------------

describe('derivePairBand', () => {
  it("returns 'insufficient' when the claims array is empty", () => {
    const band = derivePairBand(outputWith([]), PAIR);
    expect(band).toBe('insufficient');
  });

  it("returns the matching pair claim's band when exactly one matches", () => {
    const out = outputWith([pairClaim('consistent', PAIR)]);
    expect(derivePairBand(out, PAIR)).toBe('consistent');
  });

  it("returns the highest band when multiple claims match the same pair", () => {
    const out = outputWith([
      pairClaim('consistent', PAIR),
      pairClaim('strongly_consistent', PAIR),
      pairClaim('insufficient', PAIR),
    ]);
    expect(derivePairBand(out, PAIR)).toBe('strongly_consistent');
  });

  it("returns 'insufficient' when only non-matching pair claims are present", () => {
    const out = outputWith([
      pairClaim('strongly_consistent', OTHER_PAIR),
      pairClaim('consistent', OTHER_PAIR),
    ]);
    expect(derivePairBand(out, PAIR)).toBe('insufficient');
  });

  it("ignores cluster claims even when the cluster includes the pair's accounts", () => {
    // Two pair claims at 'strongly_consistent' (for a DIFFERENT pair),
    // composed into a cluster at 'consistent'. The pair under
    // analysis (alice, bob) has no direct pair claim, so the row
    // should land at 'insufficient'.
    const out = outputWith([
      pairClaim('strongly_consistent', OTHER_PAIR),
      pairClaim('strongly_consistent', {
        account_a: 'bob',
        account_b: 'carol',
        platform_a: 'twitter',
        platform_b: 'twitter',
      }),
      clusterClaim('consistent', [0, 1]),
    ]);
    expect(derivePairBand(out, PAIR)).toBe('insufficient');
  });

  it("picks the matching pair claim's band when both a matching pair and a cluster are present", () => {
    // Matching pair claim at 'consistent' for (alice, bob). Cluster
    // claim composed of two other pair claims at 'strongly_consistent',
    // yielding cluster band 'consistent'. derivePairBand should pick
    // the matching pair's 'consistent', not influenced by the
    // cluster's 'consistent' band coincidentally matching.
    const out = outputWith([
      pairClaim('consistent', PAIR),
      pairClaim('strongly_consistent', OTHER_PAIR),
      pairClaim('strongly_consistent', {
        account_a: 'bob',
        account_b: 'carol',
        platform_a: 'twitter',
        platform_b: 'twitter',
      }),
      clusterClaim('consistent', [1, 2]),
    ]);
    expect(derivePairBand(out, PAIR)).toBe('consistent');
  });
});

// ---------------------------------------------------------------------------
// seededShuffle
// ---------------------------------------------------------------------------

describe('seededShuffle', () => {
  it('returns an empty array when given an empty input', () => {
    expect(seededShuffle([], 'any-seed')).toEqual([]);
  });

  it('returns a single-element array unchanged regardless of seed', () => {
    expect(seededShuffle(['only'], 'seed-a')).toEqual(['only']);
    expect(seededShuffle(['only'], 'seed-b')).toEqual(['only']);
  });

  it('produces identical output across invocations with the same seed', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const seed = 'fixed-determinism-seed';
    const a = seededShuffle(input, seed);
    const b = seededShuffle(input, seed);
    const c = seededShuffle(input, seed);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('preserves length', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = seededShuffle(input, 'any-seed');
    expect(out).toHaveLength(input.length);
  });

  it('preserves the element set (no additions or losses)', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const out = seededShuffle(input, 'any-seed');
    expect([...out].sort((x, y) => x - y)).toEqual(input);
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3, 4, 5];
    const snapshot = [...input];
    seededShuffle(input, 'seed-x');
    expect(input).toEqual(snapshot);
  });

  it('produces a different ordering for different seeds with sufficient input length', () => {
    // 20 elements give 20! ≈ 2.4×10^18 permutations. The chance two
    // distinct seeds map to identical orderings is astronomically
    // small. If this test flakes on a future hash change, the
    // implementation has regressed to a degenerate distribution.
    const input = Array.from({ length: 20 }, (_, i) => i);
    const a = seededShuffle(input, 'seed-alpha');
    const b = seededShuffle(input, 'seed-beta');
    expect(a).not.toEqual(b);
  });
});
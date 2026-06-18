/**
 * Tests for reasoner/validator.ts.
 *
 * The validator implements the §7.2.2 two-layer validation. These
 * tests cover both layers:
 *
 *   Format layer:
 *     - Output structure (claims is array, alternative_explanations
 *       is array, declined_pairs is array, methodology_metadata
 *       present with required fields)
 *     - Per-claim structure (confidence_band, subject.type, reasoning,
 *       citations)
 *     - Citation references resolve to signals present in the table
 *       (fabricated identifiers are rejected)
 *     - Non-insufficient claims have at least one citation (§7.2.1)
 *     - Non-insufficient claims have at least one alternative
 *       explanation (§7.4.3)
 *     - alternative.claim_index is in range
 *
 *   Cluster composition (§7.3.3):
 *     - Cluster band equals max(0, min(constituent_pair_band) - 1)
 *     - composed_from has at least 2 indices
 *     - All composed_from indices are in range and not self-referential
 *     - All composed_from references must be pair claims (not other clusters)
 *
 *   Content aggregate layer (§7.3.1):
 *     - 'consistent' requires citations from at least 3 distinct categories
 *     - 'strongly_consistent' requires citations from at least 4 distinct categories
 *     - 'strongly_consistent' requires at least one citation from
 *       'stylometric' or 'network'
 *     - 'strongly_consistent' requires predominantly (>=50%) sufficient
 *       confidence flags
 *
 *   Citation directionality:
 *     - Numeric features with 'distance' or 'jsd' in the name fail when
 *       cited with value > 0.5 in support of coordination
 *     - Numeric features with 'similarity' or 'overlap' in the name fail
 *       when cited with value < 0.5 in support of coordination
 *
 * These tests are pure functions of constructed ReasoningOutput +
 * SignalTable inputs. No database, fetch, or env dependency.
 */

import { describe, expect, it } from 'vitest';

import { validateReasoningOutput } from '../../implementation/reasoner/validator';
import type {
  AlternativeExplanation,
  ConfidenceFlag,
  PresentedSignal,
  ReasoningClaim,
  ReasoningOutput,
  SignalId,
  SignalTable,
} from '../../implementation/reasoner/types';
import type { ConfidenceBand, FeatureValue } from '../../implementation/schema/db-types';

// ---------------------------------------------------------------------------
// Builders (keep individual tests tight)
// ---------------------------------------------------------------------------

const PAIR_SUBJECT = {
  type: 'pair' as const,
  account_a: 'alice',
  account_b: 'bob',
  platform_a: 'twitter',
  platform_b: 'twitter',
};

interface SigOpts {
  id: number;
  kind?: 'account' | 'pair';
  category: string;
  name?: string;
  value?: FeatureValue;
  flag?: ConfidenceFlag;
}

function sig(opts: SigOpts): PresentedSignal {
  const kind = opts.kind ?? 'account';
  const scope =
    kind === 'pair'
      ? PAIR_SUBJECT
      : { type: 'account' as const, account: 'alice', platform: 'twitter' };
  return {
    signal_id: `${kind}:${opts.id}` as SignalId,
    category: opts.category,
    feature_name: opts.name ?? `${opts.category}_feature`,
    scope,
    value: opts.value ?? { kind: 'numeric', value: 0.3 },
    confidence_flag: opts.flag ?? 'sufficient',
    provenance_fingerprint: 'deadbeef',
  };
}

function tab(signals: PresentedSignal[]): SignalTable {
  return {
    investigation_id: 'inv_validator_test',
    basis_statements: [],
    signals,
    randomization_seed: 'fixed-seed',
  };
}

function claimWith(
  band: ConfidenceBand,
  citations: string[],
  overrides: Partial<ReasoningClaim> = {}
): ReasoningClaim {
  return {
    subject: PAIR_SUBJECT,
    confidence_band: band,
    citations: citations.map(id => ({ signal_id: id })),
    reasoning: `cites ${citations.join(', ')}`,
    ...overrides,
  };
}

function altFor(claimIndex: number): AlternativeExplanation {
  return {
    claim_index: claimIndex,
    alternative: 'shared_editorial_coordination',
    assessment: 'weighs_against',
    citations: [],
    reasoning: 'no editorial overlap signals present',
  };
}

interface OutputOpts {
  claims: ReasoningClaim[];
  alternatives?: AlternativeExplanation[];
  declined_pairs?: ReasoningOutput['declined_pairs'];
  /** Override or omit fields in methodology_metadata for negative tests. */
  metadataOverride?: Partial<ReasoningOutput['methodology_metadata']>;
  /** Set to true to omit methodology_metadata entirely. */
  omitMetadata?: boolean;
}

function output(opts: OutputOpts): ReasoningOutput {
  const baseMetadata: ReasoningOutput['methodology_metadata'] = {
    model_identifier: 'test-model',
    model_version: 'test-version',
    prompt_version: 'test-prompt',
    randomization_seed: 'fixed-seed',
    run_timestamp: '2026-05-20T21:00:00Z',
  };
  const md = opts.omitMetadata
    ? undefined
    : { ...baseMetadata, ...(opts.metadataOverride ?? {}) };
  return {
    claims: opts.claims,
    alternative_explanations: opts.alternatives ?? [],
    declined_pairs: opts.declined_pairs ?? [],
    methodology_metadata: md as ReasoningOutput['methodology_metadata'],
  };
}

/**
 * Helper: standard three-category signal set used as the baseline for
 * 'consistent' claims (stylometric + temporal + network).
 */
function threeCategorySignals(): PresentedSignal[] {
  return [
    sig({ id: 1, category: 'stylometric' }),
    sig({ id: 2, category: 'temporal' }),
    sig({ id: 3, category: 'network' }),
  ];
}

function fourCategorySignals(): PresentedSignal[] {
  return [
    sig({ id: 1, category: 'stylometric' }),
    sig({ id: 2, category: 'temporal' }),
    sig({ id: 3, category: 'network' }),
    sig({ id: 4, category: 'visual' }),
  ];
}

// ---------------------------------------------------------------------------
// Format layer
// ---------------------------------------------------------------------------

describe('validator: format layer', () => {
  it('passes a well-formed consistent output', () => {
    const signals = threeCategorySignals();
    const claim = claimWith('consistent', ['account:1', 'account:2', 'account:3']);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('passes a minimal insufficient output (no alternatives required)', () => {
    const signals = threeCategorySignals();
    const claim = claimWith('insufficient', []);
    const result = validateReasoningOutput(
      output({ claims: [claim] }),
      tab(signals)
    );
    expect(result.passed).toBe(true);
  });

  it('fails when output.claims is not an array', () => {
    const result = validateReasoningOutput(
      { ...output({ claims: [] }), claims: 'not-an-array' as unknown as ReasoningClaim[] },
      tab([])
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /claims must be an array/.test(f.reason))).toBe(true);
  });

  it('fails when a claim has an invalid confidence_band', () => {
    const signals = threeCategorySignals();
    const claim = {
      ...claimWith('consistent', ['account:1', 'account:2', 'account:3']),
      confidence_band: 'almost_consistent' as unknown as ConfidenceBand,
    };
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /confidence_band must be one of/.test(f.reason))).toBe(true);
  });

  it('fails when claim.reasoning is empty', () => {
    const signals = threeCategorySignals();
    const claim: ReasoningClaim = {
      ...claimWith('consistent', ['account:1', 'account:2', 'account:3']),
      reasoning: '   ', // whitespace only
    };
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /reasoning must be a non-empty string/.test(f.reason))).toBe(true);
  });

  it('fails when a citation signal_id is in the wrong format', () => {
    const signals = threeCategorySignals();
    const claim = claimWith('consistent', ['notvalid:42', 'account:2', 'account:3']);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /not in the expected format/.test(f.reason))).toBe(true);
  });

  it('fails when a citation references a signal not present in the table (fabricated identifier)', () => {
    const signals = threeCategorySignals();
    const claim = claimWith('consistent', ['account:1', 'account:2', 'account:999']);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /fabricated identifier/.test(f.reason))).toBe(true);
  });

  it('fails when a non-insufficient claim has no alternative_explanation (§7.4.3)', () => {
    const signals = threeCategorySignals();
    const claim = claimWith('consistent', ['account:1', 'account:2', 'account:3']);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /§7\.4\.3/.test(f.reason))).toBe(true);
  });

  it('fails when a non-insufficient claim has zero citations (§7.2.1)', () => {
    const signals = threeCategorySignals();
    const claim = claimWith('consistent', []);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /§7\.2\.1/.test(f.reason))).toBe(true);
  });

  it('fails when alternative.claim_index is out of range', () => {
    const signals = threeCategorySignals();
    const claim = claimWith('consistent', ['account:1', 'account:2', 'account:3']);
    const badAlt: AlternativeExplanation = { ...altFor(0), claim_index: 42 };
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [badAlt] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /out of range/.test(f.reason))).toBe(true);
  });

  it('fails when methodology_metadata is missing', () => {
    const signals = threeCategorySignals();
    const claim = claimWith('insufficient', []);
    const result = validateReasoningOutput(
      output({ claims: [claim], omitMetadata: true }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /methodology_metadata is required/.test(f.reason))).toBe(true);
  });

  it('fails when methodology_metadata has empty required field', () => {
    const signals = threeCategorySignals();
    const claim = claimWith('insufficient', []);
    const result = validateReasoningOutput(
      output({ claims: [claim], metadataOverride: { model_identifier: '' } }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /methodology_metadata\.model_identifier must be a non-empty string/.test(f.reason))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Cluster composition (§7.3.3)
// ---------------------------------------------------------------------------

describe('validator: cluster composition (§7.3.3)', () => {
  /**
   * Build a scenario with two strongly_consistent pair claims (indices
   * 0 and 1) and a cluster claim (index 2) composed of them. Caller
   * supplies the cluster's confidence_band to drive each test variant.
   */
  function clusterScenario(
    clusterBand: ConfidenceBand,
    composed_from: number[] = [0, 1]
  ): ReasoningOutput {
    const claim0 = claimWith('strongly_consistent', [
      'account:1', 'account:2', 'account:3', 'account:4',
    ]);
    const claim1 = claimWith('strongly_consistent', [
      'account:1', 'account:2', 'account:3', 'account:4',
    ]);
    const cluster: ReasoningClaim = {
      subject: {
        type: 'cluster',
        accounts: [
          { account: 'alice', platform: 'twitter' },
          { account: 'bob', platform: 'twitter' },
          { account: 'carol', platform: 'twitter' },
        ],
        composed_from,
      },
      confidence_band: clusterBand,
      citations: clusterBand === 'insufficient'
        ? []
        : [{ signal_id: 'account:1' }, { signal_id: 'account:2' }, { signal_id: 'account:3' }, { signal_id: 'account:4' }],
      reasoning: 'composed cluster reasoning',
    };
    return output({
      claims: [claim0, claim1, cluster],
      alternatives: clusterBand === 'insufficient'
        ? [altFor(0), altFor(1)]
        : [altFor(0), altFor(1), altFor(2)],
    });
  }

  it('passes when cluster band equals min(constituent_band) - 1', () => {
    // constituents both 'strongly_consistent' (2), cluster expected 'consistent' (1)
    const o = clusterScenario('consistent');
    const result = validateReasoningOutput(o, tab(fourCategorySignals()));
    expect(result.passed).toBe(true);
  });

  it('fails when cluster band is higher than min(constituent_band) - 1', () => {
    // constituents both 'strongly_consistent' (2), cluster says 'strongly_consistent' (2)
    // expected: 'consistent' (1)
    const o = clusterScenario('strongly_consistent');
    const result = validateReasoningOutput(o, tab(fourCategorySignals()));
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /transitive composition/.test(f.reason))).toBe(true);
  });

  it('fails when cluster band is lower than min(constituent_band) - 1', () => {
    // constituents both 'strongly_consistent' (2), cluster says 'insufficient' (0)
    // expected: 'consistent' (1)
    const o = clusterScenario('insufficient');
    const result = validateReasoningOutput(o, tab(fourCategorySignals()));
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /transitive composition/.test(f.reason))).toBe(true);
  });

  it('fails when composed_from has fewer than 2 indices', () => {
    const o = clusterScenario('consistent', [0]);
    const result = validateReasoningOutput(o, tab(fourCategorySignals()));
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /at least 2 pair-claim indices/.test(f.reason))).toBe(true);
  });

  it('fails when a composed_from index is out of range or self-referential', () => {
    const o = clusterScenario('consistent', [0, 2]);
    // index 2 IS the cluster claim itself
    const result = validateReasoningOutput(o, tab(fourCategorySignals()));
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /out of range or self-referential/.test(f.reason))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Content aggregate layer (§7.3.1)
// ---------------------------------------------------------------------------

describe('validator: content aggregates (§7.3.1)', () => {
  it("fails 'consistent' when citations span fewer than 3 categories", () => {
    // Two stylometric citations only
    const signals = [
      sig({ id: 1, category: 'stylometric' }),
      sig({ id: 2, category: 'stylometric' }),
    ];
    const claim = claimWith('consistent', ['account:1', 'account:2']);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /'consistent' claim has citations from 1/.test(f.reason))).toBe(true);
  });

  it("passes 'consistent' when citations span exactly 3 categories", () => {
    const signals = threeCategorySignals();
    const claim = claimWith('consistent', ['account:1', 'account:2', 'account:3']);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(true);
  });

  it("fails 'strongly_consistent' when citations span fewer than 4 categories", () => {
    const signals = threeCategorySignals(); // only 3 categories
    const claim = claimWith('strongly_consistent', ['account:1', 'account:2', 'account:3']);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /'strongly_consistent' claim has citations from 3/.test(f.reason))).toBe(true);
  });

  it("fails 'strongly_consistent' when categories don't include stylometric or network", () => {
    // 4 categories, none of which are stylometric or network
    const signals = [
      sig({ id: 1, category: 'account_metadata' }),
      sig({ id: 2, category: 'temporal' }),
      sig({ id: 3, category: 'visual' }),
      sig({ id: 4, category: 'metadata_leakage' }),
    ];
    const claim = claimWith('strongly_consistent', [
      'account:1', 'account:2', 'account:3', 'account:4',
    ]);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /must include at least one citation from 'stylometric' or 'network'/.test(f.reason))).toBe(true);
  });

  it("fails 'strongly_consistent' when fewer than 50% of citations have sufficient confidence flags", () => {
    // 4 categories, but 3 of 4 citations are degraded (<= 50%)
    const signals = [
      sig({ id: 1, category: 'stylometric', flag: 'sufficient' }),
      sig({ id: 2, category: 'temporal', flag: 'degraded' }),
      sig({ id: 3, category: 'network', flag: 'degraded' }),
      sig({ id: 4, category: 'visual', flag: 'degraded' }),
    ];
    const claim = claimWith('strongly_consistent', [
      'account:1', 'account:2', 'account:3', 'account:4',
    ]);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(result.failures.some(f => /predominantly sufficient/.test(f.reason))).toBe(true);
  });

  it("passes 'strongly_consistent' with 4 categories, stylometric present, all sufficient flags", () => {
    const signals = fourCategorySignals(); // stylometric, temporal, network, visual; all sufficient
    const claim = claimWith('strongly_consistent', [
      'account:1', 'account:2', 'account:3', 'account:4',
    ]);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Citation directionality
// ---------------------------------------------------------------------------

describe('validator: citation directionality', () => {
  it('fails when a numeric distance or jsd feature is cited above 0.5', () => {
    const signals = [
      sig({
        id: 1,
        category: 'stylometric',
        name: 'jensen_shannon_distance',
        value: { kind: 'numeric', value: 0.8 },
      }),
      sig({ id: 2, category: 'temporal' }),
      sig({ id: 3, category: 'network' }),
    ];
    const claim = claimWith('consistent', ['account:1', 'account:2', 'account:3']);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(
      result.failures.some(f => /high distance\/divergence values weigh against coordination/.test(f.reason))
    ).toBe(true);
  });

  it('fails when a numeric similarity or overlap feature is cited below 0.5', () => {
    const signals = [
      sig({ id: 1, category: 'stylometric' }),
      sig({ id: 2, category: 'temporal' }),
      sig({
        id: 3,
        category: 'network',
        name: 'follower_overlap',
        value: { kind: 'numeric', value: 0.1 },
      }),
    ];
    const claim = claimWith('consistent', ['account:1', 'account:2', 'account:3']);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(false);
    expect(
      result.failures.some(f => /low similarity\/overlap values weigh against coordination/.test(f.reason))
    ).toBe(true);
  });

  it('does not fail when a numeric distance feature is cited below 0.5', () => {
    const signals = [
      sig({
        id: 1,
        category: 'stylometric',
        name: 'jensen_shannon_distance',
        value: { kind: 'numeric', value: 0.2 },
      }),
      sig({ id: 2, category: 'temporal' }),
      sig({ id: 3, category: 'network' }),
    ];
    const claim = claimWith('consistent', ['account:1', 'account:2', 'account:3']);
    const result = validateReasoningOutput(
      output({ claims: [claim], alternatives: [altFor(0)] }),
      tab(signals)
    );
    expect(result.passed).toBe(true);
  });
});

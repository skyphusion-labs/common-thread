import { describe, expect, it } from 'vitest';
import {
  ALL_BANDS,
  bandFromValue,
  bandValue,
  capBandForNonEnglish,
  clusterBandFromPairBands,
} from '../../implementation/reasoner/bands';
import {
  composeInvestigationClusters,
  formatBandSummary,
} from '../../implementation/reasoner/cluster-composition';
import { signalsComparableOnControl } from '../../implementation/reasoner/control-comparison';
import {
  determineInvestigationLanguage,
} from '../../implementation/reasoner/investigation-language';
import { derivePairBand } from '../../implementation/reasoner/runner';
import type { ReasoningOutput } from '../../implementation/reasoner/types';
import { applyPacketRedaction, countBands } from '../../implementation/reporting/redaction';
import { renderMarkdown } from '../../implementation/reporting/evidence-packet-meta';
import { METHODOLOGY_REFERENCE } from '../../implementation/reporting/evidence-packet-meta';

describe('confidence bands (#124)', () => {
  it('caps non-English investigations one band lower (§7.6.5)', () => {
    expect(capBandForNonEnglish('strongly_consistent', true)).toBe('consistent');
    expect(capBandForNonEnglish('consistent', true)).toBe('insufficient');
    expect(capBandForNonEnglish('insufficient', true)).toBe('insufficient');
    expect(capBandForNonEnglish('strongly_consistent', false)).toBe('strongly_consistent');
  });

  it('derives cluster band one below minimum pair band (§7.3.3)', () => {
    expect(
      clusterBandFromPairBands(['strongly_consistent', 'strongly_consistent'])
    ).toBe('consistent');
    expect(clusterBandFromPairBands(['consistent', 'strongly_consistent'])).toBe(
      'insufficient'
    );
  });
});

describe('cluster composition (#122)', () => {
  it('composes transitive clusters from consistent+ target pairs', () => {
    const composition = composeInvestigationClusters(
      [
        {
          id: 1,
          account_a: 'a',
          account_b: 'b',
          platform_a: 'twitter',
          platform_b: 'twitter',
          confidence_band: 'strongly_consistent',
        },
        {
          id: 2,
          account_a: 'b',
          account_b: 'c',
          platform_a: 'twitter',
          platform_b: 'twitter',
          confidence_band: 'strongly_consistent',
        },
      ],
      new Set()
    );

    expect(composition.cluster_claims).toHaveLength(1);
    expect(composition.cluster_claims[0]!.accounts).toHaveLength(3);
    expect(composition.cluster_claims[0]!.confidence_band).toBe('consistent');
  });

  it('excludes control accounts from cluster graph', () => {
    const composition = composeInvestigationClusters(
      [
        {
          id: 1,
          account_a: 'a',
          account_b: 'ctrl',
          platform_a: 'twitter',
          platform_b: 'twitter',
          confidence_band: 'strongly_consistent',
        },
        {
          id: 2,
          account_a: 'b',
          account_b: 'ctrl',
          platform_a: 'twitter',
          platform_b: 'twitter',
          confidence_band: 'strongly_consistent',
        },
      ],
      new Set(['twitter:ctrl'])
    );
    expect(composition.cluster_claims).toHaveLength(0);
  });

  it('formats band summary for investigation packet cover', () => {
    const summary = countBands(['insufficient', 'consistent', 'consistent']);
    expect(formatBandSummary(summary)).toContain('insufficient: 1');
    expect(formatBandSummary(summary)).toContain('consistent: 2');
  });
});

describe('control comparison (#123)', () => {
  it('detects comparable signal strength on controls', () => {
    expect(
      signalsComparableOnControl(
        'follower_overlap_jaccard',
        { kind: 'numeric', value: 0.8 },
        { kind: 'numeric', value: 0.7 }
      )
    ).toBe(true);
    expect(
      signalsComparableOnControl(
        'follower_overlap_jaccard',
        { kind: 'numeric', value: 0.8 },
        { kind: 'numeric', value: 0.2 }
      )
    ).toBe(false);
  });
});

describe('non-English band cap in derivePairBand (#124)', () => {
  const pair = {
    account_a: 'a',
    account_b: 'b',
    platform_a: 'twitter',
    platform_b: 'twitter',
  };

  const output: ReasoningOutput = {
    claims: [
      {
        subject: { type: 'pair', ...pair },
        confidence_band: 'strongly_consistent',
        citations: [],
        reasoning: 'test',
      },
    ],
    alternative_explanations: [],
    declined_pairs: [],
    methodology_metadata: {
      model_identifier: 'test',
      model_version: '1',
      prompt_version: 'reasoning-v1',
      randomization_seed: 'seed',
      run_timestamp: new Date().toISOString(),
    },
  };

  it('leaves band unchanged for English investigations', () => {
    expect(derivePairBand(output, pair)).toBe('strongly_consistent');
  });

  it('caps derived band for non-English investigations', () => {
    const capped = capBandForNonEnglish(derivePairBand(output, pair), true);
    expect(capped).toBe('consistent');
  });
});

describe('packet redaction (#127)', () => {
  const base = {
    format_version: 'evidence-packet-v2' as const,
    scope: 'investigation' as const,
    generated_at: '2026-07-13T00:00:00.000Z',
    investigation_id: 'inv-1',
    attribution_run_id: null,
    cover: {
      investigation_id: 'inv-1',
      practitioner_identity: 'Analyst',
    },
    narrative: {
      pair_runs: [
        {
          pair: {
            account_a: 'alice',
            platform_a: 'twitter',
            account_b: 'ctrl1',
            platform_b: 'twitter',
          },
        },
      ],
    },
    signal_appendix: [],
    manifest_extract: [],
    manifest_signature_status: {
      total_signatures: 0,
      valid_signatures: 0,
      signatures: [],
    },
    methodology_metadata: {},
    methodology_reference: METHODOLOGY_REFERENCE,
  };

  it('pseudonymizes control accounts', () => {
    const { packet } = applyPacketRedaction(base, {
      controlAccounts: [{ account: 'ctrl1', platform: 'twitter' }],
      pseudonymizeControls: true,
    });
    const json = JSON.stringify(packet.narrative);
    expect(json).toContain('control-1');
    expect(json).not.toContain('ctrl1');
    expect(packet.redaction?.entries.length).toBeGreaterThan(0);
  });

  it('renders investigation cover with band summary (#126)', () => {
    const markdown = renderMarkdown({
      ...base,
      cover: {
        ...base.cover,
        investigation_name: 'Test case',
        confidence_band_summary: {
          insufficient: 2,
          consistent: 1,
          strongly_consistent: 0,
        },
        attribution_run_count: 3,
        practitioner_identity: 'Conrad Rockenhaus',
      },
    });
    expect(markdown).toContain('**Practitioner:** Conrad Rockenhaus');
    expect(markdown).toContain('insufficient=2');
    expect(markdown).toContain('investigation-level');
  });
});

describe('investigation language helper (#124)', () => {
  it('exports band ordering constants', () => {
    expect(ALL_BANDS).toEqual(['insufficient', 'consistent', 'strongly_consistent']);
    expect(bandValue('consistent')).toBe(1);
    expect(bandFromValue(2)).toBe('strongly_consistent');
  });

  it('determineInvestigationLanguage is exported for DB integration', () => {
    expect(typeof determineInvestigationLanguage).toBe('function');
  });
});

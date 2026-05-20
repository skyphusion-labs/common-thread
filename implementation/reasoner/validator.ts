/**
 * Reasoning output validator per §7.2.2.
 *
 * Two-layer validation:
 *
 *   Format validation:
 *     - Output structure matches §7.4.2 (top-level keys, claim shape)
 *     - Every citation signal_id is parseable and references a signal
 *       present in the signal_table that was presented to the model
 *     - Every alternative_explanation has a claim_index in range
 *     - Every claim above 'insufficient' has at least one alternative
 *       explanation referencing it (§7.4.3)
 *     - Non-insufficient claims have at least one citation (§7.2.1)
 *     - Cluster claims satisfy the §7.3.3 transitive composition rule
 *       (cluster band is one level below the minimum constituent
 *       pair band)
 *     - methodology_metadata is present with required string fields
 *
 *   Content validation (limited per §7.2.2):
 *     - Per-claim aggregates: 'strongly_consistent' claims have
 *       citations from at least four categories with at least one
 *       from stylometric or network, and predominantly 'sufficient'
 *       confidence flags. 'consistent' claims have citations from
 *       at least three categories.
 *     - Per-citation directionality: numeric features whose name
 *       includes 'distance' or 'jsd' should have low values when
 *       cited in support of coordination; features whose name
 *       includes 'similarity' or 'overlap' should have high values.
 *
 * Adding a new check: append to either CLAIM_AGGREGATE_RULES (for
 * per-claim aggregates) or CITATION_RULES (for per-citation checks).
 * Both rule types return null on pass or a human-readable reason
 * string on fail.
 */

import type { ConfidenceBand } from '../schema/db-types';
import {
  parseSignalId,
  type PresentedSignal,
  type ReasoningClaim,
  type ReasoningOutput,
  type SignalCitation,
  type SignalTable,
  type ValidationFailure,
  type ValidationResult,
} from './types';

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export function validateReasoningOutput(
  output: ReasoningOutput,
  signal_table: SignalTable
): ValidationResult {
  const failures: ValidationFailure[] = [];
  validateFormat(output, signal_table, failures);
  validateContent(output, signal_table, failures);
  return {
    passed: failures.length === 0,
    failures,
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const ALL_BANDS: ConfidenceBand[] = ['insufficient', 'consistent', 'strongly_consistent'];

const BAND_ORDER: Record<ConfidenceBand, number> = {
  insufficient: 0,
  consistent: 1,
  strongly_consistent: 2,
};

function indexSignals(signal_table: SignalTable): Map<string, PresentedSignal> {
  const m = new Map<string, PresentedSignal>();
  for (const s of signal_table.signals) {
    m.set(s.signal_id, s);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Layer 1: Format validation (§7.2.2)
// ---------------------------------------------------------------------------

function validateFormat(
  output: ReasoningOutput,
  signal_table: SignalTable,
  failures: ValidationFailure[]
): void {
  if (!Array.isArray(output.claims)) {
    failures.push({
      layer: 'format',
      reason: 'output.claims must be an array',
    });
    return;
  }

  const signalIndex = indexSignals(signal_table);

  for (let i = 0; i < output.claims.length; i++) {
    validateClaim(output.claims[i], i, signalIndex, failures);
  }

  // Track which claims have at least one alternative_explanation
  // referencing them (§7.4.3).
  const claimsWithAlt = new Set<number>();
  if (Array.isArray(output.alternative_explanations)) {
    for (let i = 0; i < output.alternative_explanations.length; i++) {
      const alt = output.alternative_explanations[i];
      if (typeof alt.claim_index !== 'number'
          || alt.claim_index < 0
          || alt.claim_index >= output.claims.length) {
        failures.push({
          layer: 'format',
          alternative_index: i,
          reason: `alternative_explanations[${i}].claim_index ${alt.claim_index} out of range`,
        });
        continue;
      }
      claimsWithAlt.add(alt.claim_index);

      if (!Array.isArray(alt.citations)) {
        failures.push({
          layer: 'format',
          alternative_index: i,
          reason: 'alternative.citations must be an array',
        });
      } else {
        for (let c = 0; c < alt.citations.length; c++) {
          validateCitation(alt.citations[c], signalIndex, failures, {
            alternative_index: i,
            citation_index: c,
          });
        }
      }
    }
  } else {
    failures.push({
      layer: 'format',
      reason: 'output.alternative_explanations must be an array',
    });
  }

  // §7.4.3: every claim above 'insufficient' requires at least one
  // alternative explanation.
  for (let i = 0; i < output.claims.length; i++) {
    const c = output.claims[i];
    if (c.confidence_band !== 'insufficient' && !claimsWithAlt.has(i)) {
      failures.push({
        layer: 'format',
        claim_index: i,
        reason: `claim[${i}] has confidence_band='${c.confidence_band}' but no alternative_explanation references it (§7.4.3 requires at least one for any claim above insufficient)`,
      });
    }
  }

  // §7.3.3: cluster claims must equal min(constituent_pair_bands) - 1.
  for (let i = 0; i < output.claims.length; i++) {
    const c = output.claims[i];
    if (c.subject && c.subject.type === 'cluster') {
      validateClusterComposition(c, i, output.claims, failures);
    }
  }

  if (!Array.isArray(output.declined_pairs)) {
    failures.push({
      layer: 'format',
      reason: 'output.declined_pairs must be an array',
    });
  }

  if (!output.methodology_metadata) {
    failures.push({
      layer: 'format',
      reason: 'output.methodology_metadata is required',
    });
  } else {
    const required = [
      'model_identifier',
      'model_version',
      'prompt_version',
      'randomization_seed',
      'run_timestamp',
    ] as const;
    for (const field of required) {
      const v = output.methodology_metadata[field];
      if (typeof v !== 'string' || v.length === 0) {
        failures.push({
          layer: 'format',
          reason: `methodology_metadata.${field} must be a non-empty string`,
        });
      }
    }
  }
}

function validateClaim(
  claim: ReasoningClaim,
  claim_index: number,
  signalIndex: Map<string, PresentedSignal>,
  failures: ValidationFailure[]
): void {
  if (!ALL_BANDS.includes(claim.confidence_band as ConfidenceBand)) {
    failures.push({
      layer: 'format',
      claim_index,
      reason: `confidence_band must be one of [${ALL_BANDS.join(', ')}], got '${claim.confidence_band}'`,
    });
  }

  if (!claim.subject
      || (claim.subject.type !== 'pair' && claim.subject.type !== 'cluster')) {
    failures.push({
      layer: 'format',
      claim_index,
      reason: 'claim.subject.type must be "pair" or "cluster"',
    });
  }

  if (typeof claim.reasoning !== 'string' || claim.reasoning.trim().length === 0) {
    failures.push({
      layer: 'format',
      claim_index,
      reason: 'claim.reasoning must be a non-empty string',
    });
  }

  if (!Array.isArray(claim.citations)) {
    failures.push({
      layer: 'format',
      claim_index,
      reason: 'claim.citations must be an array',
    });
    return;
  }
  for (let i = 0; i < claim.citations.length; i++) {
    validateCitation(claim.citations[i], signalIndex, failures, {
      claim_index,
      citation_index: i,
    });
  }

  // §7.2.1: substantive claims require citations.
  if (claim.confidence_band !== 'insufficient' && claim.citations.length === 0) {
    failures.push({
      layer: 'format',
      claim_index,
      reason: `claim[${claim_index}] is '${claim.confidence_band}' but has zero citations (§7.2.1 requires citations for substantive claims)`,
    });
  }
}

function validateCitation(
  citation: SignalCitation,
  signalIndex: Map<string, PresentedSignal>,
  failures: ValidationFailure[],
  location: {
    claim_index?: number;
    alternative_index?: number;
    citation_index: number;
  }
): void {
  if (typeof citation.signal_id !== 'string') {
    failures.push({
      layer: 'format',
      ...location,
      reason: 'citation.signal_id must be a string',
    });
    return;
  }
  const parsed = parseSignalId(citation.signal_id);
  if (!parsed) {
    failures.push({
      layer: 'format',
      ...location,
      reason: `citation.signal_id '${citation.signal_id}' is not in the expected format (account:N | pair:N | event:N)`,
    });
    return;
  }
  if (!signalIndex.has(citation.signal_id)) {
    failures.push({
      layer: 'format',
      ...location,
      reason: `citation.signal_id '${citation.signal_id}' does not appear in the presented signal table (fabricated identifier)`,
    });
  }
}

function validateClusterComposition(
  claim: ReasoningClaim,
  claim_index: number,
  all_claims: ReasoningClaim[],
  failures: ValidationFailure[]
): void {
  if (claim.subject.type !== 'cluster') return;
  const composed_from = claim.subject.composed_from;
  if (!Array.isArray(composed_from) || composed_from.length < 2) {
    failures.push({
      layer: 'format',
      claim_index,
      reason: 'cluster claim must have composed_from with at least 2 pair-claim indices (§7.3.3)',
    });
    return;
  }

  let minBandValue = Number.POSITIVE_INFINITY;
  for (const idx of composed_from) {
    if (idx < 0 || idx >= all_claims.length || idx === claim_index) {
      failures.push({
        layer: 'format',
        claim_index,
        reason: `cluster composed_from index ${idx} is out of range or self-referential`,
      });
      return;
    }
    const ref = all_claims[idx];
    if (ref.subject.type !== 'pair') {
      failures.push({
        layer: 'format',
        claim_index,
        reason: `cluster composed_from[${idx}] must reference a pair claim, got '${ref.subject.type}'`,
      });
      return;
    }
    const v = BAND_ORDER[ref.confidence_band as ConfidenceBand];
    if (typeof v === 'number' && v < minBandValue) minBandValue = v;
  }

  const expectedClusterValue = Math.max(0, minBandValue - 1);
  const actualValue = BAND_ORDER[claim.confidence_band as ConfidenceBand];

  if (actualValue !== expectedClusterValue) {
    failures.push({
      layer: 'format',
      claim_index,
      reason: `cluster band '${claim.confidence_band}' inconsistent with §7.3.3 transitive composition: minimum constituent pair is '${ALL_BANDS[minBandValue]}', cluster must be '${ALL_BANDS[expectedClusterValue]}'`,
    });
  }
}

// ---------------------------------------------------------------------------
// Layer 2: Content validation (§7.2.2; explicitly limited per spec)
// ---------------------------------------------------------------------------

function validateContent(
  output: ReasoningOutput,
  signal_table: SignalTable,
  failures: ValidationFailure[]
): void {
  if (!Array.isArray(output.claims)) return;

  const signalIndex = indexSignals(signal_table);

  for (let ci = 0; ci < output.claims.length; ci++) {
    const claim = output.claims[ci];
    if (!Array.isArray(claim.citations)) continue;
    // Skip 'insufficient' claims: they are declination outputs and do
    // not assert positive coordination.
    if (claim.confidence_band === 'insufficient') continue;

    // Per-claim aggregate checks.
    for (const rule of CLAIM_AGGREGATE_RULES) {
      const fail = rule(claim, ci, signalIndex);
      if (fail) {
        failures.push({
          layer: 'content',
          claim_index: ci,
          reason: fail,
        });
      }
    }

    // Per-citation checks.
    for (let cii = 0; cii < claim.citations.length; cii++) {
      const citation = claim.citations[cii];
      const signal = signalIndex.get(citation.signal_id);
      if (!signal) continue; // format layer already flagged this

      for (const rule of CITATION_RULES) {
        const fail = rule(claim, citation, signal);
        if (fail) {
          failures.push({
            layer: 'content',
            claim_index: ci,
            citation_index: cii,
            reason: fail,
          });
        }
      }
    }
  }
}

type ClaimAggregateRule = (
  claim: ReasoningClaim,
  claim_index: number,
  signalIndex: Map<string, PresentedSignal>
) => string | null;

type CitationRule = (
  claim: ReasoningClaim,
  citation: SignalCitation,
  signal: PresentedSignal
) => string | null;

/**
 * Per-claim aggregate rules. Each returns null on pass or a human-
 * readable failure reason. Aggregates are computed across all
 * citations for the claim.
 */
const CLAIM_AGGREGATE_RULES: ClaimAggregateRule[] = [
  // §7.3.1: strongly_consistent requires signals from at least 4 of
  // the 7 non-excluded categories.
  (claim, _ci, signalIndex) => {
    if (claim.confidence_band !== 'strongly_consistent') return null;
    const cats = new Set<string>();
    for (const c of claim.citations) {
      const s = signalIndex.get(c.signal_id);
      if (s) cats.add(s.category);
    }
    if (cats.size < 4) {
      return `'strongly_consistent' claim has citations from ${cats.size} categor${cats.size === 1 ? 'y' : 'ies'} (${[...cats].join(', ')}); §7.3.1 requires at least 4 of the 7 non-excluded categories`;
    }
    return null;
  },

  // §7.3.1: strongly_consistent must include at least one citation
  // from 'stylometric' or 'network'.
  (claim, _ci, signalIndex) => {
    if (claim.confidence_band !== 'strongly_consistent') return null;
    const cats = new Set<string>();
    for (const c of claim.citations) {
      const s = signalIndex.get(c.signal_id);
      if (s) cats.add(s.category);
    }
    if (!cats.has('stylometric') && !cats.has('network')) {
      return `'strongly_consistent' claim must include at least one citation from 'stylometric' or 'network' (§7.3.1); cited categories: [${[...cats].join(', ')}]`;
    }
    return null;
  },

  // §7.3.1: consistent requires signals from at least 3 of the 7
  // non-excluded categories.
  (claim, _ci, signalIndex) => {
    if (claim.confidence_band !== 'consistent') return null;
    const cats = new Set<string>();
    for (const c of claim.citations) {
      const s = signalIndex.get(c.signal_id);
      if (s) cats.add(s.category);
    }
    if (cats.size < 3) {
      return `'consistent' claim has citations from ${cats.size} categor${cats.size === 1 ? 'y' : 'ies'} (${[...cats].join(', ')}); §7.3.1 requires at least 3 of the 7 non-excluded categories`;
    }
    return null;
  },

  // §7.3.1: strongly_consistent requires predominantly 'sufficient'
  // confidence flags. We interpret "predominantly" as >50%.
  (claim, _ci, signalIndex) => {
    if (claim.confidence_band !== 'strongly_consistent') return null;
    const flags: Array<'sufficient' | 'degraded'> = [];
    for (const c of claim.citations) {
      const s = signalIndex.get(c.signal_id);
      if (s) flags.push(s.confidence_flag);
    }
    if (flags.length === 0) return null;
    const sufficient = flags.filter(f => f === 'sufficient').length;
    const ratio = sufficient / flags.length;
    if (ratio < 0.5) {
      return `'strongly_consistent' claim has ${sufficient}/${flags.length} sufficient-confidence citations (${(ratio * 100).toFixed(0)}%); §7.3.1 requires predominantly sufficient`;
    }
    return null;
  },
];

/**
 * Per-citation directionality rules. Conservative: only flag clear
 * mismatches. Feature names are matched case-insensitively against
 * common patterns; new rules can be added per extractor.
 */
const CITATION_RULES: CitationRule[] = [
  // Numeric feature directionality. Cited in support of coordination,
  // a 'distance' or 'jsd' (Jensen-Shannon divergence) value above 0.5
  // weighs AGAINST coordination, not for it. Conversely, a
  // 'similarity' or 'overlap' value below 0.5 weighs against.
  (claim, _citation, signal) => {
    if (claim.confidence_band === 'insufficient') return null;
    if (signal.value.kind !== 'numeric') return null;
    const v = signal.value.value;
    const name = signal.feature_name.toLowerCase();

    if ((name.includes('distance') || name.includes('jsd')) && v > 0.5) {
      return `claim cites ${signal.signal_id} (${signal.feature_name}=${v}); high distance/divergence values weigh against coordination`;
    }

    if ((name.includes('similarity') || name.includes('overlap')) && v < 0.5) {
      return `claim cites ${signal.signal_id} (${signal.feature_name}=${v}); low similarity/overlap values weigh against coordination`;
    }

    return null;
  },
];

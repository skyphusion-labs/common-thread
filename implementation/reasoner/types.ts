/**
 * Attribution reasoning types.
 *
 * Realizes the §7.4.2 output schema and supporting types for the
 * reasoning layer. Per §3.2.1 and §7.3, the reasoner produces coarse
 * confidence bands (insufficient / consistent / strongly_consistent)
 * rather than numeric probabilities.
 *
 * The types in this file do not impose runtime validation; validation
 * is performed by reasoner/validator.ts per §7.2.2.
 */

import type {
  ConfidenceBand,
  FeatureCategory,
  FeatureValue,
} from '../schema/db-types';

// ---------------------------------------------------------------------------
// Signal identifiers
// ---------------------------------------------------------------------------

/**
 * Stable, prompt-citable identifier for a single signal row. Format:
 *   `account:{account_features.id}`
 *   `pair:{pair_features.id}`
 *   `event:{event_features.id}`
 *
 * The format is intentionally simple so the model can produce
 * identifiers in citation context, and the validator can parse them
 * and look up the corresponding row.
 */
export type SignalId = `account:${number}` | `pair:${number}` | `event:${number}`;

/**
 * Parse a signal identifier into its components. Returns null when
 * the identifier does not match the expected format; the format
 * layer of the validator uses this to detect fabricated identifiers.
 */
export function parseSignalId(id: string):
  | { table: 'account_features' | 'pair_features' | 'event_features'; rowId: number }
  | null {
  const m = /^(account|pair|event):(\d+)$/.exec(id);
  if (!m) return null;
  const prefix = m[1] as 'account' | 'pair' | 'event';
  const table = (
    prefix === 'account' ? 'account_features' :
    prefix === 'pair' ? 'pair_features' :
    'event_features'
  ) as 'account_features' | 'pair_features' | 'event_features';
  return { table, rowId: Number(m[2]) };
}

// ---------------------------------------------------------------------------
// Confidence flag (derived at reasoning time per §6.4.1)
// ---------------------------------------------------------------------------

/**
 * Derived confidence flag per §6.4.1. The schema does not store a
 * confidence column; this flag is computed at presentation time from
 * the originating extractor_run's status and error_message:
 *
 *   - 'sufficient': extractor run completed cleanly (status='completed',
 *     no error_message)
 *   - 'degraded': extractor run was partial, failed, has an
 *     error_message, or no extractor_run_id is recorded
 *
 * The §7.3.1 mapping rules require predominantly 'sufficient' flags
 * for 'strongly_consistent' claims; the validator enforces this.
 */
export type ConfidenceFlag = 'sufficient' | 'degraded';

// ---------------------------------------------------------------------------
// Signal presentation to the model (§7.4.1)
// ---------------------------------------------------------------------------

export type SignalScope =
  | {
      type: 'pair';
      account_a: string;
      account_b: string;
      platform_a: string;
      platform_b: string;
    }
  | {
      type: 'account';
      account: string;
      platform: string;
    };

/**
 * One signal row as presented to the reasoning model. Per §7.4.1
 * the presentation includes identifier, value, confidence flag,
 * and provenance fingerprint.
 */
export interface PresentedSignal {
  signal_id: SignalId;
  category: FeatureCategory | string;
  feature_name: string;
  scope: SignalScope;
  value: FeatureValue;
  confidence_flag: ConfidenceFlag;
  /**
   * Provenance fingerprint: first 8 hex chars of the contributing
   * artifact_hash(es), comma-joined when multiple artifacts
   * contributed. Full hashes available via the provenance tables;
   * the fingerprint is a compact form for the model's context.
   */
  provenance_fingerprint: string;
}

/**
 * The full structured input passed to the reasoning model per §7.4.1.
 * Signal order is randomized; the seed is recorded so a reviewer can
 * reproduce the order if needed.
 */
export interface SignalTable {
  investigation_id: string;
  /** Basis statements from §5.1.1 for each seed account in scope. */
  basis_statements: Array<{
    account: string;
    platform: string;
    statement: string;
  }>;
  /** Optional time bounds from §5.2.1. */
  time_bounds?: { start: string; end: string };
  /** Optional control accounts from §5.1.4. */
  control_accounts?: Array<{ account: string; platform: string }>;
  /**
   * When true, §7.6.5 caps achievable confidence at one band below normal.
   */
  non_english_investigation?: boolean;
  /** Signals in randomized presentation order. */
  signals: PresentedSignal[];
  /** Seed used to produce the signal order. */
  randomization_seed: string;
}

// ---------------------------------------------------------------------------
// Reasoner output (§7.4.2)
// ---------------------------------------------------------------------------

export interface ReasoningOutput {
  claims: ReasoningClaim[];
  alternative_explanations: AlternativeExplanation[];
  declined_pairs: DeclinedPair[];
  methodology_metadata: MethodologyMetadata;
  /** §5.1.4(b): separate control comparison reporting. */
  control_comparisons?: ControlComparison[];
  /** §5.1.4(c): claim indices flagged as unreliable vs controls. */
  unreliable_claim_indices?: number[];
}

/** §5.1.4: target-control signal pattern comparison for a claim. */
export interface ControlComparison {
  claim_index: number;
  control_account: string;
  control_platform: string;
  target_account: string;
  target_platform: string;
  matching_features: Array<{
    feature_name: string;
    target_signal_id: string;
    control_signal_id: string;
    target_value_summary: string;
    control_value_summary: string;
  }>;
}

export type ClaimSubject =
  | {
      type: 'pair';
      account_a: string;
      account_b: string;
      platform_a: string;
      platform_b: string;
    }
  | {
      type: 'cluster';
      accounts: Array<{ account: string; platform: string }>;
      /**
       * Indices in `ReasoningOutput.claims` of the constituent pair
       * claims that compose this cluster. Used to verify the §7.3.3
       * transitive composition rule (cluster band is one level below
       * the minimum constituent pair band).
       */
      composed_from: number[];
    };

/**
 * An attribution claim. Subject is either a single pair or a derived
 * cluster (transitive composition per §7.3.3). Cluster claims are
 * weakened by one band relative to the pair claims they compose.
 */
export interface ReasoningClaim {
  subject: ClaimSubject;
  confidence_band: ConfidenceBand;
  /** Every substantive sub-claim in `reasoning` must be cited (§7.2.1). */
  citations: SignalCitation[];
  /**
   * Free-form narrative of the reasoning. Sub-claims may reference
   * signals inline by their signal_id; the validator confirms each
   * citation in `citations` resolves to a signal in the presented
   * signal table.
   */
  reasoning: string;
}

export interface SignalCitation {
  signal_id: SignalId | string;
  /** Optional brief note on why this signal supports the claim. */
  note?: string;
}

/**
 * An alternative explanation for a claim's signal pattern (§7.4.3).
 * Every claim above 'insufficient' requires at least one alternative
 * explanation in this list referencing it via claim_index.
 */
export interface AlternativeExplanation {
  /** Index into `ReasoningOutput.claims`. */
  claim_index: number;
  /**
   * Standard alternatives per §7.4.3:
   *   - shared_editorial_coordination
   *   - niche_community_membership
   *   - timezone_or_schedule_clustering
   *   - scheduled_posting_tools
   *   - ai_assisted_writing_flattening
   * Plus open-form alternatives the model identifies.
   */
  alternative: string;
  /** How the signals weigh on this alternative. */
  assessment: 'weighs_against' | 'neutral' | 'consistent_with';
  /** Citations supporting the assessment, if any. */
  citations: SignalCitation[];
  /** Brief explanation of the weighing. */
  reasoning: string;
}

export interface DeclinedPair {
  account_a: string;
  account_b: string;
  platform_a: string;
  platform_b: string;
  /** Brief note on why the model declined (§7.4.2). */
  reason: string;
}

export interface MethodologyMetadata {
  /** Provider model identifier, e.g., 'claude-opus-4-7'. */
  model_identifier: string;
  /** Provider-reported model version string. */
  model_version: string;
  /** Prompt version from prompts.ts, e.g., 'reasoning-v1'. */
  prompt_version: string;
  /** Randomization seed used for signal order (§7.4.1). */
  randomization_seed: string;
  /** ISO 8601 UTC run timestamp. */
  run_timestamp: string;
}

// ---------------------------------------------------------------------------
// Triage output (§7.5.2)
// ---------------------------------------------------------------------------

/**
 * Triage verdict per §7.5.2. The triage model is NOT permitted to
 * produce 'consistent' or 'strongly_consistent' claims; its only
 * outputs are the two verdicts below.
 *
 *   - 'obviously_not_coordinated': pair passes to 'insufficient' band
 *     without further reasoning; cost saved.
 *   - 'warrants_further_analysis': pair escalates to the reasoning
 *     model for full §7.4 treatment.
 */
export type TriageVerdict = 'obviously_not_coordinated' | 'warrants_further_analysis';

export interface TriageOutput {
  verdict: TriageVerdict;
  /**
   * Optional brief reason. Triage outputs are not subject to the
   * full citation discipline of §7.2 because they are not surfaced
   * as substantive attribution claims. The reason is informational.
   */
  reason?: string;
  /** Provider/version metadata for the triage call. */
  methodology_metadata: MethodologyMetadata;
}

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

/**
 * A single validation failure raised by validator.ts. The location
 * fields (claim_index, citation_index, alternative_index) are
 * optional and locate the failure for inclusion in the retry prompt
 * (§7.2.3).
 */
export interface ValidationFailure {
  layer: 'format' | 'content';
  claim_index?: number;
  citation_index?: number;
  alternative_index?: number;
  reason: string;
}

export interface ValidationResult {
  passed: boolean;
  failures: ValidationFailure[];
}

// ---------------------------------------------------------------------------
// Run options
// ---------------------------------------------------------------------------

/**
 * Per-run configuration for the attribution reasoner. The runner
 * (reasoner/runner.ts, to be added in a follow-on commit) consumes
 * this; types.ts holds the shape so other modules can construct it.
 */
export interface AttributionRunOptions {
  investigation_id: string;

  /** Optional: restrict to this subset of seed accounts. */
  account_filter?: string[];

  /** Triage model identifier (e.g., 'claude-haiku-4-5'). */
  triage_model: string;

  /** Reasoning model identifier (e.g., 'claude-opus-4-7'). */
  reasoning_model: string;

  /** Prompt versions to use. */
  triage_prompt_version: string;
  reasoning_prompt_version: string;

  /**
   * Maximum retry attempts on validation failure per §7.2.3.
   * Defaults to 3.
   */
  max_retries?: number;

  /**
   * Override the random seed for signal ordering. When omitted a
   * fresh seed is generated and recorded with the run.
   */
  randomization_seed?: string;
}

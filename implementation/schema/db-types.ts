/**
 * TypeScript types matching the Common Thread MySQL schema.
 *
 * Timestamps are ISO 8601 UTC strings. JSON feature values are stored as TEXT.
 * These types do not impose runtime validation; they describe the expected shape.
 */

// ---------------------------------------------------------------------------
// Investigations
// ---------------------------------------------------------------------------

export interface InvestigationRow {
  id: string;
  name: string;
  description: string | null;
  status: 'active' | 'archived' | 'sealed';
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

// ---------------------------------------------------------------------------
// Seed accounts
// ---------------------------------------------------------------------------

export interface SeedAccountRow {
  id: number;
  investigation_id: string;
  platform: string;
  account_identifier: string;
  basis_statement: string;
  added_at: string;
  added_by: string | null;
  removed_at: string | null;
  removed_reason: string | null;
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

/**
 * Signal categories from §4 of the methodology paper.
 * The schema does not enforce this enum at the database level
 * (feature_category is just TEXT), but the application should use
 * these values when inserting.
 */
export type FeatureCategory =
  | 'account_metadata'
  | 'temporal'
  | 'stylometric'
  | 'network'
  | 'visual'
  | 'cross_platform'
  | 'content_artifacts'
  | 'metadata_leakage';

interface FeatureValueColumns {
  feature_value_text: string | null;
  feature_value_numeric: number | null;
  feature_value_json: string | null;
}

export interface AccountFeatureRow extends FeatureValueColumns {
  id: number;
  investigation_id: string;
  platform: string;
  account_identifier: string;
  feature_category: FeatureCategory | string;
  feature_name: string;
  extracted_at: string;
  extractor_name: string;
  extractor_version: string;
  extractor_run_id: number | null;
}

export interface PairFeatureRow extends FeatureValueColumns {
  id: number;
  investigation_id: string;
  /**
   * Platform for account_a. After migration 0002 this is paired with
   * platform_b; for same-platform pairs platform_a === platform_b.
   */
  platform_a: string;
  /**
   * Platform for account_b. After migration 0002 this is paired with
   * platform_a; for same-platform pairs platform_b === platform_a.
   */
  platform_b: string;
  account_a: string;  // canonical: account_a < account_b
  account_b: string;
  feature_category: FeatureCategory | string;
  feature_name: string;
  extracted_at: string;
  extractor_name: string;
  extractor_version: string;
  extractor_run_id: number | null;
}

export interface EventFeatureRow {
  id: number;
  investigation_id: string;
  platform: string;
  account_identifier: string;
  event_timestamp: string;
  event_type: string;
  event_data_json: string | null;
  extracted_at: string;
  extractor_name: string;
  extractor_version: string;
  extractor_run_id: number | null;
}

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

export interface FeatureProvenanceRow {
  id: number;
  /** Foreign key column name varies per provenance table. */
  feature_id: number;
  artifact_hash: string;
  manifest_entry_hash: string | null;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export interface ExtractorRunRow {
  id: number;
  investigation_id: string;
  extractor_name: string;
  extractor_version: string;
  configuration_json: string | null;
  manifest_hash_at_run: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'completed' | 'failed' | 'partial';
  input_artifact_count: number | null;
  output_feature_count: number | null;
  error_message: string | null;
}

/**
 * The three-band confidence scheme from §7.3 of the methodology paper.
 * Numeric probability outputs are explicitly not stored; the methodology
 * commits to coarse confidence bands as the operational output.
 */
export type ConfidenceBand = 'insufficient' | 'consistent' | 'strongly_consistent';

export interface AttributionRunRow {
  id: number;
  investigation_id: string;
  account_a: string;
  account_b: string;
  /** Platform for account_a. Paired with platform_b per migration 0002. */
  platform_a: string;
  /** Platform for account_b. Paired with platform_a per migration 0002. */
  platform_b: string;
  model_name: string;
  model_version: string;
  reasoning_prompt_version: string;
  input_feature_count: number;
  confidence_band: ConfidenceBand;
  output_summary: string;
  output_json: string;
  started_at: string;
  completed_at: string;
  manifest_hash_at_run: string;
}

// ---------------------------------------------------------------------------
// Input types: shapes for writing rows
// ---------------------------------------------------------------------------

/**
 * Discriminated union for writing a feature value. Exactly one variant
 * is valid; the schema's CHECK constraint will reject attempts to set
 * more than one column.
 */
export type FeatureValue =
  | { kind: 'text'; value: string }
  | { kind: 'numeric'; value: number }
  | { kind: 'json'; value: unknown };

export interface NewInvestigation {
  id: string;
  name: string;
  description?: string;
  status?: 'active' | 'archived' | 'sealed';
  metadata?: Record<string, unknown>;
}

export interface NewSeedAccount {
  investigation_id: string;
  platform: string;
  account_identifier: string;
  basis_statement: string;
  added_by?: string;
}

export interface NewAccountFeature {
  investigation_id: string;
  platform: string;
  account_identifier: string;
  feature_category: FeatureCategory | string;
  feature_name: string;
  value: FeatureValue;
  extractor_name: string;
  extractor_version: string;
  extractor_run_id?: number;
  provenance: FeatureProvenance[];
}

export interface NewPairFeature {
  investigation_id: string;
  /** Account names will be canonically ordered before insert. */
  accounts: [string, string];
  /**
   * Platforms paired by index with `accounts` after canonical ordering.
   * platforms[0] corresponds to accounts[0]; platforms[1] to accounts[1].
   * Used to populate platform_a and platform_b on pair_features per
   * migration 0002.
   */
  platforms: [string, string];
  feature_category: FeatureCategory | string;
  feature_name: string;
  value: FeatureValue;
  extractor_name: string;
  extractor_version: string;
  extractor_run_id?: number;
  provenance: FeatureProvenance[];
}

export interface NewEventFeature {
  investigation_id: string;
  platform: string;
  account_identifier: string;
  event_timestamp: string;
  event_type: string;
  event_data?: Record<string, unknown>;
  extractor_name: string;
  extractor_version: string;
  extractor_run_id?: number;
  provenance: FeatureProvenance[];
}

export interface FeatureProvenance {
  artifact_hash: string;
  manifest_entry_hash?: string;
}

export interface NewExtractorRun {
  investigation_id: string;
  extractor_name: string;
  extractor_version: string;
  configuration?: Record<string, unknown>;
  manifest_hash_at_run: string;
}

export interface NewAttributionRun {
  investigation_id: string;
  /** Account names will be canonically ordered before insert. */
  accounts: [string, string];
  /**
   * Platforms paired by index with `accounts` after canonical ordering.
   * platforms[0] corresponds to accounts[0]; platforms[1] to accounts[1].
   * Used to populate platform_a and platform_b on attribution_runs per
   * migration 0002.
   */
  platforms: [string, string];
  model_name: string;
  model_version: string;
  reasoning_prompt_version: string;
  input_feature_count: number;
  confidence_band: ConfidenceBand;
  output_summary: string;
  output: Record<string, unknown>;
  started_at: string;
  completed_at: string;
  manifest_hash_at_run: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Canonical pair ordering: returns [smaller, larger] alphabetically.
 * Use before inserting into pair_features or attribution_runs to satisfy
 * the schema's CHECK (account_a < account_b) constraint.
 */
export function canonicalPair(a: string, b: string): [string, string] {
  if (a === b) {
    throw new Error('Pair features require two distinct accounts');
  }
  return a < b ? [a, b] : [b, a];
}

/**
 * Canonical pair ordering with per-account platforms. Use this when
 * populating pair_features or attribution_runs (platform_a / account_a,
 * platform_b / account_b) after migration 0002.
 *
 * Returns the two records in canonical order by account identifier. The
 * platform field travels with its account, supporting cross-platform
 * pairs (e.g., a Twitter account paired with a Reddit account).
 *
 * Throws if the two accounts share the same identifier. The schema's
 * CHECK (account_a < account_b) constraint orders by account identifier
 * alone, not by (account, platform) tuple, so a same-identifier pair
 * cannot be inserted regardless of platform. See
 * mysql-schema.sql (platform_a / platform_b columns) for the
 * documented limitation.
 */
export function canonicalPlatformedPair(
  left: { account: string; platform: string },
  right: { account: string; platform: string }
): [{ account: string; platform: string }, { account: string; platform: string }] {
  if (left.account === right.account) {
    throw new Error(
      `Pair features require two distinct account identifiers; got '${left.account}' on both sides. ` +
        `Same-identifier-cross-platform pairs are a documented limitation of migration 0002 ` +
        `(see mysql-schema.sql pair_features / attribution_runs platform columns).`
    );
  }
  return left.account < right.account ? [left, right] : [right, left];
}

/**
 * Extract the populated value from a feature row's three feature_value_* columns.
 * Returns the JSON-decoded value if feature_value_json is set.
 */
export function readFeatureValue(
  row: FeatureValueColumns
): { kind: 'text'; value: string } |
   { kind: 'numeric'; value: number } |
   { kind: 'json'; value: unknown } {
  if (row.feature_value_text !== null) {
    return { kind: 'text', value: row.feature_value_text };
  }
  if (row.feature_value_numeric !== null) {
    return { kind: 'numeric', value: row.feature_value_numeric };
  }
  if (row.feature_value_json !== null) {
    return { kind: 'json', value: JSON.parse(row.feature_value_json) };
  }
  throw new Error('Feature row has no populated value column (should be impossible per schema CHECK)');
}

/**
 * Pack a FeatureValue into the three column slots, returning the values
 * to bind in an INSERT. Exactly one element is non-null.
 */
export function packFeatureValue(value: FeatureValue): {
  feature_value_text: string | null;
  feature_value_numeric: number | null;
  feature_value_json: string | null;
} {
  switch (value.kind) {
    case 'text':
      return {
        feature_value_text: value.value,
        feature_value_numeric: null,
        feature_value_json: null,
      };
    case 'numeric':
      return {
        feature_value_text: null,
        feature_value_numeric: value.value,
        feature_value_json: null,
      };
    case 'json':
      return {
        feature_value_text: null,
        feature_value_numeric: null,
        feature_value_json: JSON.stringify(value.value),
      };
  }
}

/**
 * Common Thread extractor types.
 *
 * An extractor is a deterministic function from artifact bytes to
 * feature rows. Given the same input bytes, an extractor produces
 * the same output features. This is the methodology's reproducibility
 * commitment, per §3.4.
 *
 * Extractors are categorized by what they produce:
 *   - AccountFeatureExtractor produces account_features rows
 *   - PairFeatureExtractor   produces pair_features rows (future)
 *   - EventFeatureExtractor  produces event_features rows (future)
 *
 * Only AccountFeatureExtractor is defined in this initial slice.
 * The other two follow the same pattern when they're built out.
 */

import type { ManifestEntry } from '../archive/types';
import type { FeatureCategory, FeatureValue } from '../schema/db-types';

/** Input to an extractor: artifact bytes plus optional metadata hints. */
export interface ExtractorInput {
  /** The raw artifact bytes from the archive. */
  bytes: Uint8Array;

  /** Optional MIME type hint from the manifest entry. */
  mimeType?: string;
}

/**
 * A single feature extracted by an extractor.
 *
 * The runner adds investigation, account, platform, extractor metadata,
 * and provenance fields to produce a full database row.
 */
export interface ExtractedFeature {
  category: FeatureCategory;
  name: string;
  value: FeatureValue;
}

/**
 * An extractor that produces per-account features.
 *
 * The runner reads manifest entries scoped to an investigation, optionally
 * pre-filters via `filterEntry`, reads artifact bytes from the archive,
 * and calls `extract` to produce feature rows for the account named by
 * the manifest entry.
 */
export interface AccountFeatureExtractor {
  /**
   * Unique extractor name (e.g., 'account_metadata_twitter').
   * Stored on every feature row and on the extractor_runs row.
   */
  readonly name: string;

  /**
   * Extractor version (e.g., '1.0.0'). Increment for breaking changes
   * that would produce different output for the same input.
   * Stored on every feature row and on the extractor_runs row.
   */
  readonly version: string;

  /**
   * Optional cheap pre-filter on the manifest entry. Return false to
   * skip reading the artifact bytes for this entry.
   *
   * If not implemented, the runner reads every artifact and relies on
   * `extract` to return an empty array for inapplicable input.
   *
   * Implement this when you can decide applicability from manifest-entry
   * metadata alone (source URL pattern, MIME type, collection tool name).
   */
  filterEntry?(entry: ManifestEntry): boolean;

  /**
   * Extract features from an artifact.
   *
   * Returns an empty array if the artifact doesn't apply to this
   * extractor or is malformed. Should not throw on ordinary input
   * variation; reserve throws for genuinely unexpected inputs.
   *
   * Deterministic: must produce the same output for the same input.
   */
  extract(input: ExtractorInput): ExtractedFeature[];
}

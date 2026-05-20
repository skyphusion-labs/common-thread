/**
 * Common Thread pair extractor types.
 *
 * A pair extractor computes features over a pair of accounts in an
 * investigation. Unlike account extractors (which read artifact bytes
 * and produce account_features rows), pair extractors read pre-computed
 * account features from D1 and produce pair_features rows.
 *
 * Pair extractors are deterministic: given the same inputs (same account
 * feature values and same context), they produce the same outputs. This
 * supports the methodology's reproducibility commitment (§3.4).
 *
 * Most pair extractors live in the 'network', 'stylometric', or
 * 'temporal' categories. The schema's pair_features table allows any
 * feature_category string, but practitioners should map to the §4
 * signal taxonomy.
 */

import type { FeatureValue, FeatureCategory } from '../schema/db-types';
import type { ExtractedFeature } from './types';

/**
 * A map of feature_name → value for a single account.
 * Produced by the runner from D1 query results, passed to the
 * pair extractor's extract() method.
 */
export type AccountFeatureMap = Map<string, FeatureValue>;

/**
 * The reference context for an investigation.
 * Pair extractors that need cross-account statistics (e.g., Burrows'
 * Delta's z-score normalization against the seed set) compute this once
 * via buildContext() and receive it on every pair extract() call.
 *
 * The type is `unknown` because different extractors compute different
 * context shapes. Each extractor casts to its own internal type.
 */
export type PairContext = unknown;

/**
 * A pair feature extractor.
 *
 * The runner is responsible for:
 *   - Loading the required account features from D1 for all seed accounts
 *   - Calling buildContext() once (if defined)
 *   - Calling extract() for each canonical-ordered pair
 *   - Writing pair_features rows with provenance traced from the input
 *     account features back to the originating artifacts
 *
 * The extractor is responsible for:
 *   - Declaring which account features it reads (requiredAccountFeatures)
 *   - Computing pair features deterministically from the inputs
 *   - Returning empty when required features are missing for either account
 */
export interface PairFeatureExtractor {
  /** Unique extractor name (e.g., 'burrows_delta_stylometric'). */
  readonly name: string;

  /** Extractor version. Increment for breaking changes to the math. */
  readonly version: string;

  /** Signal category this extractor's features belong to. */
  readonly category: FeatureCategory;

  /**
   * Names of account features this extractor reads from D1, for both
   * accounts in each pair. The runner fetches exactly these features
   * and passes them as the featuresA and featuresB maps.
   */
  readonly requiredAccountFeatures: ReadonlyArray<string>;

  /**
   * Optional. Compute investigation-wide reference statistics once,
   * using all seed accounts' required features. The result is passed
   * to every extract() call as the context parameter.
   *
   * Implement this when your pair feature needs cross-account
   * statistics (mean, stdev, percentiles, reference vectors).
   *
   * Accounts with missing required features are filtered out by the
   * runner before this method is called.
   */
  buildContext?(
    seedAccounts: ReadonlyArray<{ account: string; features: AccountFeatureMap }>
  ): PairContext;

  /**
   * Compute pair features for a single ordered pair.
   *
   * Preconditions enforced by the runner:
   *   - accountA < accountB (lexicographic, matches schema CHECK constraint)
   *   - Both accounts have all requiredAccountFeatures present in their maps
   *
   * Return an empty array if the computation can't produce meaningful
   * output (e.g., zero-length input vectors, divide-by-zero conditions).
   *
   * Should not throw on ordinary input variation; reserve throws for
   * genuinely unexpected inputs.
   */
  extract(
    accountA: string,
    accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    context?: PairContext
  ): ExtractedFeature[];
}

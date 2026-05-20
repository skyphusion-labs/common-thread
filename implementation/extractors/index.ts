/**
 * Top-level extractor registry.
 *
 * Two parallel hierarchies:
 *
 *   Account-level extractors: read artifact bytes via the account
 *   runner, produce account_features rows. Categories: account_metadata,
 *   temporal, stylometric (and more to come).
 *
 *   Pair-level extractors: read pre-computed account features via the
 *   pair runner, produce pair_features rows. Categories: stylometric
 *   (Burrows' Delta, JSD on character bigrams) and temporal (burst-
 *   overlap) for now; future additions in network, cross-platform, and
 *   more temporal pair extractors (cadence-JSD, quiet-period overlap).
 */

import { ACCOUNT_METADATA_EXTRACTORS } from './account-metadata';
import {
  TEMPORAL_EXTRACTORS,
  TEMPORAL_PAIR_EXTRACTORS,
} from './temporal';
import {
  STYLOMETRIC_EXTRACTORS,
  STYLOMETRIC_PAIR_EXTRACTORS,
} from './stylometric';
import type { AccountFeatureExtractor } from './types';
import type { PairFeatureExtractor } from './pair-types';

// ---------------------------------------------------------------------------
// Account-level
// ---------------------------------------------------------------------------

/** All account-feature extractors across all categories. */
export const ALL_ACCOUNT_EXTRACTORS: AccountFeatureExtractor[] = [
  ...ACCOUNT_METADATA_EXTRACTORS,
  ...TEMPORAL_EXTRACTORS,
  ...STYLOMETRIC_EXTRACTORS,
];

/** Account-level extractors grouped by signal category. */
export const ACCOUNT_EXTRACTORS_BY_CATEGORY = {
  account_metadata: ACCOUNT_METADATA_EXTRACTORS,
  temporal: TEMPORAL_EXTRACTORS,
  stylometric: STYLOMETRIC_EXTRACTORS,
} as const;

// ---------------------------------------------------------------------------
// Pair-level
// ---------------------------------------------------------------------------

/** All pair-feature extractors across all categories. */
export const ALL_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  ...STYLOMETRIC_PAIR_EXTRACTORS,
  ...TEMPORAL_PAIR_EXTRACTORS,
];

/** Pair-level extractors grouped by signal category. */
export const PAIR_EXTRACTORS_BY_CATEGORY = {
  stylometric: STYLOMETRIC_PAIR_EXTRACTORS,
  temporal: TEMPORAL_PAIR_EXTRACTORS,
  // Future: network, cross_platform
} as const;

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { ACCOUNT_METADATA_EXTRACTORS } from './account-metadata';
export { TEMPORAL_EXTRACTORS, TEMPORAL_PAIR_EXTRACTORS } from './temporal';
export { STYLOMETRIC_EXTRACTORS, STYLOMETRIC_PAIR_EXTRACTORS } from './stylometric';

export { runAccountExtractors } from './runner';
export { runPairExtractors } from './pair-runner';

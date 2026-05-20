/**
 * Top-level extractor registry.
 *
 * Combines all category-specific extractor registries into a single
 * exported list, plus exposes them grouped by category for callers
 * that want to run a specific category.
 */

import { ACCOUNT_METADATA_EXTRACTORS } from './account-metadata';
import { TEMPORAL_EXTRACTORS } from './temporal';
import type { AccountFeatureExtractor } from './types';

/** All account-feature extractors across all categories. */
export const ALL_ACCOUNT_EXTRACTORS: AccountFeatureExtractor[] = [
  ...ACCOUNT_METADATA_EXTRACTORS,
  ...TEMPORAL_EXTRACTORS,
];

/** Extractors grouped by signal category. */
export const EXTRACTORS_BY_CATEGORY = {
  account_metadata: ACCOUNT_METADATA_EXTRACTORS,
  temporal: TEMPORAL_EXTRACTORS,
  // Future: stylometric, network, visual, cross_platform,
  // content_artifacts, metadata_leakage
} as const;

export { ACCOUNT_METADATA_EXTRACTORS } from './account-metadata';
export { TEMPORAL_EXTRACTORS } from './temporal';

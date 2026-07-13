/**
 * Top-level extractor registry.
 *
 * v1 signal availability (paper §6.4.6): most extractors populate on
 * default Apify Twitter ingest. Response latency needs metadata_json.triggering_events.
 * Color palette corpora are built on default Twitter ingest (#120).
 * Active with v1 timeline data when ≥2 accounts:
 *   - §4.4.3 co-engagement, §4.4.4 amplification (reply/repost/quote
 *     from timeline artifacts; not likes)
 *
 * Two parallel hierarchies:
 *
 *   Account-level extractors: read artifact bytes via the account
 *   runner, produce account_features rows. Categories:
 *   account_metadata (Twitter, Reddit, Instagram), temporal (Twitter,
 *   Reddit, Instagram), stylometric (Twitter, Reddit, Instagram; paper
 *   §4.3 "linguistic" category), network (Twitter follower/following
 *   lists), visual (image-hash, posted-image-corpus,
 *   exif-corpus, color-palette-corpus), metadata_leakage (Twitter
 *   tweet-timeline source/lang aggregation).
 *
 *   Pair-level extractors: read pre-computed account features via
 *   the pair runner, produce pair_features rows. Categories:
 *     stylometric (Burrows' Delta, JSD on character bigrams)
 *     temporal (burst-overlap, cadence JSD, active-hour JSD,
 *       quiet-period overlap)
 *     cross_platform (handle reuse, bio link overlap, external
 *       link overlap)
 *     network (follower overlap, mutual follow)
 *     visual (profile image, banner image, posted image dHash,
 *       color palette)
 *     metadata_leakage (client app, tweet language, profile lang,
 *       EXIF)
 *
 * Per-category registries live in subdirectory index.ts files. The
 * top-level aggregator imports the sub-arrays by name, so adding
 * new extractors in a subdirectory registry propagates here
 * automatically. When adding a new CATEGORY, update both
 * ACCOUNT_EXTRACTORS_BY_CATEGORY and PAIR_EXTRACTORS_BY_CATEGORY
 * below.
 *
 * Cross-folder pair extractor: ExifOverlapExtractor source lives in
 * extractors/visual/exif-overlap.ts but emits metadata_leakage
 * features and is registered under
 * METADATA_LEAKAGE_PAIR_EXTRACTORS.
 */

import { ACCOUNT_METADATA_EXTRACTORS, ACCOUNT_METADATA_PAIR_EXTRACTORS } from './account-metadata';
import {
  TEMPORAL_EXTRACTORS,
  TEMPORAL_PAIR_EXTRACTORS,
} from './temporal';
import {
  STYLOMETRIC_EXTRACTORS,
  STYLOMETRIC_PAIR_EXTRACTORS,
} from './stylometric';
import {
  CROSS_PLATFORM_PAIR_EXTRACTORS,
} from './cross-platform';
import {
  NETWORK_EXTRACTORS,
  NETWORK_PAIR_EXTRACTORS,
  NETWORK_EVENT_EXTRACTORS,
  NETWORK_ENGAGEMENT_PAIR_EXTRACTORS,
} from './network';
import {
  VISUAL_EXTRACTORS,
  VISUAL_PAIR_EXTRACTORS,
} from './visual';
import {
  METADATA_LEAKAGE_EXTRACTORS,
  METADATA_LEAKAGE_PAIR_EXTRACTORS,
} from './metadata-leakage';
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
  ...NETWORK_EXTRACTORS,
  ...VISUAL_EXTRACTORS,
  ...METADATA_LEAKAGE_EXTRACTORS,
];

/** Account-level extractors grouped by signal category. */
export const ACCOUNT_EXTRACTORS_BY_CATEGORY = {
  account_metadata: ACCOUNT_METADATA_EXTRACTORS,
  temporal: TEMPORAL_EXTRACTORS,
  stylometric: STYLOMETRIC_EXTRACTORS,
  network: NETWORK_EXTRACTORS,
  visual: VISUAL_EXTRACTORS,
  metadata_leakage: METADATA_LEAKAGE_EXTRACTORS,
} as const;

// ---------------------------------------------------------------------------
// Pair-level
// ---------------------------------------------------------------------------

/** All pair-feature extractors across all categories. */
export const ALL_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  ...ACCOUNT_METADATA_PAIR_EXTRACTORS,
  ...STYLOMETRIC_PAIR_EXTRACTORS,
  ...TEMPORAL_PAIR_EXTRACTORS,
  ...CROSS_PLATFORM_PAIR_EXTRACTORS,
  ...NETWORK_PAIR_EXTRACTORS,
  ...VISUAL_PAIR_EXTRACTORS,
  ...METADATA_LEAKAGE_PAIR_EXTRACTORS,
];

/** Engagement event extractors (event_features rows). */
export const ALL_EVENT_EXTRACTORS = [...NETWORK_EVENT_EXTRACTORS];

/** Pair extractors that read event_features (§4.4.3, §4.4.4). */
export const ALL_ENGAGEMENT_PAIR_EXTRACTORS = [...NETWORK_ENGAGEMENT_PAIR_EXTRACTORS];

/** Pair-level extractors grouped by signal category. */
export const PAIR_EXTRACTORS_BY_CATEGORY = {
  account_metadata: ACCOUNT_METADATA_PAIR_EXTRACTORS,
  stylometric: STYLOMETRIC_PAIR_EXTRACTORS,
  temporal: TEMPORAL_PAIR_EXTRACTORS,
  cross_platform: CROSS_PLATFORM_PAIR_EXTRACTORS,
  network: NETWORK_PAIR_EXTRACTORS,
  visual: VISUAL_PAIR_EXTRACTORS,
  metadata_leakage: METADATA_LEAKAGE_PAIR_EXTRACTORS,
} as const;

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { ACCOUNT_METADATA_EXTRACTORS, ACCOUNT_METADATA_PAIR_EXTRACTORS } from './account-metadata';
export { TEMPORAL_EXTRACTORS, TEMPORAL_PAIR_EXTRACTORS } from './temporal';
export { STYLOMETRIC_EXTRACTORS, STYLOMETRIC_PAIR_EXTRACTORS } from './stylometric';
export { CROSS_PLATFORM_PAIR_EXTRACTORS } from './cross-platform';
export { NETWORK_EXTRACTORS, NETWORK_PAIR_EXTRACTORS, NETWORK_EVENT_EXTRACTORS, NETWORK_ENGAGEMENT_PAIR_EXTRACTORS } from './network';
export { VISUAL_EXTRACTORS, VISUAL_PAIR_EXTRACTORS } from './visual';
export { METADATA_LEAKAGE_EXTRACTORS, METADATA_LEAKAGE_PAIR_EXTRACTORS } from './metadata-leakage';

export { runAccountExtractors } from './runner';
export { runPairExtractors } from './pair-runner';
export { runEventExtractors } from './event-runner';
export { runEngagementPairExtractors } from './engagement-pair-runner';

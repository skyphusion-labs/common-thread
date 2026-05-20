/**
 * Cross-platform extractor registry.
 *
 * Pair extractors that compare accounts across or independent of
 * platforms. Per the methodology paper §4.6:
 *
 *   §4.6.1 Handle reuse - handle_reuse_cross_platform
 *   §4.6.2 Bio link patterns - bio_link_overlap_cross_platform
 *   §4.6.3 External link corpus overlap - deferred (requires
 *     account-level URL collection from post content, which the
 *     current stylometric extractors count but do not enumerate)
 *   §4.6.4 Cross-platform timing correlation - already implicitly
 *     supported by the existing temporal pair extractors, since
 *     temporal_twitter v1.3.0 and temporal_reddit v1.0.0 emit the
 *     same feature schema and the pair extractors are platform-
 *     agnostic. No new code needed for §4.6.4.
 *
 * The handle-reuse and bio-link-overlap extractors operate on
 * account_metadata features that both temporal_twitter and
 * temporal_reddit account-metadata extractors already emit:
 *   username (handle-reuse required)
 *   bio (bio-link-overlap required)
 *   url (bio-link-overlap optional; Twitter only)
 *
 * Cross-platform runner note: the pair runner currently hardcodes
 * platform = 'twitter' when writing pair_features rows (see TODO in
 * pair-runner.ts). For pairs that span Twitter and Reddit accounts,
 * this is incorrect at the schema level. The pair extractors here
 * produce correct features regardless; fixing the platform-field
 * handling is a runner-layer concern.
 */

import { HandleReuseExtractor } from './handle-reuse';
import { BioLinkOverlapExtractor } from './bio-link-overlap';
import type { PairFeatureExtractor } from '../pair-types';

export const CROSS_PLATFORM_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new HandleReuseExtractor(),       // §4.6.1
  new BioLinkOverlapExtractor(),    // §4.6.2
  // Future:
  // new ExternalLinkOverlapExtractor(), // §4.6.3, needs account-level URL collection
];

export { HandleReuseExtractor } from './handle-reuse';
export { BioLinkOverlapExtractor } from './bio-link-overlap';

/**
 * Cross-platform extractor registry.
 *
 * Pair extractors that compare accounts across or independent of
 * platforms. Per the methodology paper §4.6:
 *
 *   §4.6.1 Handle reuse - handle_reuse_cross_platform
 *   §4.6.2 Bio link patterns - bio_link_overlap_cross_platform
 *   §4.6.3 External link corpus overlap - external_link_overlap_cross_platform
 *   §4.6.4 Cross-platform timing correlation - already implicitly
 *     supported by the existing temporal pair extractors, since
 *     temporal_twitter v1.3.0 and temporal_reddit v1.0.0 emit the
 *     same feature schema and the pair extractors are platform-
 *     agnostic. No new code needed for §4.6.4.
 *
 * Account-level inputs consumed:
 *   handle-reuse: username (account_metadata)
 *   bio-link-overlap: bio (account_metadata), url (optional, Twitter)
 *   external-link-overlap: posted_urls (content_artifacts per §4.6.3,
 *     emitted by stylometric extractors as a derived per-account URL set)
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
import { ExternalLinkOverlapExtractor } from './external-link-overlap';
import type { PairFeatureExtractor } from '../pair-types';

export const CROSS_PLATFORM_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new HandleReuseExtractor(),         // §4.6.1
  new BioLinkOverlapExtractor(),      // §4.6.2
  new ExternalLinkOverlapExtractor(), // §4.6.3
];

export { HandleReuseExtractor } from './handle-reuse';
export { BioLinkOverlapExtractor } from './bio-link-overlap';
export { ExternalLinkOverlapExtractor } from './external-link-overlap';

/**
 * Temporal extractor registry.
 *
 * Account-level extractors aggregate posting behavior over a timeline
 * artifact and produce per-account temporal features. Pair extractors
 * consume those account features and produce per-pair temporal features
 * (burst-overlap, and in future passes quiet-period correlation and
 * cadence-distribution divergence).
 */

import { TwitterTemporalExtractor } from './twitter';
import { BurstOverlapExtractor } from './burst-correlation';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const TEMPORAL_EXTRACTORS: AccountFeatureExtractor[] = [
  new TwitterTemporalExtractor(),
  // Future:
  // new RedditTemporalExtractor(),
  // new BlueskyTemporalExtractor(),
];

export const TEMPORAL_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new BurstOverlapExtractor(),
  // Future:
  // new CadenceJsdExtractor(),       // §4.2.1 (168-bin hour-dow JSD)
  // new ActiveHourJsdExtractor(),    // §4.2.3 (24-bin hour JSD)
  // new QuietPeriodOverlapExtractor(), // §4.2.4 (silence-period overlap)
];

export { TwitterTemporalExtractor } from './twitter';
export { BurstOverlapExtractor } from './burst-correlation';

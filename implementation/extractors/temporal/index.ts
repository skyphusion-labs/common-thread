/**
 * Temporal extractor registry.
 *
 * Account-level extractors aggregate posting behavior over a timeline
 * artifact and produce per-account temporal features. Pair extractors
 * consume those account features and produce per-pair temporal features
 * (burst-overlap from burst_windows; JSD on the hour-dow joint
 * distribution; JSD on the hour-of-day marginal).
 */

import { TwitterTemporalExtractor } from './twitter';
import { BurstOverlapExtractor } from './burst-correlation';
import { CadenceJsdExtractor } from './cadence-jsd';
import { ActiveHourJsdExtractor } from './active-hour-jsd';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const TEMPORAL_EXTRACTORS: AccountFeatureExtractor[] = [
  new TwitterTemporalExtractor(),
  // Future:
  // new RedditTemporalExtractor(),
  // new BlueskyTemporalExtractor(),
];

export const TEMPORAL_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new BurstOverlapExtractor(),       // §4.2.5 burst-overlap on burst windows
  new CadenceJsdExtractor(),         // §4.2.1 JSD on 168-bin hour-dow joint
  new ActiveHourJsdExtractor(),      // §4.2.3 JSD on 24-bin hour marginal
  // Future:
  // new QuietPeriodOverlapExtractor(), // §4.2.4 silence-period overlap
];

export { TwitterTemporalExtractor } from './twitter';
export { BurstOverlapExtractor } from './burst-correlation';
export { CadenceJsdExtractor } from './cadence-jsd';
export { ActiveHourJsdExtractor } from './active-hour-jsd';
export {
  normalizeDistribution,
  jensenShannonDivergence,
  maxAbsDiffIndex,
} from './jsd';

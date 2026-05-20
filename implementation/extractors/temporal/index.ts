/**
 * Temporal extractor registry.
 *
 * Account-level extractors aggregate posting behavior over a timeline
 * artifact and produce per-account temporal features. Twitter and
 * Reddit extractors emit the same feature names where the platforms
 * support equivalent signals, so pair extractors operate cross-platform
 * without modification. Shared algorithms (burst detection, quiet-
 * period detection, distributional statistics) live in helpers.ts.
 *
 * Pair extractors consume those account features and produce per-pair
 * temporal features: burst-overlap (§4.2.5), cadence JSD on hour-dow
 * joint (§4.2.1), active-hour JSD on hour marginal (§4.2.3), and
 * quiet-period overlap (§4.2.4). Response-latency correlation (§4.2.2)
 * is deferred-by-design because it requires practitioner-supplied
 * triggering events.
 */

import { TwitterTemporalExtractor } from './twitter';
import { RedditTemporalExtractor } from './reddit';
import { BurstOverlapExtractor } from './burst-correlation';
import { CadenceJsdExtractor } from './cadence-jsd';
import { ActiveHourJsdExtractor } from './active-hour-jsd';
import { QuietPeriodOverlapExtractor } from './quiet-period-overlap';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const TEMPORAL_EXTRACTORS: AccountFeatureExtractor[] = [
  new TwitterTemporalExtractor(),
  new RedditTemporalExtractor(),
  // Future:
  // new BlueskyTemporalExtractor(),
  // new MastodonTemporalExtractor(),
];

export const TEMPORAL_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new BurstOverlapExtractor(),       // §4.2.5 burst-overlap on burst windows
  new CadenceJsdExtractor(),         // §4.2.1 JSD on 168-bin hour-dow joint
  new ActiveHourJsdExtractor(),      // §4.2.3 JSD on 24-bin hour marginal
  new QuietPeriodOverlapExtractor(), // §4.2.4 silence-period overlap
];

export { TwitterTemporalExtractor } from './twitter';
export { RedditTemporalExtractor } from './reddit';
export { BurstOverlapExtractor } from './burst-correlation';
export { CadenceJsdExtractor } from './cadence-jsd';
export { ActiveHourJsdExtractor } from './active-hour-jsd';
export { QuietPeriodOverlapExtractor } from './quiet-period-overlap';
export {
  normalizeDistribution,
  jensenShannonDivergence,
  maxAbsDiffIndex,
} from './jsd';
export {
  computeBurstWindows,
  computeQuietPeriods,
  shannonEntropy,
  median,
  utcDayMidnightMs,
  utcDayKey,
  parseTimestamp,
  MS_PER_DAY,
  BURST_BASELINE_DAYS,
  BURST_STDEV_THRESHOLD,
  BURST_MIN_COUNT,
  QUIET_THRESHOLD_MS,
} from './helpers';
export type { BurstWindow, QuietPeriod } from './helpers';

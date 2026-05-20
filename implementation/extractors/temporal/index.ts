/**
 * Temporal extractor registry.
 *
 * Account-level temporal features aggregate posting behavior over a
 * timeline artifact. Future extractors here will cover Reddit comment
 * cadence, Bluesky posting patterns, Mastodon federation timing, etc.
 */

import { TwitterTemporalExtractor } from './twitter';
import type { AccountFeatureExtractor } from '../types';

export const TEMPORAL_EXTRACTORS: AccountFeatureExtractor[] = [
  new TwitterTemporalExtractor(),
  // Future:
  // new RedditTemporalExtractor(),
  // new BlueskyTemporalExtractor(),
];

export { TwitterTemporalExtractor } from './twitter';

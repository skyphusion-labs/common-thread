/**
 * Network extractor registry.
 *
 * Paper §4.4 signal coverage in this directory:
 *
 *   §4.4.1 Follower overlap (Jaccard with community baseline)
 *     - account-level: TwitterNetworkExtractor (emits follower_set,
 *       following_set)
 *     - pair-level: FollowerOverlapExtractor
 *
 *   §4.4.2 Mutual-follow patterns
 *     - pair-level: MutualFollowExtractor
 *     - consumes both follower_set and following_set produced by
 *       TwitterNetworkExtractor; surfaces a per-direction corroboration
 *       score so the attribution reasoner can downweight pairs where
 *       the two evidence sources disagree
 *
 *   §4.4.3 Co-engagement timing on third-party content: NOT YET
 *     IMPLEMENTED. Requires engagement-event data (likes, reposts,
 *     replies WITH TIMESTAMPS on posts the seed accounts did not
 *     author). This is a different collection prerequisite from
 *     follower lists; needs a separate engagement-event archive
 *     type. Queued.
 *
 *   §4.4.4 Cross-account amplification: NOT YET IMPLEMENTED.
 *     Requires engagement-event data showing who-amplifies-whom
 *     among the seed accounts. Different from §4.4.3 in that it
 *     looks at engagement WITHIN the seed set rather than on
 *     third-party content. Queued; shares the engagement-event
 *     collection prerequisite with §4.4.3.
 *
 * Platform parity:
 *
 *   Twitter: TwitterNetworkExtractor implemented. Twitter is the
 *     only major platform exposing public follower lists at meaningful
 *     scale (subject to API tier and scraping access).
 *
 *   Reddit: not implemented. Reddit does not expose follower lists
 *     publicly; the social paradigm is community subscription rather
 *     than account-to-account graph edges. The existing Reddit
 *     account-metadata extractor explicitly notes this. Subreddit
 *     overlap (which subreddits two accounts both post in) is a
 *     reasonable Reddit-native network signal but would live under
 *     a different feature schema (post-distribution rather than
 *     account-graph).
 *
 * Collection-layer prerequisite: the account-level extractor in this
 * directory is a no-op on archives that don't contain follower-list
 * or following-list artifacts. The collection layer (separate from
 * this extraction layer) must emit such artifacts via the scraper
 * workflow. The extractor recognizes list artifacts via manifest
 * entry tool name or source URL; see twitter.ts for the matching
 * heuristic.
 */

import { TwitterNetworkExtractor } from './twitter';
import { FollowerOverlapExtractor } from './follower-overlap';
import { MutualFollowExtractor } from './mutual-follow';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const NETWORK_EXTRACTORS: AccountFeatureExtractor[] = [
  new TwitterNetworkExtractor(),
];

export const NETWORK_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new FollowerOverlapExtractor(), // §4.4.1
  new MutualFollowExtractor(),    // §4.4.2
  // Future:
  // new CoEngagementTimingExtractor(),   // §4.4.3
  // new AmplificationExtractor(),        // §4.4.4
];

export { TwitterNetworkExtractor } from './twitter';
export { FollowerOverlapExtractor } from './follower-overlap';
export { MutualFollowExtractor } from './mutual-follow';

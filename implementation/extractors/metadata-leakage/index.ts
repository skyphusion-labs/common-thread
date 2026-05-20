/**
 * Metadata-leakage extractor registry.
 *
 * Paper §4.7 signal coverage in this directory:
 *
 *   §4.7 Platform-supplied metadata leakage
 *     - account-level: TwitterMetadataLeakageExtractor (emits
 *       client_app_distribution and tweet_language_distribution
 *       from tweet timeline artifacts)
 *     - pair-level: ClientAppOverlapExtractor,
 *       TweetLanguageOverlapExtractor
 *
 * Platform parity:
 *
 *   Twitter: implemented. The 'source' field (client app) and per-
 *     tweet 'lang' field are the canonical metadata-leakage signals.
 *     Twitter removed 'source' from default API responses around
 *     2022; modern scrapers vary in whether they expose it. When
 *     present, it's high-leverage.
 *
 *   Reddit: not implemented. Reddit does not expose per-comment or
 *     per-post client app signatures publicly, and there is no
 *     platform-supplied language metadata at the post level. Reddit
 *     metadata leakage (when it occurs) is mostly through:
 *       - Account creation date timezone hints (already captured in
 *         account-metadata as creation_date)
 *       - Karma timing patterns (better captured under temporal)
 *       - Subreddit selection patterns (post-distribution, would
 *         live under a separate signal category)
 *     None of these need a Reddit-specific metadata-leakage
 *     extractor; they're already covered or out-of-scope.
 *
 * Notable additional §4.7 signals NOT YET IMPLEMENTED:
 *
 *   - Profile lang field (the account-metadata extractor for Twitter
 *     would need to start emitting 'profile_lang' from the 'lang'
 *     field of the user object; small addition to that extractor).
 *
 *   - Default profile / default avatar flags: already emitted by
 *     the existing account-metadata extractor (default_profile,
 *     default_profile_image) but no pair extractor consumes them
 *     yet. A pair extractor that emits agreement-on-default-flags
 *     would be trivial; not implemented because the signal is weak.
 *
 *   - Timezone offset and utc_offset: Twitter deprecated these
 *     years ago. Archives from that era could be mined retroactively
 *     but no scraper produces them today.
 *
 *   - HTTP-header leakage (User-Agent, Accept-Language): would
 *     require collection-layer cooperation to retain headers, which
 *     no current scraper does. Out of scope for v1.0.0.
 */

import { TwitterMetadataLeakageExtractor } from './twitter';
import { ClientAppOverlapExtractor } from './client-app-overlap';
import { TweetLanguageOverlapExtractor } from './language-overlap';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const METADATA_LEAKAGE_EXTRACTORS: AccountFeatureExtractor[] = [
  new TwitterMetadataLeakageExtractor(),
];

export const METADATA_LEAKAGE_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new ClientAppOverlapExtractor(),
  new TweetLanguageOverlapExtractor(),
];

export { TwitterMetadataLeakageExtractor } from './twitter';
export { ClientAppOverlapExtractor } from './client-app-overlap';
export { TweetLanguageOverlapExtractor } from './language-overlap';
export {
  dictJensenShannonDivergence,
  dictKeyJaccard,
  dictKeyIntersection,
  dictKeyUnion,
} from './distribution-jsd';

/**
 * Account-metadata extractor registry.
 *
 * Add new platform-specific extractors here as they're built.
 * The runner uses this list to know which extractors to apply
 * when running the 'account-metadata' category.
 */

import { TwitterAccountMetadataExtractor } from './twitter';
import { RedditAccountMetadataExtractor } from './reddit';
import type { AccountFeatureExtractor } from '../types';

/** All account-metadata extractors, in registration order. */
export const ACCOUNT_METADATA_EXTRACTORS: AccountFeatureExtractor[] = [
  new TwitterAccountMetadataExtractor(),
  new RedditAccountMetadataExtractor(),
  // Future:
  // new BlueskyAccountMetadataExtractor(),
  // new MastodonAccountMetadataExtractor(),
];

export { TwitterAccountMetadataExtractor } from './twitter';
export { RedditAccountMetadataExtractor } from './reddit';

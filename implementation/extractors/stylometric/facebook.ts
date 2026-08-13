/**
 * Facebook stylometric account extractor (§4.3).
 * Public-page authored text only.
 */

import type { AccountFeatureExtractor, ExtractorInput, ExtractedFeature } from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';
import { parseFacebookListingBytes } from '../../ingest/facebook-parser';
import { stylometricFeaturesFromPosts } from './from-authored-posts';

const NAME = 'stylometric_facebook';
const VERSION = '1.0.0';

export class FacebookStylometricExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'facebook');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = parseFacebookListingBytes(input.bytes);
    if (!posts || posts.length === 0) return [];
    return stylometricFeaturesFromPosts(posts);
  }
}

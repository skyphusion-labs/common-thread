/**
 * Mastodon stylometric account extractor (§4.3).
 * Schema-parallel to stylometric_instagram so pair extractors are unchanged.
 */

import type { AccountFeatureExtractor, ExtractorInput, ExtractedFeature } from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';
import { parseMastodonListingBytes } from '../../ingest/mastodon-parser';
import { stylometricFeaturesFromPosts } from './from-authored-posts';

const NAME = 'stylometric_mastodon';
const VERSION = '1.0.0';

export class MastodonStylometricExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'mastodon');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = parseMastodonListingBytes(input.bytes);
    if (!posts || posts.length === 0) return [];
    return stylometricFeaturesFromPosts(posts);
  }
}

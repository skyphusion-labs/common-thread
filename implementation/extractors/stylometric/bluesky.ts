/**
 * Bluesky stylometric account extractor (§4.3).
 * Schema-parallel to stylometric_instagram so pair extractors are unchanged.
 */

import type { AccountFeatureExtractor, ExtractorInput, ExtractedFeature } from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';
import { parseBlueskyListingBytes } from '../../ingest/bluesky-parser';
import { stylometricFeaturesFromPosts } from './from-authored-posts';

const NAME = 'stylometric_bluesky';
const VERSION = '1.0.0';

export class BlueskyStylometricExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'bluesky');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = parseBlueskyListingBytes(input.bytes);
    if (!posts || posts.length === 0) return [];
    return stylometricFeaturesFromPosts(posts);
  }
}

/**
 * TikTok stylometric account extractor (§4.3).
 * Schema-parallel to stylometric_instagram so pair extractors are unchanged.
 */

import type { AccountFeatureExtractor, ExtractorInput, ExtractedFeature } from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';
import { parseTikTokListingBytes } from '../../ingest/tiktok-parser';
import { stylometricFeaturesFromPosts } from './from-authored-posts';

const NAME = 'stylometric_tiktok';
const VERSION = '1.0.0';

export class TikTokStylometricExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'tiktok');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = parseTikTokListingBytes(input.bytes);
    if (!posts || posts.length === 0) return [];
    return stylometricFeaturesFromPosts(posts);
  }
}

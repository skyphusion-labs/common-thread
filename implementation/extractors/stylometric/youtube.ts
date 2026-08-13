/**
 * YouTube stylometric account extractor (§4.3).
 * Text is titles, descriptions, and comments (§6.4.6).
 */

import type { AccountFeatureExtractor, ExtractorInput, ExtractedFeature } from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';
import { parseYouTubeListingBytes } from '../../ingest/youtube-parser';
import { stylometricFeaturesFromPosts } from './from-authored-posts';

const NAME = 'stylometric_youtube';
const VERSION = '1.0.0';

export class YouTubeStylometricExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'youtube');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = parseYouTubeListingBytes(input.bytes);
    if (!posts || posts.length === 0) return [];
    return stylometricFeaturesFromPosts(posts);
  }
}

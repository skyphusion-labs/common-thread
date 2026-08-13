/**
 * YouTube temporal account extractor (§4.2).
 * Comments without a parseable timestamp are skipped.
 */

import type { AccountFeatureExtractor, ExtractorInput, ExtractedFeature } from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';
import { parseTimestamp } from './helpers';
import { parseYouTubeListingBytes } from '../../ingest/youtube-parser';
import { temporalFeaturesFromTimestamps } from './from-timestamps';

const NAME = 'temporal_youtube';
const VERSION = '1.0.0';

export class YouTubeTemporalExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'youtube');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = parseYouTubeListingBytes(input.bytes);
    if (!posts || posts.length === 0) return [];
    const timestamps: number[] = [];
    for (const post of posts) {
      if (!post.createdAt) continue;
      const ts = parseTimestamp(post.createdAt);
      if (ts !== null) timestamps.push(ts);
    }
    return temporalFeaturesFromTimestamps(timestamps);
  }
}

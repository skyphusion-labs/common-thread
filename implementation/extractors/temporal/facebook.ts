/**
 * Facebook temporal account extractor (§4.2).
 * Public-page post timestamps only.
 */

import type { AccountFeatureExtractor, ExtractorInput, ExtractedFeature } from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';
import { parseTimestamp } from './helpers';
import { parseFacebookListingBytes } from '../../ingest/facebook-parser';
import { temporalFeaturesFromTimestamps } from './from-timestamps';

const NAME = 'temporal_facebook';
const VERSION = '1.0.0';

export class FacebookTemporalExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'facebook');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = parseFacebookListingBytes(input.bytes);
    if (!posts || posts.length === 0) return [];
    const timestamps: number[] = [];
    for (const post of posts) {
      const ts = parseTimestamp(post.createdAt);
      if (ts !== null) timestamps.push(ts);
    }
    return temporalFeaturesFromTimestamps(timestamps);
  }
}

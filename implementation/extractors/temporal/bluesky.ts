/**
 * Bluesky temporal account extractor (§4.2).
 * Schema-parallel to temporal_instagram.
 */

import type { AccountFeatureExtractor, ExtractorInput, ExtractedFeature } from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';
import { parseTimestamp } from './helpers';
import { parseBlueskyListingBytes } from '../../ingest/bluesky-parser';
import { temporalFeaturesFromTimestamps } from './from-timestamps';

const NAME = 'temporal_bluesky';
const VERSION = '1.0.0';

export class BlueskyTemporalExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'bluesky');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = parseBlueskyListingBytes(input.bytes);
    if (!posts || posts.length === 0) return [];
    const timestamps: number[] = [];
    for (const post of posts) {
      const ts = parseTimestamp(post.createdAt);
      if (ts !== null) timestamps.push(ts);
    }
    return temporalFeaturesFromTimestamps(timestamps);
  }
}

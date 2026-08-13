/**
 * TikTok temporal account extractor (§4.2).
 * Schema-parallel to temporal_instagram.
 */

import type { AccountFeatureExtractor, ExtractorInput, ExtractedFeature } from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';
import { parseTimestamp } from './helpers';
import { parseTikTokListingBytes } from '../../ingest/tiktok-parser';
import { temporalFeaturesFromTimestamps } from './from-timestamps';

const NAME = 'temporal_tiktok';
const VERSION = '1.0.0';

export class TikTokTemporalExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'tiktok');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = parseTikTokListingBytes(input.bytes);
    if (!posts || posts.length === 0) return [];
    const timestamps: number[] = [];
    for (const post of posts) {
      const ts = parseTimestamp(post.createdAt);
      if (ts !== null) timestamps.push(ts);
    }
    return temporalFeaturesFromTimestamps(timestamps);
  }
}

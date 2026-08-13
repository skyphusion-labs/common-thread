/**
 * Mastodon temporal account extractor (§4.2).
 * Schema-parallel to temporal_instagram.
 */

import type { AccountFeatureExtractor, ExtractorInput, ExtractedFeature } from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';
import { parseTimestamp } from './helpers';
import { parseMastodonListingBytes } from '../../ingest/mastodon-parser';
import { temporalFeaturesFromTimestamps } from './from-timestamps';

const NAME = 'temporal_mastodon';
const VERSION = '1.0.0';

export class MastodonTemporalExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'mastodon');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = parseMastodonListingBytes(input.bytes);
    if (!posts || posts.length === 0) return [];
    const timestamps: number[] = [];
    for (const post of posts) {
      const ts = parseTimestamp(post.createdAt);
      if (ts !== null) timestamps.push(ts);
    }
    return temporalFeaturesFromTimestamps(timestamps);
  }
}

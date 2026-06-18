/**
 * Twitter engagement event extractor.
 *
 * Reads a per-account timeline artifact and emits one event_features row
 * per discrete engagement (reply, repost, quote) for §4.4.3 and §4.4.4.
 *
 * Requires manifest entry.account — the seed account that performed the
 * engagement. Apify ingest archives one timeline per account.
 */

import type { ManifestEntry } from '../../archive/types';
import type { EventFeatureExtractor, ExtractedEvent } from '../event-types';
import type { ExtractorInput } from '../types';
import { extractEngagementsFromPosts, parsePosts } from './engagement-parse';

const NAME = 'engagement_events_twitter';
const VERSION = '1.1.0';

export class TwitterEngagementEventExtractor implements EventFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();

    if (
      tool.includes('timeline') ||
      tool.includes('tweets') ||
      tool.includes('posts') ||
      tool.includes('apify')
    ) {
      return true;
    }
    if (
      source.includes('/timeline') ||
      source.includes('/tweets') ||
      source.includes('apify')
    ) {
      return true;
    }

    if (tool.includes('twitter') || tool.includes('x-com')) return true;
    if (source.includes('twitter.com') || source.includes('x.com')) return true;

    return false;
  }

  extract(input: ExtractorInput): ExtractedEvent[] {
    const account = input.entry.account;
    if (!account) return [];

    const posts = parsePosts(input.bytes);
    if (posts.length === 0) return [];

    return extractEngagementsFromPosts(account, posts);
  }
}

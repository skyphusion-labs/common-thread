/**
 * Event extractor types.
 *
 * Event extractors read artifact bytes and emit one event_features row
 * per discrete engagement (reply, repost, quote, etc.). Pair extractors
 * in the engagement-pair runner aggregate those rows for §4.4.3 and
 * §4.4.4 network signals.
 */

import type { ManifestEntry } from '../archive/types';
import type { FeatureCategory } from '../schema/db-types';
import type { ExtractedFeature, ExtractorInput } from './types';

/** Payload stored in event_features.event_data_json for engagement events. */
export interface EngagementEventData {
  target_post_id: string;
  target_author: string;
  source_post_id: string | null;
  engagement_kind: 'reply' | 'repost' | 'quote';
  /** Canonical grouping key: `${target_author}:${target_post_id}` */
  engagement_target_key: string;
  /** Optional thread root id when exposed by the scraper (record-keeping). */
  conversation_id?: string | null;
  /** ISO 8601 collectedAt of the timeline manifest entry (§6.4.5). */
  collection_window?: string;
}

/** A single event row produced by an event extractor before DB insert. */
export interface ExtractedEvent {
  eventType: string;
  /** ISO 8601 UTC timestamp of the engagement. */
  eventTimestamp: string;
  eventData: Record<string, unknown>;
}

/**
 * Parsed engagement event used by pair extractors (§4.4.3, §4.4.4).
 * Loaded from event_features rows written by engagement event extractors.
 */
export interface EngagementEventRecord {
  account: string;
  platform: string;
  eventFeatureId: number;
  timestampMs: number;
  eventTimestamp: string;
  eventType: 'reply' | 'repost' | 'quote';
  targetPostId: string;
  targetAuthor: string;
  engagementTargetKey: string;
  sourcePostId: string | null;
  conversationId: string | null;
}

export interface EventFeatureExtractor {
  readonly name: string;
  readonly version: string;
  filterEntry?(entry: ManifestEntry): boolean;
  extract(input: ExtractorInput): ExtractedEvent[];
}

export interface EngagementPairFeatureExtractor {
  readonly name: string;
  readonly version: string;
  readonly category: FeatureCategory;
  readonly requiredEventTypes: ReadonlyArray<'reply' | 'repost' | 'quote'>;

  buildContext?(
    seedAccounts: ReadonlyArray<{
      account: string;
      events: EngagementEventRecord[];
      isControl?: boolean;
    }>
  ): unknown;

  extract(
    accountA: string,
    accountB: string,
    eventsA: EngagementEventRecord[],
    eventsB: EngagementEventRecord[],
    context?: unknown
  ): ExtractedFeature[];
}

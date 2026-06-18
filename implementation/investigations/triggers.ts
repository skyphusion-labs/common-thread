/**
 * Practitioner-supplied triggering events (§4.2.2, §5.2).
 *
 * Stored in investigations.metadata_json.triggering_events.
 */

export interface TriggeringEventMatch {
  urls?: string[];
  hashtags?: string[];
  mentions?: string[];
  text_contains?: string[];
}

export interface TriggeringEvent {
  id: string;
  /** ISO 8601 UTC timestamp of the triggering event. */
  timestamp: string;
  label?: string;
  match?: TriggeringEventMatch;
}

export interface TriggerResponseRecord {
  event_id: string;
  latency_ms: number;
  action_type: 'post' | 'reply' | 'repost' | 'quote';
  action_timestamp: string;
}

/**
 * Parse triggering_events from investigation metadata_json.
 */
export function parseTriggeringEvents(metadataJson: string | null): TriggeringEvent[] {
  if (!metadataJson) return [];
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
    const raw = parsed.triggering_events;
    if (!Array.isArray(raw)) return [];
    const out: TriggeringEvent[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const id = obj.id;
      const timestamp = obj.timestamp;
      if (typeof id !== 'string' || typeof timestamp !== 'string') continue;
      const event: TriggeringEvent = { id, timestamp };
      if (typeof obj.label === 'string') event.label = obj.label;
      if (obj.match && typeof obj.match === 'object') {
        event.match = obj.match as TriggeringEventMatch;
      }
      out.push(event);
    }
    return out;
  } catch {
    return [];
  }
}

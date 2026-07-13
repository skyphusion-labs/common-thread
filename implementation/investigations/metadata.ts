/**
 * Investigation metadata_json helpers (§4.2.2, §5.2.1).
 */

import { parseTriggeringEvents, type TriggeringEvent } from './triggers';

export interface InvestigationTimeBounds {
  start: string;
  end: string;
  justification: string;
}

export interface InvestigationMetadata {
  triggering_events?: TriggeringEvent[];
  time_bounds?: InvestigationTimeBounds;
}

export interface InvestigationMetadataPatch {
  triggering_events?: TriggeringEvent[];
  time_bounds?: InvestigationTimeBounds | null;
}

export function parseInvestigationMetadata(metadataJson: string | null): InvestigationMetadata {
  if (!metadataJson) return {};
  try {
    const parsed = JSON.parse(metadataJson) as Record<string, unknown>;
    const out: InvestigationMetadata = {};

    const events = parseTriggeringEvents(metadataJson);
    if (events.length > 0) out.triggering_events = events;

    const tb = parsed.time_bounds;
    if (tb && typeof tb === 'object') {
      const obj = tb as Record<string, unknown>;
      if (
        typeof obj.start === 'string' &&
        typeof obj.end === 'string' &&
        typeof obj.justification === 'string'
      ) {
        out.time_bounds = {
          start: obj.start,
          end: obj.end,
          justification: obj.justification,
        };
      }
    }

    return out;
  } catch {
    return {};
  }
}

export function validateTriggeringEvents(events: unknown): string | null {
  if (!Array.isArray(events)) return 'triggering_events must be an array';
  for (const item of events) {
    if (!item || typeof item !== 'object') return 'each triggering event must be an object';
    const obj = item as Record<string, unknown>;
    if (typeof obj.id !== 'string' || obj.id.length === 0) {
      return 'each triggering event requires a non-empty id';
    }
    if (typeof obj.timestamp !== 'string' || Number.isNaN(Date.parse(obj.timestamp))) {
      return `triggering event ${obj.id}: timestamp must be ISO 8601`;
    }
  }
  return null;
}

export function validateTimeBounds(bounds: unknown): string | null {
  if (!bounds || typeof bounds !== 'object') return 'time_bounds must be an object';
  const obj = bounds as Record<string, unknown>;
  if (typeof obj.start !== 'string' || Number.isNaN(Date.parse(obj.start))) {
    return 'time_bounds.start must be ISO 8601';
  }
  if (typeof obj.end !== 'string' || Number.isNaN(Date.parse(obj.end))) {
    return 'time_bounds.end must be ISO 8601';
  }
  if (typeof obj.justification !== 'string' || obj.justification.trim().length === 0) {
    return 'time_bounds.justification is required (§5.2.1)';
  }
  if (Date.parse(obj.start) > Date.parse(obj.end)) {
    return 'time_bounds.start must be before time_bounds.end';
  }
  return null;
}

export function validateMetadataPatch(patch: unknown): string | null {
  if (!patch || typeof patch !== 'object') return 'metadata patch must be a JSON object';
  const obj = patch as Record<string, unknown>;

  if ('triggering_events' in obj) {
    const err = validateTriggeringEvents(obj.triggering_events);
    if (err) return err;
  }

  if ('time_bounds' in obj && obj.time_bounds !== null) {
    const err = validateTimeBounds(obj.time_bounds);
    if (err) return err;
  }

  return null;
}

export function mergeInvestigationMetadata(
  existingJson: string | null,
  patch: InvestigationMetadataPatch
): InvestigationMetadata {
  const current = parseInvestigationMetadata(existingJson);
  const next: InvestigationMetadata = { ...current };

  if ('triggering_events' in patch) {
    next.triggering_events = patch.triggering_events ?? [];
  }

  if ('time_bounds' in patch) {
    if (patch.time_bounds === null) {
      delete next.time_bounds;
    } else if (patch.time_bounds) {
      next.time_bounds = patch.time_bounds;
    }
  }

  return next;
}

export function serializeInvestigationMetadata(meta: InvestigationMetadata): string {
  const out: Record<string, unknown> = {};
  if (meta.triggering_events && meta.triggering_events.length > 0) {
    out.triggering_events = meta.triggering_events;
  }
  if (meta.time_bounds) {
    out.time_bounds = meta.time_bounds;
  }
  return JSON.stringify(out);
}

/** Public metadata view returned on GET/PATCH (no secrets). */
export function publicMetadataView(metadataJson: string | null): InvestigationMetadata {
  return parseInvestigationMetadata(metadataJson);
}

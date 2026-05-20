/**
 * Twitter temporal account features extractor.
 *
 * Reads a timeline artifact (an array of post objects or a wrapper
 * containing one) and emits account-level temporal features in the
 * 'temporal' category. Single-post artifacts are not handled here;
 * those belong to a future event-feature extractor.
 *
 * Features produced:
 *
 *   Counts and span:
 *     post_count, first_post_date, last_post_date,
 *     active_span_days, active_days_count, active_days_ratio
 *
 *   Hour-of-day (UTC):
 *     posting_hour_distribution (json, 24-element array of ints),
 *     posting_hour_entropy, posting_hour_concentration,
 *     posting_hour_active_count
 *
 *   Day-of-week (UTC, Sunday=0):
 *     posting_dow_distribution (json, 7-element array of ints),
 *     posting_dow_entropy, posting_dow_concentration,
 *     posting_weekend_ratio
 *
 *   Cadence:
 *     median_inter_post_seconds, mean_inter_post_seconds,
 *     posting_burst_factor
 *
 *   Reply behavior:
 *     reply_count_total, reply_ratio
 *
 *   Client apps (where available):
 *     client_app_distribution (json), client_app_count
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';

const NAME = 'temporal_twitter';
const VERSION = '1.0.0';

interface TwitterPost {
  id?: string | number;
  id_str?: string;
  createdAt?: string;
  created_at?: string;
  text?: string;
  full_text?: string;
  source?: string;
  in_reply_to_status_id?: string | number | null;
  in_reply_to_status_id_str?: string | null;
  replyToTweetId?: string | null;
  inReplyToId?: string | null;
}

export class TwitterTemporalExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();

    // Positive hints for timeline / posts artifacts
    if (
      tool.includes('timeline') ||
      tool.includes('tweets') ||
      tool.includes('posts')
    ) {
      return true;
    }
    if (
      source.includes('/timeline') ||
      source.includes('/tweets') ||
      source.includes('/statuses') ||
      source.includes('/user_timeline')
    ) {
      return true;
    }

    // For Twitter-scoped tools that don't otherwise hint posts-vs-profile,
    // let it through and rely on extract() to discriminate.
    if (tool.includes('twitter') || tool.includes('x-com')) return true;
    if (source.includes('twitter.com') || source.includes('x.com')) return true;

    return false;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = tryParseTimeline(input.bytes);
    if (!posts || posts.length === 0) return [];

    // Normalize: gather timestamps, hour buckets, dow buckets, replies, clients.
    const timestamps: number[] = []; // Unix ms
    const hourBuckets = new Array(24).fill(0) as number[];
    const dowBuckets = new Array(7).fill(0) as number[];
    const clientApps = new Map<string, number>();
    let replyCount = 0;

    for (const post of posts) {
      const rawDate = post.createdAt ?? post.created_at;
      if (!rawDate) continue;
      const ts = parseTimestamp(rawDate);
      if (ts === null) continue;

      timestamps.push(ts);
      const d = new Date(ts);
      hourBuckets[d.getUTCHours()]++;
      dowBuckets[d.getUTCDay()]++;

      if (
        post.in_reply_to_status_id ||
        post.in_reply_to_status_id_str ||
        post.replyToTweetId ||
        post.inReplyToId
      ) {
        replyCount++;
      }

      if (typeof post.source === 'string' && post.source.length > 0) {
        const cleaned = cleanClientApp(post.source);
        clientApps.set(cleaned, (clientApps.get(cleaned) ?? 0) + 1);
      }
    }

    if (timestamps.length === 0) return [];

    const features: ExtractedFeature[] = [];
    const cat = 'temporal' as const;
    const total = timestamps.length;

    // Sort timestamps for span and cadence calculations
    timestamps.sort((a, b) => a - b);
    const firstTs = timestamps[0];
    const lastTs = timestamps[timestamps.length - 1];

    features.push({ category: cat, name: 'post_count', value: { kind: 'numeric', value: total } });
    features.push({
      category: cat,
      name: 'first_post_date',
      value: { kind: 'text', value: new Date(firstTs).toISOString() },
    });
    features.push({
      category: cat,
      name: 'last_post_date',
      value: { kind: 'text', value: new Date(lastTs).toISOString() },
    });

    const spanSeconds = (lastTs - firstTs) / 1000;
    const spanDays = spanSeconds / 86400;
    features.push({
      category: cat,
      name: 'active_span_days',
      value: { kind: 'numeric', value: spanDays },
    });

    // Active days: distinct UTC calendar days
    const activeDays = new Set<string>();
    for (const ts of timestamps) {
      const d = new Date(ts);
      activeDays.add(
        `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
      );
    }
    features.push({
      category: cat,
      name: 'active_days_count',
      value: { kind: 'numeric', value: activeDays.size },
    });
    if (spanDays > 0) {
      features.push({
        category: cat,
        name: 'active_days_ratio',
        value: { kind: 'numeric', value: activeDays.size / Math.max(spanDays, 1) },
      });
    }

    // Hour distribution
    features.push({
      category: cat,
      name: 'posting_hour_distribution',
      value: { kind: 'json', value: hourBuckets },
    });
    features.push({
      category: cat,
      name: 'posting_hour_entropy',
      value: { kind: 'numeric', value: shannonEntropy(hourBuckets) },
    });
    features.push({
      category: cat,
      name: 'posting_hour_concentration',
      value: { kind: 'numeric', value: Math.max(...hourBuckets) / total },
    });
    features.push({
      category: cat,
      name: 'posting_hour_active_count',
      value: {
        kind: 'numeric',
        value: hourBuckets.filter(c => c > 0).length,
      },
    });

    // Day-of-week distribution (Sunday=0..Saturday=6)
    features.push({
      category: cat,
      name: 'posting_dow_distribution',
      value: { kind: 'json', value: dowBuckets },
    });
    features.push({
      category: cat,
      name: 'posting_dow_entropy',
      value: { kind: 'numeric', value: shannonEntropy(dowBuckets) },
    });
    features.push({
      category: cat,
      name: 'posting_dow_concentration',
      value: { kind: 'numeric', value: Math.max(...dowBuckets) / total },
    });

    // Weekend ratio: Saturday (6) + Sunday (0) / total
    const weekend = dowBuckets[0] + dowBuckets[6];
    features.push({
      category: cat,
      name: 'posting_weekend_ratio',
      value: { kind: 'numeric', value: weekend / total },
    });

    // Cadence: inter-post intervals
    if (timestamps.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push((timestamps[i] - timestamps[i - 1]) / 1000);
      }
      intervals.sort((a, b) => a - b);

      features.push({
        category: cat,
        name: 'median_inter_post_seconds',
        value: { kind: 'numeric', value: median(intervals) },
      });
      features.push({
        category: cat,
        name: 'mean_inter_post_seconds',
        value: {
          kind: 'numeric',
          value: intervals.reduce((s, x) => s + x, 0) / intervals.length,
        },
      });

      // Burst factor: max hour bucket / median hour bucket (where median > 0)
      const sortedHours = [...hourBuckets].sort((a, b) => a - b);
      const medianHour = median(sortedHours);
      if (medianHour > 0) {
        features.push({
          category: cat,
          name: 'posting_burst_factor',
          value: { kind: 'numeric', value: Math.max(...hourBuckets) / medianHour },
        });
      }
    }

    // Reply behavior
    features.push({
      category: cat,
      name: 'reply_count_total',
      value: { kind: 'numeric', value: replyCount },
    });
    features.push({
      category: cat,
      name: 'reply_ratio',
      value: { kind: 'numeric', value: replyCount / total },
    });

    // Client apps (where present)
    if (clientApps.size > 0) {
      const distribution: Record<string, number> = {};
      for (const [k, v] of clientApps) distribution[k] = v;
      features.push({
        category: cat,
        name: 'client_app_distribution',
        value: { kind: 'json', value: distribution },
      });
      features.push({
        category: cat,
        name: 'client_app_count',
        value: { kind: 'numeric', value: clientApps.size },
      });
    }

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryParseTimeline(bytes: Uint8Array): TwitterPost[] | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed.filter(isPostLike);
    }
    if (parsed && typeof parsed === 'object') {
      // Common wrappers: { tweets: [] }, { posts: [] }, { data: [] }, { statuses: [] }
      for (const key of ['tweets', 'posts', 'statuses', 'data']) {
        const candidate = parsed[key];
        if (Array.isArray(candidate)) {
          return candidate.filter(isPostLike);
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function isPostLike(value: unknown): value is TwitterPost {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return (
    'createdAt' in obj || 'created_at' in obj || 'text' in obj || 'full_text' in obj
  );
}

function parseTimestamp(value: string | number): number | null {
  if (typeof value === 'number') {
    // Could be seconds or milliseconds; heuristic: seconds < 1e12
    return value < 1e12 ? value * 1000 : value;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
  }
  // Twitter classic: "Wed Apr 14 21:43:36 +0000 2021"
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function cleanClientApp(source: string): string {
  // Twitter's source field is typically an anchor tag:
  // '<a href="...">Twitter for iPhone</a>'. Extract the label.
  const m = source.match(/>([^<]+)</);
  return m ? m[1] : source;
}

function shannonEntropy(buckets: number[]): number {
  const total = buckets.reduce((s, x) => s + x, 0);
  if (total === 0) return 0;
  let h = 0;
  for (const c of buckets) {
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

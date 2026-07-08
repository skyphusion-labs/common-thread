/**
 * Reddit temporal account features extractor.
 *
 * Reads a Reddit user listing artifact (submissions and/or comments)
 * and emits account-level temporal features in the 'temporal' category.
 * Reddit's user history is typically delivered as a Listing envelope
 * with children of kind 't3' (submission) and 't1' (comment), or as a
 * flat array of post objects in archival exports.
 *
 * Features produced (parallel to temporal_twitter for cross-platform
 * schema compatibility, with two Reddit-specific additions):
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
 *   Reply behavior (Reddit semantics):
 *     reply_count_total (count of t1 comments; every Reddit comment
 *       is a reply by construction), reply_ratio
 *
 *   Subreddit fingerprint (Reddit-specific, no Twitter analog):
 *     subreddit_distribution (json, { subreddit_name: count }),
 *     subreddit_count
 *
 *     Reddit doesn't expose a client-app field on posts the way Twitter
 *     does, but the subreddits an account frequents are a strong
 *     behavioral fingerprint in their own right. A pair of accounts
 *     that post in the same 30 subreddits with the same approximate
 *     distribution is much more likely to share an operator than a
 *     pair sharing only the few largest subreddits.
 *
 *   Timestamp series and burst characterization:
 *     posting_timestamps_unix_ms (json, sorted array of unix-ms numbers),
 *     burst_windows_2sigma_14day (json, array of burst-window objects)
 *
 *     See helpers.ts for the burst-detection algorithm; the parameters
 *     and feature schema match those used by temporal_twitter so the
 *     burst_overlap_temporal pair extractor works cross-platform.
 *
 *   Joint hour-of-week distribution:
 *     posting_hour_dow_distribution (json, 168-element array of ints)
 *
 *     A 7x24 joint distribution flattened in row-major order: index
 *     dow * 24 + hour. Input to the cadence_jsd_temporal pair extractor.
 *
 *   Quiet periods:
 *     quiet_periods_24hr (json, array of quiet-period objects)
 *
 *     Input to the quiet_period_overlap_temporal pair extractor.
 *
 * Notably absent (correctly): client_app_distribution and
 * client_app_count. Reddit's API does not expose the client application
 * used to make a post. The subreddit_* features are the platform's
 * closest behavioral analog.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';
import {
  computeBurstWindows,
  computeQuietPeriods,
  shannonEntropy,
  median,
  utcDayKey,
  parseTimestamp,
} from './helpers';

const NAME = 'temporal_reddit';
const VERSION = '1.0.0';

interface RedditPostData {
  created_utc?: number;
  subreddit?: string;
  subreddit_name_prefixed?: string;
  parent_id?: string;
  // Submission-specific fields
  title?: string;
  selftext?: string;
  // Comment-specific fields
  body?: string;
}

interface RedditChild {
  kind?: string; // 't1' = comment, 't3' = submission
  data?: RedditPostData;
}

/**
 * Normalized internal representation of a Reddit post or comment after
 * envelope-stripping. The kind field is preserved when known so we can
 * correctly classify replies; isComment is the canonical reply flag
 * after parsing.
 */
interface NormalizedRedditPost {
  createdUtc: number;
  subreddit?: string;
  isComment: boolean;
}

export class RedditTemporalExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'reddit');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = tryParseListing(input.bytes);
    if (!posts || posts.length === 0) return [];

    const timestamps: number[] = []; // Unix ms
    const hourBuckets = new Array(24).fill(0) as number[];
    const dowBuckets = new Array(7).fill(0) as number[];
    const hourDowBuckets = new Array(168).fill(0) as number[]; // dow * 24 + hour
    const subreddits = new Map<string, number>();
    let replyCount = 0;

    for (const post of posts) {
      const ts = parseTimestamp(post.createdUtc);
      if (ts === null) continue;

      timestamps.push(ts);
      const d = new Date(ts);
      const hour = d.getUTCHours();
      const dow = d.getUTCDay();
      hourBuckets[hour]++;
      dowBuckets[dow]++;
      hourDowBuckets[dow * 24 + hour]++;

      if (post.isComment) replyCount++;

      if (post.subreddit) {
        subreddits.set(post.subreddit, (subreddits.get(post.subreddit) ?? 0) + 1);
      }
    }

    if (timestamps.length === 0) return [];

    const features: ExtractedFeature[] = [];
    const cat = 'temporal' as const;
    const total = timestamps.length;

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

    const activeDays = new Set<string>();
    for (const ts of timestamps) activeDays.add(utcDayKey(ts));
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
      value: { kind: 'numeric', value: hourBuckets.filter(c => c > 0).length },
    });

    // Day-of-week distribution
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

    // Reply behavior. On Reddit every t1 (comment) counts as a reply by
    // construction; a comment-only account will have reply_ratio = 1.0.
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

    // Subreddit fingerprint (Reddit-specific; no Twitter analog).
    if (subreddits.size > 0) {
      const distribution: Record<string, number> = {};
      for (const [k, v] of subreddits) distribution[k] = v;
      features.push({
        category: cat,
        name: 'subreddit_distribution',
        value: { kind: 'json', value: distribution },
      });
      features.push({
        category: cat,
        name: 'subreddit_count',
        value: { kind: 'numeric', value: subreddits.size },
      });
    }

    // Timestamp series and burst characterization (shared with Twitter
    // via helpers; feature names match so cross-platform pair extractors
    // work without modification).
    features.push({
      category: cat,
      name: 'posting_timestamps_unix_ms',
      value: { kind: 'json', value: timestamps },
    });

    const burstWindows = computeBurstWindows(timestamps);
    features.push({
      category: cat,
      name: 'burst_windows_2sigma_14day',
      value: { kind: 'json', value: burstWindows },
    });

    features.push({
      category: cat,
      name: 'posting_hour_dow_distribution',
      value: { kind: 'json', value: hourDowBuckets },
    });

    const quietPeriods = computeQuietPeriods(timestamps);
    features.push({
      category: cat,
      name: 'quiet_periods_24hr',
      value: { kind: 'json', value: quietPeriods },
    });

    return features;
  }
}

// ---------------------------------------------------------------------------
// Reddit-specific parsing helpers
// ---------------------------------------------------------------------------

/**
 * Parse a Reddit listing artifact into a flat array of normalized posts.
 *
 * Accepts the following shapes:
 *   - { kind: 'Listing', data: { children: [...] } }
 *   - An array of Listings (Reddit's user/overview endpoint returns
 *     [submissionsListing, commentsListing])
 *   - An array of { kind: 't1' | 't3', data: {...} } items at top level
 *   - A flat array of bare post objects (Pushshift-style exports)
 *
 * Returns null for any shape that doesn't yield at least one parsable
 * post-like object.
 */
function tryParseListing(bytes: Uint8Array): NormalizedRedditPost[] | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    const collected: NormalizedRedditPost[] = [];
    collectFrom(parsed, collected);
    return collected.length > 0 ? collected : null;
  } catch {
    return null;
  }
}

function collectFrom(value: unknown, out: NormalizedRedditPost[]): void {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const item of value) collectFrom(item, out);
    return;
  }

  if (typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;

  // Listing envelope: { kind: 'Listing', data: { children: [...] } }
  if (obj.kind === 'Listing' && obj.data && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>;
    if (Array.isArray(data.children)) {
      for (const child of data.children) collectFrom(child, out);
    }
    return;
  }

  // Wrapped item: { kind: 't1' | 't3', data: {...} }
  if (typeof obj.kind === 'string' && obj.data && typeof obj.data === 'object') {
    const normalized = normalizeItem(obj.kind, obj.data as RedditPostData);
    if (normalized) out.push(normalized);
    return;
  }

  // Bare post object (no envelope). Common in archival exports.
  if (looksLikeBarePost(obj)) {
    const normalized = normalizeItem(inferKind(obj), obj as RedditPostData);
    if (normalized) out.push(normalized);
    return;
  }

  // Wrapper around children (some endpoints use { posts: [...] } style)
  for (const key of ['posts', 'comments', 'submissions', 'children']) {
    const candidate = obj[key];
    if (Array.isArray(candidate)) {
      for (const c of candidate) collectFrom(c, out);
    }
  }
}

function normalizeItem(
  kind: string | undefined,
  data: RedditPostData
): NormalizedRedditPost | null {
  if (typeof data.created_utc !== 'number' || !Number.isFinite(data.created_utc)) {
    return null;
  }

  // Subreddit normalization: prefer the unprefixed name for tighter set
  // dedup ("news" not "r/news"); strip the "r/" prefix when present.
  let subreddit: string | undefined;
  if (typeof data.subreddit === 'string' && data.subreddit.length > 0) {
    subreddit = data.subreddit;
  } else if (
    typeof data.subreddit_name_prefixed === 'string' &&
    data.subreddit_name_prefixed.startsWith('r/')
  ) {
    subreddit = data.subreddit_name_prefixed.slice(2);
  }

  // Reply detection priority: t1 kind beats everything else (Reddit
  // comments are by construction replies). For bare-post artifacts
  // without an explicit kind, fall back to parent_id presence.
  const isComment =
    kind === 't1' ||
    (kind === undefined && typeof data.parent_id === 'string');

  return {
    createdUtc: data.created_utc,
    subreddit,
    isComment,
  };
}

/**
 * Heuristic: an object is post-like if it has a created_utc and at
 * least one of the post-type-discriminating fields. Used for archival
 * exports that strip the kind envelope.
 */
function looksLikeBarePost(obj: Record<string, unknown>): boolean {
  if (typeof obj.created_utc !== 'number') return false;
  return (
    'body' in obj ||      // comment
    'title' in obj ||     // submission
    'selftext' in obj ||  // submission
    'subreddit' in obj ||
    'subreddit_name_prefixed' in obj ||
    'parent_id' in obj
  );
}

/**
 * Infer Reddit kind from bare-post field presence when no kind envelope
 * is available. Comments have body; submissions have title.
 */
function inferKind(obj: Record<string, unknown>): string | undefined {
  if (typeof obj.body === 'string') return 't1';
  if (typeof obj.title === 'string') return 't3';
  if (typeof obj.parent_id === 'string') return 't1';
  return undefined;
}

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
 *
 *   Timestamp series and burst characterization (v1.1.0):
 *     posting_timestamps_unix_ms (json, sorted array of unix-ms numbers),
 *     burst_windows_2sigma_14day (json, array of burst-window objects)
 *
 *     burst_windows_2sigma_14day entries each carry:
 *       { startMs, endMs, peakDailyCount, durationDays }
 *
 *     A burst day is a UTC calendar day d whose post count exceeds the
 *     mean of the 14 prior calendar days by more than two population
 *     standard deviations, with a minimum-floor guard of count(d) >= 3.
 *     Contiguous burst days are merged into windows. Per the paper
 *     §4.2.5 default (2 standard deviations over a 14-day rolling
 *     baseline). The minimum-floor guard prevents pathological bursts
 *     when an account's baseline is near-zero (e.g., the first post
 *     after a 14-day silence would otherwise trigger a 0+0σ burst).
 *
 *     posting_timestamps_unix_ms is the upstream feature that pair
 *     extractors and future event extractors consume; burst_windows is
 *     the derived per-account characterization that the burst-overlap
 *     pair extractor reads. Both are emitted at the account layer so
 *     they appear as separately auditable rows in account_features.
 *
 *   Joint hour-of-week distribution (v1.2.0):
 *     posting_hour_dow_distribution (json, 168-element array of ints)
 *
 *     A 7x24 joint distribution flattened in row-major order: index
 *     dow * 24 + hour, where dow is the UTC day-of-week (Sunday=0)
 *     and hour is the UTC hour-of-day (0..23). The marginals of this
 *     distribution are the existing posting_hour_distribution and
 *     posting_dow_distribution features. The joint distribution is the
 *     input to the cadence_jsd_temporal pair extractor (§4.2.1); it
 *     distinguishes patterns that the marginals collapse, e.g., an
 *     account that posts at 8am weekdays-only versus an account that
 *     posts at 8am weekends-only would look identical on the hour
 *     marginal but different on the joint distribution.
 *
 *   Quiet periods (v1.3.0):
 *     quiet_periods_24hr (json, array of quiet-period objects)
 *
 *     quiet_periods_24hr entries each carry:
 *       { startMs, endMs, durationMs }
 *
 *     A quiet period is the time interval between two consecutive posts
 *     whose gap exceeds 24 hours (the methodology paper §4.2.4 default
 *     threshold). startMs is the timestamp of the last post before the
 *     silence; endMs is the timestamp of the next post after the
 *     silence; durationMs is endMs - startMs. The threshold is encoded
 *     in the feature name so future versions with different thresholds
 *     receive distinct feature names (paralleling the
 *     burst_windows_2sigma_14day convention). Within an account, quiet
 *     periods are necessarily disjoint by construction.
 *
 *     This feature is the input to the quiet_period_overlap_temporal
 *     pair extractor: when a single human operates multiple accounts,
 *     those accounts tend to go silent at the same times (sleep, work
 *     commitments, travel, illness), and quiet-period overlap captures
 *     coordinated absence in a way that complements burst-overlap
 *     (coordinated presence).
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';

const NAME = 'temporal_twitter';
const VERSION = '1.3.0';

const MS_PER_DAY = 86_400_000;
const BURST_BASELINE_DAYS = 14;
const BURST_STDEV_THRESHOLD = 2;
const BURST_MIN_COUNT = 3;
const QUIET_THRESHOLD_MS = 24 * 3600 * 1000;

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

interface BurstWindow {
  startMs: number;
  endMs: number;
  peakDailyCount: number;
  durationDays: number;
}

interface QuietPeriod {
  startMs: number;
  endMs: number;
  durationMs: number;
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
    const hourDowBuckets = new Array(168).fill(0) as number[]; // index = dow * 24 + hour
    const clientApps = new Map<string, number>();
    let replyCount = 0;

    for (const post of posts) {
      const rawDate = post.createdAt ?? post.created_at;
      if (!rawDate) continue;
      const ts = parseTimestamp(rawDate);
      if (ts === null) continue;

      timestamps.push(ts);
      const d = new Date(ts);
      const hour = d.getUTCHours();
      const dow = d.getUTCDay();
      hourBuckets[hour]++;
      dowBuckets[dow]++;
      hourDowBuckets[dow * 24 + hour]++;

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
      activeDays.add(utcDayKey(ts));
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

    // -----------------------------------------------------------------
    // v1.1.0 additions: timestamp series and burst-window characterization
    // -----------------------------------------------------------------

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

    // -----------------------------------------------------------------
    // v1.2.0 addition: joint hour-of-week distribution (24h x 7DOW = 168 bins)
    // -----------------------------------------------------------------

    features.push({
      category: cat,
      name: 'posting_hour_dow_distribution',
      value: { kind: 'json', value: hourDowBuckets },
    });

    // -----------------------------------------------------------------
    // v1.3.0 addition: quiet periods at 24-hour threshold
    // -----------------------------------------------------------------

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
// Burst-window detection
// ---------------------------------------------------------------------------

/**
 * Detect burst windows using a 2-stdev / 14-day-rolling-baseline rule with a
 * minimum-count floor of 3. The algorithm:
 *
 *   1. Bucket the sorted timestamps into UTC calendar days. For each day with
 *      activity, record (dayMidnightMs, postCount).
 *   2. Walk forward from the first day with at least BURST_BASELINE_DAYS
 *      prior calendar days of activity span. For each candidate day d,
 *      compute the mean and population stdev of post counts over the
 *      14 calendar days immediately preceding d (treating absent days as
 *      zero, so the baseline reflects true daily-rate not active-day-rate).
 *   3. Day d is a burst day iff count(d) > mean + 2*stdev AND count(d) >= 3.
 *   4. Group contiguous burst days into windows; each window spans from the
 *      midnight UTC of the first burst day to one millisecond before the
 *      midnight UTC of the day after the last burst day in the run.
 *
 * Returns an empty array if the timestamp span is shorter than
 * BURST_BASELINE_DAYS + 1 (no day has a valid baseline).
 */
function computeBurstWindows(sortedTimestampsMs: number[]): BurstWindow[] {
  if (sortedTimestampsMs.length === 0) return [];

  const firstDayMs = utcDayMidnightMs(sortedTimestampsMs[0]);
  const lastDayMs = utcDayMidnightMs(sortedTimestampsMs[sortedTimestampsMs.length - 1]);
  const totalDays = (lastDayMs - firstDayMs) / MS_PER_DAY + 1;

  if (totalDays < BURST_BASELINE_DAYS + 1) return [];

  // Bucket posts by UTC calendar day. The array index is days-since-firstDay.
  const dailyCounts = new Array<number>(Math.round(totalDays)).fill(0);
  for (const ts of sortedTimestampsMs) {
    const idx = Math.round((utcDayMidnightMs(ts) - firstDayMs) / MS_PER_DAY);
    if (idx >= 0 && idx < dailyCounts.length) dailyCounts[idx]++;
  }

  const burstDayFlags = new Array<boolean>(dailyCounts.length).fill(false);

  for (let d = BURST_BASELINE_DAYS; d < dailyCounts.length; d++) {
    let sum = 0;
    for (let i = d - BURST_BASELINE_DAYS; i < d; i++) sum += dailyCounts[i];
    const mean = sum / BURST_BASELINE_DAYS;

    let sumSq = 0;
    for (let i = d - BURST_BASELINE_DAYS; i < d; i++) {
      const diff = dailyCounts[i] - mean;
      sumSq += diff * diff;
    }
    const stdev = Math.sqrt(sumSq / BURST_BASELINE_DAYS);

    const threshold = mean + BURST_STDEV_THRESHOLD * stdev;
    if (dailyCounts[d] > threshold && dailyCounts[d] >= BURST_MIN_COUNT) {
      burstDayFlags[d] = true;
    }
  }

  // Group contiguous burst days into windows.
  const windows: BurstWindow[] = [];
  let runStart = -1;
  let runPeak = 0;

  for (let d = 0; d < burstDayFlags.length; d++) {
    if (burstDayFlags[d]) {
      if (runStart === -1) {
        runStart = d;
        runPeak = dailyCounts[d];
      } else {
        if (dailyCounts[d] > runPeak) runPeak = dailyCounts[d];
      }
    } else if (runStart !== -1) {
      const startMs = firstDayMs + runStart * MS_PER_DAY;
      const endMs = firstDayMs + d * MS_PER_DAY - 1; // last ms of the prior day
      windows.push({
        startMs,
        endMs,
        peakDailyCount: runPeak,
        durationDays: d - runStart,
      });
      runStart = -1;
      runPeak = 0;
    }
  }

  // Close any window still open at end-of-series
  if (runStart !== -1) {
    const startMs = firstDayMs + runStart * MS_PER_DAY;
    const endMs = firstDayMs + burstDayFlags.length * MS_PER_DAY - 1;
    windows.push({
      startMs,
      endMs,
      peakDailyCount: runPeak,
      durationDays: burstDayFlags.length - runStart,
    });
  }

  return windows;
}

// ---------------------------------------------------------------------------
// Quiet-period detection
// ---------------------------------------------------------------------------

/**
 * Detect quiet periods using a fixed 24-hour gap threshold. The algorithm
 * walks consecutive timestamps in the sorted series; for each pair whose
 * gap exceeds QUIET_THRESHOLD_MS, emit a quiet period spanning the gap.
 *
 * Within an account, quiet periods are necessarily disjoint by construction
 * (each period sits between two specific posts; the next period starts at
 * the second of those posts or later).
 *
 * Returns an empty array if the timestamp series has fewer than 2 posts
 * (no consecutive pair to gap-check).
 */
function computeQuietPeriods(sortedTimestampsMs: number[]): QuietPeriod[] {
  if (sortedTimestampsMs.length < 2) return [];
  const periods: QuietPeriod[] = [];
  for (let i = 1; i < sortedTimestampsMs.length; i++) {
    const start = sortedTimestampsMs[i - 1];
    const end = sortedTimestampsMs[i];
    const duration = end - start;
    if (duration > QUIET_THRESHOLD_MS) {
      periods.push({ startMs: start, endMs: end, durationMs: duration });
    }
  }
  return periods;
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

function utcDayMidnightMs(unixMs: number): number {
  const d = new Date(unixMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function utcDayKey(unixMs: number): string {
  const d = new Date(unixMs);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

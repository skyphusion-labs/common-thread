/**
 * Shared temporal helpers.
 *
 * Algorithms used by both the Twitter and Reddit account-level temporal
 * extractors. The math is platform-agnostic: given a sorted array of
 * unix-millisecond timestamps and the per-post hour and day-of-week
 * bucket counts, the helpers compute burst windows, quiet periods,
 * distributional statistics, and timestamp parsing.
 *
 * Platform-specific parsing (artifact format dispatch, reply detection,
 * source/subreddit aggregation) stays in the per-platform extractor
 * files. Only the math and the rate-limit constants live here.
 *
 * Determinism: per the methodology paper §6.1, all functions in this
 * module are pure functions of their inputs. No randomness, no clock
 * access, no I/O.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MS_PER_DAY = 86_400_000;
export const BURST_BASELINE_DAYS = 14;
export const BURST_STDEV_THRESHOLD = 2;
export const BURST_MIN_COUNT = 3;
export const QUIET_THRESHOLD_MS = 24 * 3600 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BurstWindow {
  startMs: number;
  endMs: number;
  peakDailyCount: number;
  durationDays: number;
}

export interface QuietPeriod {
  startMs: number;
  endMs: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Burst-window detection
// ---------------------------------------------------------------------------

/**
 * Detect burst windows using a 2-stdev / 14-day-rolling-baseline rule
 * with a minimum-count floor of 3. The algorithm:
 *
 *   1. Bucket the sorted timestamps into UTC calendar days. For each
 *      day with activity, record (dayMidnightMs, postCount).
 *   2. Walk forward from the first day with at least
 *      BURST_BASELINE_DAYS prior calendar days of activity span. For
 *      each candidate day d, compute the mean and population stdev of
 *      post counts over the 14 calendar days immediately preceding d
 *      (treating absent days as zero, so the baseline reflects true
 *      daily-rate not active-day-rate).
 *   3. Day d is a burst day iff
 *        count(d) > mean + 2*stdev AND count(d) >= 3.
 *   4. Group contiguous burst days into windows; each window spans
 *      from the midnight UTC of the first burst day to one
 *      millisecond before the midnight UTC of the day after the last
 *      burst day in the run.
 *
 * Returns an empty array if the timestamp span is shorter than
 * BURST_BASELINE_DAYS + 1 (no day has a valid baseline).
 */
export function computeBurstWindows(sortedTimestampsMs: number[]): BurstWindow[] {
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
 * Detect quiet periods using a fixed 24-hour gap threshold. The
 * algorithm walks consecutive timestamps in the sorted series; for
 * each pair whose gap exceeds QUIET_THRESHOLD_MS, emit a quiet period
 * spanning the gap.
 *
 * Within an account, quiet periods are necessarily disjoint by
 * construction (each period sits between two specific posts; the next
 * period starts at the second of those posts or later).
 *
 * Returns an empty array if the timestamp series has fewer than 2
 * posts (no consecutive pair to gap-check).
 */
export function computeQuietPeriods(sortedTimestampsMs: number[]): QuietPeriod[] {
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
// Distribution and time math
// ---------------------------------------------------------------------------

/**
 * Shannon entropy of a count distribution, computed in base 2. Returns
 * 0 for the all-zero distribution. The maximum value for a length-N
 * distribution is log2(N) (uniform); for the 24-hour distribution that
 * is log2(24) ≈ 4.585.
 */
export function shannonEntropy(buckets: number[]): number {
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

/**
 * Median of an already-sorted numeric array. Returns 0 for an empty
 * array (rather than NaN) so callers don't have to special-case it.
 */
export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * UTC midnight in milliseconds for the calendar day containing the
 * given Unix-ms timestamp.
 */
export function utcDayMidnightMs(unixMs: number): number {
  const d = new Date(unixMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * A short string key identifying a UTC calendar day, suitable for Set
 * deduplication. Format: "YYYY-M-D" with no zero-padding (the keys are
 * only ever compared for set membership, not parsed).
 */
export function utcDayKey(unixMs: number): string {
  const d = new Date(unixMs);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

// ---------------------------------------------------------------------------
// Timestamp parsing
// ---------------------------------------------------------------------------

/**
 * Parse a timestamp value into Unix milliseconds. Handles:
 *
 *   - Numbers in either Unix-seconds or Unix-milliseconds. Heuristic:
 *     a value < 1e12 is treated as seconds (since 1e12 ms is the year
 *     33658, well past any realistic post date, while 1e12 s is
 *     unreachable as Unix seconds).
 *   - ISO 8601 strings starting "YYYY-MM-DDT...".
 *   - Twitter classic format ("Wed Apr 14 21:43:36 +0000 2021"),
 *     handled by Date.parse() fallback.
 *
 * Returns null for any value that doesn't parse cleanly.
 */
export function parseTimestamp(value: string | number): number | null {
  if (typeof value === 'number') {
    return value < 1e12 ? value * 1000 : value;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const ts = Date.parse(value);
    return Number.isFinite(ts) ? ts : null;
  }
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

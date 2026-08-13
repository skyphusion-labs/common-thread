/**
 * Schema-parallel temporal features from post timestamps (§4.2).
 * Shared by new-platform account extractors.
 */

import type { ExtractedFeature } from '../types';
import { computeBurstWindows, computeQuietPeriods, shannonEntropy, median, utcDayKey } from './helpers';

export function temporalFeaturesFromTimestamps(timestampsIn: number[]): ExtractedFeature[] {
  const timestamps = [...timestampsIn].filter((ts) => Number.isFinite(ts) && ts > 0);
  if (timestamps.length === 0) return [];

  const hourBuckets = new Array(24).fill(0) as number[];
  const dowBuckets = new Array(7).fill(0) as number[];
  const hourDowBuckets = new Array(168).fill(0) as number[];
  for (const ts of timestamps) {
    const d = new Date(ts);
    const hour = d.getUTCHours();
    const dow = d.getUTCDay();
    hourBuckets[hour]++;
    dowBuckets[dow]++;
    hourDowBuckets[dow * 24 + hour]++;
  }

  timestamps.sort((a, b) => a - b);
  const features: ExtractedFeature[] = [];
  const cat = 'temporal' as const;
  const total = timestamps.length;
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

  const spanDays = (lastTs - firstTs) / 1000 / 86400;
  features.push({ category: cat, name: 'active_span_days', value: { kind: 'numeric', value: spanDays } });
  const activeDays = new Set<string>();
  for (const ts of timestamps) activeDays.add(utcDayKey(ts));
  features.push({ category: cat, name: 'active_days_count', value: { kind: 'numeric', value: activeDays.size } });
  if (spanDays > 0) {
    features.push({
      category: cat,
      name: 'active_days_ratio',
      value: { kind: 'numeric', value: activeDays.size / Math.max(spanDays, 1) },
    });
  }

  features.push({ category: cat, name: 'posting_hour_distribution', value: { kind: 'json', value: hourBuckets } });
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
    value: { kind: 'numeric', value: hourBuckets.filter((c) => c > 0).length },
  });
  features.push({ category: cat, name: 'posting_dow_distribution', value: { kind: 'json', value: dowBuckets } });
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
  features.push({
    category: cat,
    name: 'posting_weekend_ratio',
    value: { kind: 'numeric', value: (dowBuckets[0] + dowBuckets[6]) / total },
  });

  if (timestamps.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) intervals.push((timestamps[i] - timestamps[i - 1]) / 1000);
    intervals.sort((a, b) => a - b);
    features.push({
      category: cat,
      name: 'median_inter_post_seconds',
      value: { kind: 'numeric', value: median(intervals) },
    });
    features.push({
      category: cat,
      name: 'mean_inter_post_seconds',
      value: { kind: 'numeric', value: intervals.reduce((s, x) => s + x, 0) / intervals.length },
    });
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

  features.push({ category: cat, name: 'posting_timestamps_unix_ms', value: { kind: 'json', value: timestamps } });
  features.push({
    category: cat,
    name: 'burst_windows_2sigma_14day',
    value: { kind: 'json', value: computeBurstWindows(timestamps) },
  });
  features.push({
    category: cat,
    name: 'posting_hour_dow_distribution',
    value: { kind: 'json', value: hourDowBuckets },
  });
  features.push({
    category: cat,
    name: 'quiet_periods_24hr',
    value: { kind: 'json', value: computeQuietPeriods(timestamps) },
  });
  return features;
}

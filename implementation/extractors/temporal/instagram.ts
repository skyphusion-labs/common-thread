/**
 * Instagram temporal account features extractor.
 *
 * Reads an Instagram post-list artifact and emits account-level
 * temporal features schema-parallel to temporal_twitter so burst,
 * cadence, active-hour, and quiet-period pair extractors operate
 * cross-platform without modification.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import {
  computeBurstWindows,
  computeQuietPeriods,
  shannonEntropy,
  median,
  utcDayKey,
  parseTimestamp,
} from './helpers';
import { parseInstagramListingBytes } from '../../ingest/instagram-listing-parser';

const NAME = 'temporal_instagram';
const VERSION = '1.0.0';

function isInstagramSourceUrl(source: string): boolean {
  try {
    const hostname = new URL(source).hostname.toLowerCase();
    return hostname === 'instagram.com' || hostname.endsWith('.instagram.com');
  } catch {
    return false;
  }
}

export class InstagramTemporalExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  private parseHostname(raw: string): string | null {
    try {
      const value = raw.trim();
      const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
        ? value
        : `https://${value}`;
      return new URL(withScheme).hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  private isHostOrSubdomain(host: string | null, domain: string): boolean {
    return host === domain || (host !== null && host.endsWith(`.${domain}`));
  }

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();
    const host = this.parseHostname(source);

    if (tool.includes('instagram-profile')) return false;
    if (source.includes('/p/') || source.includes('/reel/')) return true;

    if (
      tool.includes('instagram-post') ||
      tool.includes('instagram-timeline') ||
      tool.includes('instagram-media') ||
      tool.includes('instagram-scraper')
    ) {
      return true;
    }

    if (tool.includes('instagram')) return true;
    if (isInstagramSourceUrl(source)) return true;

    if (tool.includes('twitter') || tool.includes('x-com')) return false;
    if (tool.includes('reddit')) return false;
    if (
      this.isHostOrSubdomain(host, 'twitter.com') ||
      this.isHostOrSubdomain(host, 'x.com') ||
      (host === null && (source.includes('twitter.com') || source.includes('x.com')))
    ) return false;
    if (
      this.isHostOrSubdomain(host, 'reddit.com') ||
      host === 'redd.it' ||
      (host === null && (source.includes('reddit.com') || source.includes('redd.it')))
    ) return false;

    return false;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = parseInstagramListingBytes(input.bytes);
    if (!posts || posts.length === 0) return [];

    const timestamps: number[] = [];
    const hourBuckets = new Array(24).fill(0) as number[];
    const dowBuckets = new Array(7).fill(0) as number[];
    const hourDowBuckets = new Array(168).fill(0) as number[];
    let videoCount = 0;
    let carouselCount = 0;

    for (const post of posts) {
      const ts = parseTimestamp(post.createdAt);
      if (ts === null) continue;

      timestamps.push(ts);
      const d = new Date(ts);
      const hour = d.getUTCHours();
      const dow = d.getUTCDay();
      hourBuckets[hour]++;
      dowBuckets[dow]++;
      hourDowBuckets[dow * 24 + hour]++;

      if (post.isVideo) videoCount++;
      if (post.isCarousel) carouselCount++;
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

    features.push({
      category: cat,
      name: 'video_ratio',
      value: { kind: 'numeric', value: videoCount / total },
    });
    features.push({
      category: cat,
      name: 'carousel_ratio',
      value: { kind: 'numeric', value: carouselCount / total },
    });

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

/**
 * Co-engagement timing pair extractor (§4.4.3).
 *
 * For third-party posts engaged by two or more seed accounts, measures
 * pairwise time deltas between engagements. Tight deltas suggest the
 * same operator session; the distribution and baseline-relative z-score
 * are emitted for downstream reasoning rather than hard thresholds.
 *
 * v1.1.0: canonical target keys, earliest-per-account deduplication,
 * investigation-wide pair-mean baseline, tight-window (5 min) counts.
 */

import type {
  EngagementEventRecord,
  EngagementPairFeatureExtractor,
} from '../event-types';
import type { ExtractedFeature } from '../types';
import {
  buildCoEngagementBaseline,
  buildCoEngagementByTarget,
  CO_ENGAGEMENT_TIGHT_WINDOW_MS,
  countUnderThreshold,
  medianSorted,
  pairCoEngagementDeltas,
  populationMean,
} from './co-engagement-helpers';

const NAME = 'co_engagement_timing_network';
const VERSION = '1.1.0';

interface CoEngagementContext {
  byTarget: Map<string, EngagementEventRecord[]>;
  seedSet: Set<string>;
  baseline: ReturnType<typeof buildCoEngagementBaseline>;
}

export class CoEngagementTimingExtractor implements EngagementPairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'network' as const;
  readonly requiredEventTypes = ['reply', 'repost', 'quote'] as const;

  buildContext(
    seedAccounts: ReadonlyArray<{ account: string; events: EngagementEventRecord[] }>
  ): CoEngagementContext {
    const seedSet = new Set(seedAccounts.map(s => s.account));
    const byTarget = buildCoEngagementByTarget(seedAccounts, seedSet);
    const baseline = buildCoEngagementBaseline(seedAccounts, byTarget);
    return { byTarget, seedSet, baseline };
  }

  extract(
    accountA: string,
    accountB: string,
    _eventsA: EngagementEventRecord[],
    _eventsB: EngagementEventRecord[],
    context?: unknown
  ): ExtractedFeature[] {
    const ctx = context as CoEngagementContext | undefined;
    if (!ctx) return [];

    const { deltasMs, sharedTargets } = pairCoEngagementDeltas(
      accountA,
      accountB,
      ctx.byTarget,
      ctx.seedSet
    );

    if (deltasMs.length === 0) return [];

    const mean = populationMean(deltasMs);
    const median = medianSorted(deltasMs);
    const min = deltasMs[0];
    const max = deltasMs[deltasMs.length - 1];
    const tightCount = countUnderThreshold(deltasMs, CO_ENGAGEMENT_TIGHT_WINDOW_MS);
    const tightRatio = tightCount / deltasMs.length;

    const cat = 'network' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'co_engagement_shared_target_count',
        value: { kind: 'numeric', value: sharedTargets.length },
      },
      {
        category: cat,
        name: 'co_engagement_pair_delta_count',
        value: { kind: 'numeric', value: deltasMs.length },
      },
      {
        category: cat,
        name: 'co_engagement_delta_mean_ms',
        value: { kind: 'numeric', value: mean },
      },
      {
        category: cat,
        name: 'co_engagement_delta_median_ms',
        value: { kind: 'numeric', value: median },
      },
      {
        category: cat,
        name: 'co_engagement_delta_min_ms',
        value: { kind: 'numeric', value: min },
      },
      {
        category: cat,
        name: 'co_engagement_delta_max_ms',
        value: { kind: 'numeric', value: max },
      },
      {
        category: cat,
        name: 'co_engagement_tight_window_count',
        value: { kind: 'numeric', value: tightCount },
      },
      {
        category: cat,
        name: 'co_engagement_tight_window_ratio',
        value: { kind: 'numeric', value: tightRatio },
      },
      {
        category: cat,
        name: 'co_engagement_tight_window_ms',
        value: { kind: 'numeric', value: CO_ENGAGEMENT_TIGHT_WINDOW_MS },
      },
      {
        category: cat,
        name: 'co_engagement_delta_ms',
        value: { kind: 'json', value: deltasMs },
      },
      {
        category: cat,
        name: 'co_engagement_shared_targets',
        value: { kind: 'json', value: sharedTargets },
      },
      {
        category: cat,
        name: 'co_engagement_baseline_mean_ms',
        value: { kind: 'numeric', value: ctx.baseline.meanPairMeanDeltaMs },
      },
      {
        category: cat,
        name: 'co_engagement_baseline_stdev_ms',
        value: { kind: 'numeric', value: ctx.baseline.stdevPairMeanDeltaMs },
      },
      {
        category: cat,
        name: 'co_engagement_baseline_pair_count',
        value: { kind: 'numeric', value: ctx.baseline.pairSampleCount },
      },
    ];

    if (ctx.baseline.stdevPairMeanDeltaMs > 0) {
      features.push({
        category: cat,
        name: 'co_engagement_delta_mean_zscore',
        value: {
          kind: 'numeric',
          value: (mean - ctx.baseline.meanPairMeanDeltaMs) / ctx.baseline.stdevPairMeanDeltaMs,
        },
      });
    }

    return features;
  }
}

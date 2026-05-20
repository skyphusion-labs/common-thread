/**
 * Cadence JSD pair extractor (hour-of-week, 168 bins).
 *
 * Per the methodology paper §4.2.1, this extractor computes the
 * Jensen-Shannon divergence between two accounts' joint hour-of-day
 * by day-of-week posting distributions. The input is the 168-bin
 * posting_hour_dow_distribution feature emitted by the account-level
 * temporal extractor (v1.2.0+), flattened in row-major order:
 *
 *   index = dow * 24 + hour
 *
 * where dow is the UTC day-of-week (Sunday=0..Saturday=6) and hour is
 * the UTC hour-of-day (0..23). JSD with log base 2 produces a value
 * in [0, 1]: zero means identical weekly rhythms, one means fully
 * disjoint posting windows.
 *
 * This is the methodology paper's flagship temporal pair signal. The
 * hour-dow joint distribution distinguishes posting patterns that the
 * 24-bin hour marginal collapses (e.g., 8am-weekdays-only versus
 * 8am-weekends-only would look identical on the hour marginal but
 * different here) and that the 7-bin DOW marginal also collapses (e.g.,
 * two accounts both active on Wednesdays but one in the morning and
 * one in the evening). Pairs of sockpuppets operated by a single human
 * tend to share strong joint patterns because they share their
 * operator's daily and weekly schedule.
 *
 * Three companion features are emitted alongside the raw JSD score:
 *   cadence_max_diff: largest absolute probability difference across all
 *     168 bins
 *   cadence_max_diff_hour: the hour-of-day (0..23) of the most
 *     distinguishing bin
 *   cadence_max_diff_dow: the day-of-week (0..6) of the most
 *     distinguishing bin
 *
 * The companion features surface the "where in the week is the largest
 * disagreement" without forcing the attribution reasoner to re-derive
 * it from the raw distribution. Useful for human review of high-JSD
 * pairs ("these two diverge mostly on Saturday nights" is an
 * interpretable explanation).
 *
 * Determinism: pure pairwise computation on pre-computed distributions.
 * No buildContext, no randomness, no clock access. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either account missing posting_hour_dow_distribution (e.g.,
 *     produced under temporal_twitter v1.1.0 or earlier): returns empty.
 *   - Distribution not exactly 168 elements: returns empty (schema-drift
 *     guard).
 *   - Either distribution has total count zero: returns empty.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import {
  normalizeDistribution,
  jensenShannonDivergence,
  maxAbsDiffIndex,
} from './jsd';

const NAME = 'cadence_jsd_temporal';
const VERSION = '1.0.0';
const EXPECTED_LENGTH = 168;
const HOURS_PER_DAY = 24;

export class CadenceJsdExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'temporal' as const;
  readonly requiredAccountFeatures = ['posting_hour_dow_distribution'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const countsA = getCadenceDistribution(featuresA);
    const countsB = getCadenceDistribution(featuresB);
    if (!countsA || !countsB) return [];

    const P = normalizeDistribution(countsA);
    const Q = normalizeDistribution(countsB);
    if (!P || !Q) return [];

    const jsd = jensenShannonDivergence(P, Q);
    const { index, diff } = maxAbsDiffIndex(P, Q);

    const cat = 'temporal' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'cadence_jsd',
        value: { kind: 'numeric', value: jsd },
      },
      {
        category: cat,
        name: 'cadence_max_diff',
        value: { kind: 'numeric', value: diff },
      },
    ];

    if (index >= 0) {
      const dow = Math.floor(index / HOURS_PER_DAY);
      const hour = index % HOURS_PER_DAY;
      features.push({
        category: cat,
        name: 'cadence_max_diff_hour',
        value: { kind: 'numeric', value: hour },
      });
      features.push({
        category: cat,
        name: 'cadence_max_diff_dow',
        value: { kind: 'numeric', value: dow },
      });
    }

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCadenceDistribution(features: AccountFeatureMap): number[] | null {
  const v = features.get('posting_hour_dow_distribution');
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;
  if (v.value.length !== EXPECTED_LENGTH) return null;
  for (const x of v.value) {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) return null;
  }
  return v.value as number[];
}

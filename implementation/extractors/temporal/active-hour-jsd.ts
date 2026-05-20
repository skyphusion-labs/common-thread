/**
 * Active-hour JSD pair extractor.
 *
 * Per the methodology paper §4.2.3, this extractor computes the
 * Jensen-Shannon divergence between two accounts' hour-of-day posting
 * distributions. The input is the 24-bin posting_hour_distribution
 * feature emitted by the account-level temporal extractor (UTC hours,
 * 0..23). JSD with log base 2 produces a value in [0, 1]: zero means
 * identical hour-of-day rhythms, one means fully disjoint hours.
 *
 * This signal captures the "what time of day is this account active"
 * dimension and is interpretable as a timezone/lifestyle proxy. Two
 * accounts operated by the same person in the same timezone should
 * have very similar hour-of-day distributions; two accounts in
 * different timezones or operated by different people with different
 * schedules will have higher JSD.
 *
 * Relationship to cadence_jsd_temporal (§4.2.1): the cadence extractor
 * computes JSD on the 168-bin hour-dow joint distribution, which
 * captures the same signal plus the day-of-week dimension. Active-hour
 * JSD is the hour marginal of the cadence JSD. Two accounts that post
 * at identical hours but on different days of the week will have a
 * low active_hour_jsd but a higher cadence_jsd. Surfacing both signals
 * gives the attribution reasoner the information it needs to
 * distinguish "same daily rhythm" from "same weekly rhythm."
 *
 * Determinism: pure pairwise computation on pre-computed distributions.
 * No buildContext, no randomness, no clock access. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either account missing posting_hour_distribution: returns empty.
 *   - Distribution not exactly 24 elements: returns empty (schema drift
 *     guard; if a future account extractor changes the bin count, this
 *     extractor must be revised alongside).
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

const NAME = 'active_hour_jsd_temporal';
const VERSION = '1.0.0';
const EXPECTED_LENGTH = 24;

export class ActiveHourJsdExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'temporal' as const;
  readonly requiredAccountFeatures = ['posting_hour_distribution'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const countsA = getHourDistribution(featuresA);
    const countsB = getHourDistribution(featuresB);
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
        name: 'active_hour_jsd',
        value: { kind: 'numeric', value: jsd },
      },
      {
        category: cat,
        name: 'active_hour_max_diff',
        value: { kind: 'numeric', value: diff },
      },
    ];

    if (index >= 0) {
      features.push({
        category: cat,
        name: 'active_hour_max_diff_hour',
        value: { kind: 'numeric', value: index },
      });
    }

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHourDistribution(features: AccountFeatureMap): number[] | null {
  const v = features.get('posting_hour_distribution');
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;
  if (v.value.length !== EXPECTED_LENGTH) return null;
  for (const x of v.value) {
    if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) return null;
  }
  return v.value as number[];
}

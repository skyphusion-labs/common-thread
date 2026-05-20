/**
 * Burst-correlation pair extractor.
 *
 * Per the methodology paper §4.2.5, this extractor identifies temporal
 * overlap between burst periods of two accounts. Burst windows are
 * pre-computed at the account layer (see temporal/twitter.ts v1.1.0+
 * burst_windows_2sigma_14day feature) using a 2-stdev / 14-day-rolling-
 * baseline rule with a minimum-count floor.
 *
 * Algorithm:
 *   1. For each (a, b) in burstsA × burstsB, compute the intersection
 *      interval [max(a.startMs, b.startMs), min(a.endMs, b.endMs)] and
 *      skip if empty.
 *   2. Aggregate four pair features:
 *        - burst_overlap_window_count: count of (a, b) pairs with
 *          non-empty temporal overlap
 *        - burst_overlap_total_seconds: sum of overlap durations in
 *          seconds
 *        - burst_overlap_jaccard_days: Jaccard similarity computed
 *          over the sets of UTC calendar days covered by A's and B's
 *          burst windows
 *        - burst_co_occurrence_symmetric: (|overlappingBurstsA| +
 *          |overlappingBurstsB|) / (|burstsA| + |burstsB|), in [0, 1]
 *
 *   3. Always emit burst_count_a and burst_count_b so the pair_features
 *      row records the attempt even when one or both accounts have no
 *      bursts. When either count is zero, the four overlap features
 *      above are still emitted with zero values; downstream attribution
 *      reasoning needs to distinguish "no bursts" from "bursts but no
 *      overlap," and the pair counts let it.
 *
 * Determinism: the extractor consumes pre-computed account features
 * (JSON arrays of objects). No floating-point ambiguity, no random
 * sampling, no clock access. Satisfies §6.1.
 *
 * No buildContext() is needed; burst windows are already normalized at
 * the account layer against each account's own 14-day rolling baseline,
 * so cross-account reference statistics are not required.
 *
 * Edge cases:
 *   - Either account has no burst_windows_2sigma_14day feature (e.g.,
 *     produced under temporal_twitter v1.0.0 before the feature was
 *     introduced): the extractor returns empty so the runner records
 *     the pair attempt without emitting feature rows.
 *   - Either account has an empty burst_windows array: pair counts
 *     are emitted with zero, overlap features emit with zero values.
 *   - Malformed burst_windows entries (missing keys, non-numeric ms):
 *     the extractor returns empty.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'burst_overlap_temporal';
const VERSION = '1.0.0';

const MS_PER_DAY = 86_400_000;

interface BurstWindow {
  startMs: number;
  endMs: number;
  peakDailyCount: number;
  durationDays: number;
}

export class BurstOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'temporal' as const;
  readonly requiredAccountFeatures = ['burst_windows_2sigma_14day'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const burstsA = getBurstWindows(featuresA);
    const burstsB = getBurstWindows(featuresB);
    if (burstsA === null || burstsB === null) return [];

    const cat = 'temporal' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'burst_count_a',
        value: { kind: 'numeric', value: burstsA.length },
      },
      {
        category: cat,
        name: 'burst_count_b',
        value: { kind: 'numeric', value: burstsB.length },
      },
    ];

    let overlapPairs = 0;
    let overlapMs = 0;
    const overlappingFromA = new Set<number>(); // indices in burstsA that overlap something in B
    const overlappingFromB = new Set<number>();

    for (let i = 0; i < burstsA.length; i++) {
      const a = burstsA[i];
      for (let j = 0; j < burstsB.length; j++) {
        const b = burstsB[j];
        const start = Math.max(a.startMs, b.startMs);
        const end = Math.min(a.endMs, b.endMs);
        if (end > start) {
          overlapPairs++;
          overlapMs += end - start;
          overlappingFromA.add(i);
          overlappingFromB.add(j);
        }
      }
    }

    features.push({
      category: cat,
      name: 'burst_overlap_window_count',
      value: { kind: 'numeric', value: overlapPairs },
    });
    features.push({
      category: cat,
      name: 'burst_overlap_total_seconds',
      value: { kind: 'numeric', value: overlapMs / 1000 },
    });

    // Jaccard over the sets of UTC calendar days covered by each account's
    // burst windows. This is a more interpretable similarity than raw
    // overlap-seconds because it normalizes by the union of both accounts'
    // burst footprints.
    const daysA = enumerateBurstDays(burstsA);
    const daysB = enumerateBurstDays(burstsB);
    const intersectionDays = countIntersection(daysA, daysB);
    const unionDays = daysA.size + daysB.size - intersectionDays;
    const jaccard = unionDays > 0 ? intersectionDays / unionDays : 0;
    features.push({
      category: cat,
      name: 'burst_overlap_jaccard_days',
      value: { kind: 'numeric', value: jaccard },
    });

    // Symmetric co-occurrence: what fraction of all bursts (counted across
    // both accounts) participate in any overlap? Equals 0 when no overlaps,
    // 1 when every burst on both sides overlaps something on the other.
    const totalBursts = burstsA.length + burstsB.length;
    const coOccurrence =
      totalBursts > 0
        ? (overlappingFromA.size + overlappingFromB.size) / totalBursts
        : 0;
    features.push({
      category: cat,
      name: 'burst_co_occurrence_symmetric',
      value: { kind: 'numeric', value: coOccurrence },
    });

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract and validate the burst_windows_2sigma_14day feature.
 * Returns null when the feature is missing or malformed (so the extractor
 * returns empty and the runner records the pair attempt without rows).
 * Returns an empty array when the feature is present but contains no bursts
 * (so the pair extractor still emits burst_count_a/b = 0 and overlap = 0).
 */
function getBurstWindows(features: AccountFeatureMap): BurstWindow[] | null {
  const v = features.get('burst_windows_2sigma_14day');
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;

  const out: BurstWindow[] = [];
  for (const entry of v.value) {
    if (!entry || typeof entry !== 'object') return null;
    const obj = entry as Record<string, unknown>;
    const startMs = obj.startMs;
    const endMs = obj.endMs;
    const peak = obj.peakDailyCount;
    const dur = obj.durationDays;
    if (
      typeof startMs !== 'number' ||
      typeof endMs !== 'number' ||
      typeof peak !== 'number' ||
      typeof dur !== 'number' ||
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      !Number.isFinite(peak) ||
      !Number.isFinite(dur) ||
      endMs < startMs
    ) {
      return null;
    }
    out.push({ startMs, endMs, peakDailyCount: peak, durationDays: dur });
  }
  return out;
}

/**
 * Enumerate the set of UTC calendar days (encoded as
 * floor(startMs / MS_PER_DAY)) covered by all burst windows. The set is
 * used for Jaccard computation.
 */
function enumerateBurstDays(bursts: BurstWindow[]): Set<number> {
  const days = new Set<number>();
  for (const b of bursts) {
    const startDay = Math.floor(b.startMs / MS_PER_DAY);
    const endDay = Math.floor(b.endMs / MS_PER_DAY);
    for (let d = startDay; d <= endDay; d++) days.add(d);
  }
  return days;
}

function countIntersection(a: Set<number>, b: Set<number>): number {
  // Iterate the smaller set for efficiency
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let count = 0;
  for (const x of small) if (large.has(x)) count++;
  return count;
}

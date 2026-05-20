/**
 * Quiet-period overlap pair extractor.
 *
 * Per the methodology paper §4.2.4, this extractor identifies temporal
 * overlap between silence periods of two accounts. Quiet periods are
 * pre-computed at the account layer (see temporal/twitter.ts v1.3.0+
 * quiet_periods_24hr feature) using a fixed 24-hour gap threshold
 * applied to the sorted timestamp series.
 *
 * The signal complements burst-correlation. Burst-overlap captures
 * coordinated presence; quiet-period overlap captures coordinated
 * absence. When a single human operates multiple accounts, both signals
 * should be positive: the accounts post together (bursts) and go silent
 * together (quiets). When two accounts are operated by different humans
 * in different timezones, both signals should be weak.
 *
 * Algorithm:
 *   1. For each (a, b) in quietsA × quietsB, compute the intersection
 *      interval [max(a.startMs, b.startMs), min(a.endMs, b.endMs)] and
 *      skip if empty.
 *   2. Aggregate the pair features:
 *        - quiet_period_overlap_window_count: count of (a, b) pairs
 *          with non-empty temporal overlap
 *        - quiet_period_overlap_total_seconds: sum of overlap durations
 *          in seconds
 *        - quiet_period_overlap_jaccard_seconds: continuous-time Jaccard
 *          similarity computed over the total quiet-time intervals of A
 *          and B
 *        - quiet_period_co_occurrence_symmetric: (|overlappingFromA| +
 *          |overlappingFromB|) / (|quietsA| + |quietsB|), in [0, 1]
 *
 *   3. Always emit quiet_period_count_a and quiet_period_count_b so the
 *      pair_features row records the attempt even when one or both
 *      accounts have no quiet periods.
 *
 * Jaccard formulation: because quiet periods are timestamp-aligned
 * intervals (not day-aligned bins like burst windows), Jaccard is
 * computed continuously rather than over discrete day-sets. The
 * intersection is the sum of overlap durations across all (a, b) pairs.
 * The union is totalQuietSecondsA + totalQuietSecondsB - intersection.
 * This holds because within each account the quiet periods are
 * pairwise disjoint by construction (each period sits between two
 * specific posts).
 *
 * Determinism: pure pairwise computation on pre-computed account
 * features. No buildContext, no randomness, no clock access.
 * Satisfies §6.1.
 *
 * Edge cases:
 *   - Either account missing quiet_periods_24hr (e.g., produced under
 *     temporal_twitter v1.2.0 or earlier): returns empty.
 *   - Either account has empty quiet_periods_24hr array (always active
 *     or insufficient data): pair counts emitted as zero, overlap
 *     features emitted as zero.
 *   - Malformed entries (missing keys, non-numeric ms, endMs < startMs):
 *     returns empty.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'quiet_period_overlap_temporal';
const VERSION = '1.0.0';

interface QuietPeriod {
  startMs: number;
  endMs: number;
  durationMs: number;
}

export class QuietPeriodOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'temporal' as const;
  readonly requiredAccountFeatures = ['quiet_periods_24hr'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const quietsA = getQuietPeriods(featuresA);
    const quietsB = getQuietPeriods(featuresB);
    if (quietsA === null || quietsB === null) return [];

    const cat = 'temporal' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'quiet_period_count_a',
        value: { kind: 'numeric', value: quietsA.length },
      },
      {
        category: cat,
        name: 'quiet_period_count_b',
        value: { kind: 'numeric', value: quietsB.length },
      },
    ];

    let overlapPairs = 0;
    let overlapMs = 0;
    const overlappingFromA = new Set<number>();
    const overlappingFromB = new Set<number>();

    for (let i = 0; i < quietsA.length; i++) {
      const a = quietsA[i];
      for (let j = 0; j < quietsB.length; j++) {
        const b = quietsB[j];
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
      name: 'quiet_period_overlap_window_count',
      value: { kind: 'numeric', value: overlapPairs },
    });
    features.push({
      category: cat,
      name: 'quiet_period_overlap_total_seconds',
      value: { kind: 'numeric', value: overlapMs / 1000 },
    });

    // Continuous-time Jaccard. Within each account, quiet periods are
    // pairwise disjoint by construction, so totalQuietMsA is just the sum
    // of individual durations. Cross-account intersection equals the
    // overlap sum already computed above. Union = A + B - intersection.
    let totalQuietMsA = 0;
    for (const q of quietsA) totalQuietMsA += q.durationMs;
    let totalQuietMsB = 0;
    for (const q of quietsB) totalQuietMsB += q.durationMs;
    const unionMs = totalQuietMsA + totalQuietMsB - overlapMs;
    const jaccard = unionMs > 0 ? overlapMs / unionMs : 0;
    features.push({
      category: cat,
      name: 'quiet_period_overlap_jaccard_seconds',
      value: { kind: 'numeric', value: jaccard },
    });

    // Symmetric co-occurrence across both accounts' quiet-period sets.
    const totalQuiets = quietsA.length + quietsB.length;
    const coOccurrence =
      totalQuiets > 0
        ? (overlappingFromA.size + overlappingFromB.size) / totalQuiets
        : 0;
    features.push({
      category: cat,
      name: 'quiet_period_co_occurrence_symmetric',
      value: { kind: 'numeric', value: coOccurrence },
    });

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract and validate the quiet_periods_24hr feature. Returns null when
 * the feature is missing or malformed (so the extractor returns empty
 * and the runner records the pair attempt without rows). Returns an
 * empty array when the feature is present but contains no quiet periods
 * (so the pair extractor still emits quiet_period_count_a/b = 0 and
 * overlap = 0).
 */
function getQuietPeriods(features: AccountFeatureMap): QuietPeriod[] | null {
  const v = features.get('quiet_periods_24hr');
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;

  const out: QuietPeriod[] = [];
  for (const entry of v.value) {
    if (!entry || typeof entry !== 'object') return null;
    const obj = entry as Record<string, unknown>;
    const startMs = obj.startMs;
    const endMs = obj.endMs;
    const durationMs = obj.durationMs;
    if (
      typeof startMs !== 'number' ||
      typeof endMs !== 'number' ||
      typeof durationMs !== 'number' ||
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      !Number.isFinite(durationMs) ||
      endMs < startMs ||
      durationMs < 0
    ) {
      return null;
    }
    out.push({ startMs, endMs, durationMs });
  }
  return out;
}

/**
 * Follower-overlap pair extractor.
 *
 * Per the methodology paper §4.4.1, this extractor computes Jaccard
 * similarity of two accounts' follower sets, normalized against a
 * community baseline. Operators frequently control follower-purchase
 * patterns or share organic follower bases between sockpuppets;
 * follower-set overlap is one of the strongest network-level
 * indicators of common operatorship when the value is significantly
 * above the community baseline.
 *
 * Community baseline: when seed_accounts includes is_control=1 rows,
 * the baseline uses only control-account pairs (§5.1.4). Otherwise
 * falls back to leave-it-in across all seeds (conservative bias).
 *
 * Algorithm:
 *
 *   buildContext (once per run):
 *     For every canonical pair (i, j) where both accounts have a
 *     follower_set feature, compute Jaccard. Collect into an array.
 *     Compute the population mean and population standard deviation.
 *     Return { meanJaccard, stdevJaccard, pairCount }.
 *
 *   extract (per pair):
 *     Compute |A intersect B| and |A union B|.
 *     Jaccard = intersection / union, or 0 if union is empty.
 *     z-score = (jaccard - meanJaccard) / stdevJaccard, when stdev > 0.
 *     Emit follower_overlap_jaccard plus baseline statistics.
 *
 * Features emitted per pair:
 *
 *   follower_set_size_a (numeric)
 *   follower_set_size_b (numeric)
 *   follower_overlap_count (numeric)
 *   follower_overlap_jaccard (numeric, [0, 1])
 *   follower_overlap_baseline_mean (numeric)
 *   follower_overlap_baseline_stdev (numeric)
 *   follower_overlap_jaccard_zscore (numeric, emitted only when
 *     baseline_stdev > 0; when stdev is zero the z-score is undefined
 *     and would mislead downstream reasoning)
 *   follower_overlap_shared (json, sorted array of shared handles,
 *     emitted only when at least one shared handle exists)
 *
 * Determinism: pure set arithmetic and integer counts. No randomness,
 * no clock access, no I/O. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either account missing follower_set: returns empty (the runner
 *     filters these out before calling, but the guard is here too).
 *   - Both follower sets empty: Jaccard = 0, intersection = 0; emitted
 *     as a null-result data point rather than skipped.
 *   - All seed pairs have identical Jaccard (degenerate baseline,
 *     stdev = 0): z-score field omitted; baseline_mean and
 *     baseline_stdev still reported so downstream reasoning sees the
 *     degeneracy.
 *   - Single pair only in the seed set: stdev = 0 (population stdev
 *     of a single sample), same handling as above.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'follower_overlap_network';
const VERSION = '1.0.0';

interface FollowerOverlapContext {
  meanJaccard: number;
  stdevJaccard: number;
  pairCount: number;
}

export class FollowerOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'network' as const;
  readonly requiredAccountFeatures = ['follower_set'] as const;

  buildContext(
    seedAccounts: readonly { account: string; features: AccountFeatureMap; isControl?: boolean }[]
  ): FollowerOverlapContext {
    const hasControls = seedAccounts.some(a => a.isControl);
    const baselineAccounts = hasControls
      ? seedAccounts.filter(a => a.isControl)
      : seedAccounts;

    // Only include accounts that actually have a follower_set feature.
    const accountSets: Set<string>[] = [];
    for (const acct of baselineAccounts) {
      const set = parseFollowerSet(acct.features);
      if (set !== null) {
        accountSets.push(set);
      }
    }

    const jaccards: number[] = [];
    for (let i = 0; i < accountSets.length - 1; i++) {
      for (let j = i + 1; j < accountSets.length; j++) {
        jaccards.push(jaccardSimilarity(accountSets[i], accountSets[j]));
      }
    }

    if (jaccards.length === 0) {
      return { meanJaccard: 0, stdevJaccard: 0, pairCount: 0 };
    }

    const mean = jaccards.reduce((s, x) => s + x, 0) / jaccards.length;
    let varSum = 0;
    for (const j of jaccards) {
      const diff = j - mean;
      varSum += diff * diff;
    }
    const stdev = Math.sqrt(varSum / jaccards.length);

    return { meanJaccard: mean, stdevJaccard: stdev, pairCount: jaccards.length };
  }

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    context?: PairContext
  ): ExtractedFeature[] {
    const setA = parseFollowerSet(featuresA);
    const setB = parseFollowerSet(featuresB);
    if (!setA || !setB) return [];

    const intersection = intersect(setA, setB);
    const unionSize = setA.size + setB.size - intersection.size;
    const jaccard = unionSize > 0 ? intersection.size / unionSize : 0;

    const ctx = context as FollowerOverlapContext | undefined;
    const cat = 'network' as const;

    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'follower_set_size_a',
        value: { kind: 'numeric', value: setA.size },
      },
      {
        category: cat,
        name: 'follower_set_size_b',
        value: { kind: 'numeric', value: setB.size },
      },
      {
        category: cat,
        name: 'follower_overlap_count',
        value: { kind: 'numeric', value: intersection.size },
      },
      {
        category: cat,
        name: 'follower_overlap_jaccard',
        value: { kind: 'numeric', value: jaccard },
      },
    ];

    if (ctx && typeof ctx.meanJaccard === 'number') {
      features.push(
        {
          category: cat,
          name: 'follower_overlap_baseline_mean',
          value: { kind: 'numeric', value: ctx.meanJaccard },
        },
        {
          category: cat,
          name: 'follower_overlap_baseline_stdev',
          value: { kind: 'numeric', value: ctx.stdevJaccard },
        }
      );

      if (ctx.stdevJaccard > 0) {
        features.push({
          category: cat,
          name: 'follower_overlap_jaccard_zscore',
          value: {
            kind: 'numeric',
            value: (jaccard - ctx.meanJaccard) / ctx.stdevJaccard,
          },
        });
      }
    }

    if (intersection.size > 0) {
      features.push({
        category: cat,
        name: 'follower_overlap_shared',
        value: { kind: 'json', value: [...intersection].sort() },
      });
    }

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseFollowerSet(features: AccountFeatureMap): Set<string> | null {
  const v = features.get('follower_set');
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;

  const set = new Set<string>();
  for (const item of v.value) {
    if (typeof item === 'string' && item.length > 0) set.add(item);
  }
  return set;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  const inter = intersect(a, b);
  const unionSize = a.size + b.size - inter.size;
  return unionSize > 0 ? inter.size / unionSize : 0;
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<string>();
  for (const x of small) if (large.has(x)) out.add(x);
  return out;
}

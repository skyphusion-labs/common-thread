/**
 * Burrows' Delta pair extractor.
 *
 * Burrows' Delta (Burrows 2002) is the classic stylometric distance
 * measure: the mean absolute difference of z-score-normalized
 * function-word frequencies, computed against a reference distribution.
 *
 * Algorithm:
 *   1. For each function word j in 1..150, compute mean μ_j and
 *      population stdev σ_j of f_i,j over all seed accounts i.
 *      (Population stdev because we treat the seed set as the full
 *      reference universe for this investigation.)
 *   2. For each account i, compute z-scores z_i,j = (f_i,j - μ_j) / σ_j.
 *      When σ_j = 0 (the function word has no variance across the
 *      seed), z_i,j is set to 0 for all i.
 *   3. Δ_AB = (1/K) Σ_j |z_A,j - z_B,j|, where K is the count of
 *      function-word positions used (positions with σ_j > 0).
 *
 * Lower Δ values indicate greater stylistic similarity. The methodology
 * paper (§4.3.1) uses coarse confidence bands rather than fixed
 * thresholds, so this extractor emits only the raw Δ score plus the
 * most-distinguishing function-word position; downstream attribution
 * reasoning maps Δ into the three-band confidence scheme.
 *
 * Reference distribution choice: we use the seed set itself as the
 * reference distribution. This makes Δ specific to the investigation:
 * the same two accounts compared in two different investigations with
 * different seed sets may produce different Δ values, because the
 * normalization is different. This is an intentional design choice
 * documented in §4.3.1 of the methodology paper. The alternative
 * (using a fixed external corpus like the Brown Corpus) is incompatible
 * with the data-portability constraints of this project and would
 * require shipping a large reference corpus as part of the system.
 *
 * Edge cases:
 *   - Seed set with fewer than 2 accounts: the runner rejects before
 *     reaching this extractor.
 *   - All accounts identical (σ_j = 0 for all j): K = 0, Δ undefined;
 *     extractor returns empty features for those pairs.
 *   - Malformed function_word_frequencies vector: extractor returns
 *     empty features.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import {
  FUNCTION_WORDS_150,
  FUNCTION_WORD_VECTOR_LENGTH,
} from './function-words';

const NAME = 'burrows_delta_stylometric';
const VERSION = '1.0.0';

interface BurrowsDeltaContext {
  /** μ_j for j = 0..149 */
  meanFreq: number[];
  /** σ_j for j = 0..149 (population stdev) */
  stdevFreq: number[];
  /** Indices where σ_j > 0; only these contribute to Δ. */
  validIndices: number[];
  /** Number of seed accounts that contributed to the reference. */
  seedAccountCount: number;
}

export class BurrowsDeltaExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'stylometric' as const;
  readonly requiredAccountFeatures = ['function_word_frequencies'] as const;

  buildContext(
    seedAccounts: ReadonlyArray<{ account: string; features: AccountFeatureMap }>
  ): PairContext {
    const vectors: number[][] = [];
    for (const acct of seedAccounts) {
      const v = getFunctionWordVector(acct.features);
      if (v) vectors.push(v);
    }

    const meanFreq = new Array(FUNCTION_WORD_VECTOR_LENGTH).fill(0) as number[];
    const stdevFreq = new Array(FUNCTION_WORD_VECTOR_LENGTH).fill(0) as number[];

    if (vectors.length === 0) {
      return {
        meanFreq,
        stdevFreq,
        validIndices: [],
        seedAccountCount: 0,
      } satisfies BurrowsDeltaContext;
    }

    const n = vectors.length;
    for (let j = 0; j < FUNCTION_WORD_VECTOR_LENGTH; j++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += vectors[i][j];
      meanFreq[j] = sum / n;
    }
    for (let j = 0; j < FUNCTION_WORD_VECTOR_LENGTH; j++) {
      let sumSq = 0;
      for (let i = 0; i < n; i++) {
        const d = vectors[i][j] - meanFreq[j];
        sumSq += d * d;
      }
      stdevFreq[j] = Math.sqrt(sumSq / n);
    }

    const validIndices: number[] = [];
    for (let j = 0; j < FUNCTION_WORD_VECTOR_LENGTH; j++) {
      if (stdevFreq[j] > 0) validIndices.push(j);
    }

    return {
      meanFreq,
      stdevFreq,
      validIndices,
      seedAccountCount: n,
    } satisfies BurrowsDeltaContext;
  }

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    context?: PairContext
  ): ExtractedFeature[] {
    const ctx = context as BurrowsDeltaContext | undefined;
    if (!ctx || ctx.validIndices.length === 0) return [];

    const vA = getFunctionWordVector(featuresA);
    const vB = getFunctionWordVector(featuresB);
    if (!vA || !vB) return [];

    // Z-score normalize, but only over positions with stdev > 0.
    let sumAbsDiff = 0;
    let maxAbsDiff = -Infinity;
    let maxIdx = -1;

    for (const j of ctx.validIndices) {
      const zA = (vA[j] - ctx.meanFreq[j]) / ctx.stdevFreq[j];
      const zB = (vB[j] - ctx.meanFreq[j]) / ctx.stdevFreq[j];
      const absDiff = Math.abs(zA - zB);
      sumAbsDiff += absDiff;
      if (absDiff > maxAbsDiff) {
        maxAbsDiff = absDiff;
        maxIdx = j;
      }
    }

    const delta = sumAbsDiff / ctx.validIndices.length;

    const features: ExtractedFeature[] = [
      {
        category: 'stylometric',
        name: 'burrows_delta',
        value: { kind: 'numeric', value: delta },
      },
      {
        category: 'stylometric',
        name: 'burrows_delta_max_z_diff',
        value: { kind: 'numeric', value: maxAbsDiff },
      },
    ];

    if (maxIdx >= 0) {
      features.push({
        category: 'stylometric',
        name: 'burrows_delta_max_z_diff_word',
        value: { kind: 'text', value: FUNCTION_WORDS_150[maxIdx] },
      });
    }

    features.push({
      category: 'stylometric',
      name: 'burrows_delta_dimensions_used',
      value: { kind: 'numeric', value: ctx.validIndices.length },
    });

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract and validate the function_word_frequencies vector from a feature map.
 * Returns null if missing or malformed; the pair extractor returns empty in
 * that case so the runner records the pair attempt without emitting features.
 */
function getFunctionWordVector(features: AccountFeatureMap): number[] | null {
  const v = features.get('function_word_frequencies');
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;
  if (v.value.length !== FUNCTION_WORD_VECTOR_LENGTH) return null;
  for (const x of v.value) {
    if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  }
  return v.value as number[];
}

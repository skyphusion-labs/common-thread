/**
 * Jensen-Shannon divergence over character-bigram distributions.
 *
 * JSD is a symmetric, bounded measure of distance between two
 * probability distributions:
 *
 *   M = (P + Q) / 2
 *   JSD(P, Q) = (1/2) KL(P || M) + (1/2) KL(Q || M)
 *
 * With log base 2, JSD is in [0, 1]: 0 means identical distributions,
 * 1 means fully disjoint support. This makes JSD natural to interpret
 * as a similarity score on a fixed scale (unlike Burrows' Delta, which
 * is unbounded and investigation-specific).
 *
 * Character-bigram JSD is a topic-robust stylometric signal: it
 * captures patterns of letter co-occurrence that depend on a writer's
 * spelling, vocabulary morphology, and (for non-native or
 * dialect-specific writers) underlying language interference, rather
 * than on the subject matter being written about. It complements
 * Burrows' Delta in the methodology paper's §4.3: Delta captures
 * function-word patterns; JSD captures character-level patterns.
 *
 * Approximation: the input is the character_bigram_top50 feature, not
 * a full bigram distribution. The top-50 truncation captures most of
 * the probability mass for English text (the top 50 bigrams typically
 * account for ~70% of all bigram occurrences in natural prose), but
 * tail-heavy texts will be approximated less faithfully. A future
 * version of the stylometric extractor could emit the full
 * distribution; this v1 uses the truncated form to keep the JSON
 * column size bounded.
 *
 * Renormalization: each account's top-50 is renormalized so its
 * probabilities sum to 1.0 over the union of both accounts' bigrams.
 * Bigrams present in one account but not the other are treated as
 * probability 0 on the missing side, which is exact (not smoothed):
 * we know the bigram isn't in the top 50, but we don't know its true
 * frequency in the tail. Using 0 means JSD will overestimate distance
 * when accounts have very different vocabularies. This is a known
 * limitation, also documented in the methodology paper §4.3.2.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'jsd_character_bigrams_stylometric';
const VERSION = '1.0.0';

export class JsdCharacterBigramsExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'stylometric' as const;
  readonly requiredAccountFeatures = ['character_bigram_top50'] as const;

  // No buildContext: JSD is a pure pairwise computation; no
  // cross-account reference statistics needed.

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const mapA = getBigramMap(featuresA);
    const mapB = getBigramMap(featuresB);
    if (!mapA || !mapB) return [];

    // Build the union support, sorted for determinism.
    const allKeys = new Set<string>();
    for (const k of mapA.keys()) allKeys.add(k);
    for (const k of mapB.keys()) allKeys.add(k);
    if (allKeys.size === 0) return [];
    const sortedKeys = Array.from(allKeys).sort();

    // Compute totals for renormalization within each account's own counts.
    let totalA = 0;
    let totalB = 0;
    for (const c of mapA.values()) totalA += c;
    for (const c of mapB.values()) totalB += c;
    if (totalA === 0 || totalB === 0) return [];

    // Build P and Q over the common support (sums to 1.0 within each, since
    // we normalize over each account's own truncated support).
    const P: number[] = new Array(sortedKeys.length);
    const Q: number[] = new Array(sortedKeys.length);
    for (let i = 0; i < sortedKeys.length; i++) {
      const k = sortedKeys[i];
      P[i] = (mapA.get(k) ?? 0) / totalA;
      Q[i] = (mapB.get(k) ?? 0) / totalB;
    }

    const jsd = jensenShannonDivergence(P, Q);

    // Overlap statistics for inspection.
    let intersectCount = 0;
    for (const k of mapA.keys()) if (mapB.has(k)) intersectCount++;
    const unionCount = allKeys.size;
    const overlapRatio = unionCount > 0 ? intersectCount / unionCount : 0;

    return [
      {
        category: 'stylometric',
        name: 'jsd_character_bigrams',
        value: { kind: 'numeric', value: jsd },
      },
      {
        category: 'stylometric',
        name: 'character_bigram_overlap_count',
        value: { kind: 'numeric', value: intersectCount },
      },
      {
        category: 'stylometric',
        name: 'character_bigram_overlap_ratio',
        value: { kind: 'numeric', value: overlapRatio },
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

/**
 * Jensen-Shannon divergence with log base 2, so the result is in [0, 1].
 * Assumes P and Q are normalized probability distributions over the same
 * support (same length, both sum to ~1.0 within floating-point tolerance).
 */
function jensenShannonDivergence(P: number[], Q: number[]): number {
  if (P.length !== Q.length) {
    throw new Error('JSD: P and Q must have the same length');
  }
  let kpm = 0;
  let kqm = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i];
    const q = Q[i];
    const m = (p + q) / 2;
    if (m === 0) continue;
    if (p > 0) kpm += p * Math.log2(p / m);
    if (q > 0) kqm += q * Math.log2(q / m);
  }
  return (kpm + kqm) / 2;
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

function getBigramMap(features: AccountFeatureMap): Map<string, number> | null {
  const v = features.get('character_bigram_top50');
  if (!v || v.kind !== 'json') return null;
  if (!v.value || typeof v.value !== 'object' || Array.isArray(v.value)) {
    return null;
  }
  const m = new Map<string, number>();
  for (const [k, c] of Object.entries(v.value as Record<string, unknown>)) {
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) return null;
    m.set(k, c);
  }
  if (m.size === 0) return null;
  return m;
}

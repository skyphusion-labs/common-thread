/**
 * Color-palette overlap pair extractor.
 *
 * Per the methodology paper §4.5.4, this extractor compares the
 * aggregated color palettes between two accounts via their full
 * 512-bin RGB histograms. The signal picks up shared visual
 * aesthetics that survive transformations dHash misses (lossy
 * recompression, mild cropping, filter changes that preserve the
 * dominant color distribution).
 *
 * Three complementary similarity metrics:
 *
 *   1. Jensen-Shannon divergence (JSD) on the aligned normalized
 *      histograms. Log base 2, output in [0, 1]. The primary signal:
 *      0 = identical palettes, 1 = maximally different.
 *
 *   2. Cosine similarity on the histogram vectors. Treats palettes
 *      as 512-dimensional vectors; output in [0, 1]. Less sensitive
 *      than JSD to long-tail bins; useful when the dominant colors
 *      align even though minor-bin distributions differ.
 *
 *   3. Top-16 Jaccard. Each account's 16 most-prominent bins; how
 *      many bins appear in BOTH top-16 sets. Coarse but human-
 *      readable; useful as a discrete signal.
 *
 * Algorithm:
 *
 *   - Parse each account's histogram (sparse {bin: count}).
 *   - Build the union of bins as the alignment space.
 *   - Normalize each histogram to a probability distribution.
 *   - Compute JSD via the standard formula:
 *       JSD(P, Q) = 0.5 * KL(P || M) + 0.5 * KL(Q || M),  M = (P+Q)/2
 *   - Compute cosine = dot(P, Q) / (norm(P) * norm(Q)).
 *   - Compute top-16 sets and their Jaccard.
 *
 * Features emitted per pair (always when both accounts have a
 * posted_color_palette_histogram, including the empty case):
 *
 *   color_palette_jsd (numeric, [0, 1]; 0 = identical, 1 = max
 *     divergence)
 *   color_palette_similarity (numeric, [0, 1]; 1 - jsd, friendly
 *     "higher means more alike" companion)
 *   color_palette_cosine (numeric, [0, 1]; alternative metric)
 *   color_palette_top_jaccard (numeric, [0, 1]; Jaccard on top-16
 *     bin sets)
 *   color_palette_top_shared_count (numeric, count of bins in BOTH
 *     top-16 sets)
 *   color_palette_top_shared (json, sorted array of hex strings for
 *     the shared top-K colors; only when non-empty)
 *
 * Determinism: pure arithmetic. Same input always produces same
 * output. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either account missing posted_color_palette_histogram:
 *     returns empty (runner filter handles this).
 *   - Either histogram empty (total = 0): treat as maximally
 *     divergent (jsd = 1, cosine = 0).
 *   - Top-K sets empty: top_jaccard = 0, no shared array.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import { PALETTE_BIN_COUNT, TOP_K_COLORS, binToHex } from './color-palette';

const NAME = 'color_palette_overlap_visual';
const VERSION = '1.0.0';

export class ColorPaletteOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'visual' as const;
  readonly requiredAccountFeatures = ['posted_color_palette_histogram'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const histA = parseHistogram(featuresA, 'posted_color_palette_histogram');
    const histB = parseHistogram(featuresB, 'posted_color_palette_histogram');
    if (!histA || !histB) return [];

    const totalA = histogramTotal(histA);
    const totalB = histogramTotal(histB);

    const cat = 'visual' as const;
    const features: ExtractedFeature[] = [];

    // Degenerate case: one or both histograms empty.
    if (totalA === 0 || totalB === 0) {
      features.push(
        { category: cat, name: 'color_palette_jsd', value: { kind: 'numeric', value: 1 } },
        { category: cat, name: 'color_palette_similarity', value: { kind: 'numeric', value: 0 } },
        { category: cat, name: 'color_palette_cosine', value: { kind: 'numeric', value: 0 } },
        { category: cat, name: 'color_palette_top_jaccard', value: { kind: 'numeric', value: 0 } },
        {
          category: cat,
          name: 'color_palette_top_shared_count',
          value: { kind: 'numeric', value: 0 },
        }
      );
      return features;
    }

    // JSD and cosine on the full histograms.
    const jsd = jensenShannonDivergence(histA, histB, totalA, totalB);
    const cosine = cosineSimilarity(histA, histB);

    // Top-K bin sets.
    const topA = topKBins(histA);
    const topB = topKBins(histB);
    const shared = intersect(topA, topB);
    const topUnion = topA.size + topB.size - shared.size;
    const topJaccard = topUnion > 0 ? shared.size / topUnion : 0;

    features.push(
      { category: cat, name: 'color_palette_jsd', value: { kind: 'numeric', value: jsd } },
      {
        category: cat,
        name: 'color_palette_similarity',
        value: { kind: 'numeric', value: 1 - jsd },
      },
      {
        category: cat,
        name: 'color_palette_cosine',
        value: { kind: 'numeric', value: cosine },
      },
      {
        category: cat,
        name: 'color_palette_top_jaccard',
        value: { kind: 'numeric', value: topJaccard },
      },
      {
        category: cat,
        name: 'color_palette_top_shared_count',
        value: { kind: 'numeric', value: shared.size },
      }
    );

    if (shared.size > 0) {
      // Human-readable: emit the shared bins as hex colors so the
      // attribution reviewer can eyeball the shared palette.
      const sharedHex = [...shared].sort((a, b) => a - b).map(binToHex);
      features.push({
        category: cat,
        name: 'color_palette_top_shared',
        value: { kind: 'json', value: sharedHex },
      });
    }

    return features;
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function parseHistogram(
  features: AccountFeatureMap,
  name: string
): Map<number, number> | null {
  const v = features.get(name);
  if (!v || v.kind !== 'json') return null;
  if (!v.value || typeof v.value !== 'object' || Array.isArray(v.value)) return null;

  const hist = new Map<number, number>();
  for (const [keyStr, valueRaw] of Object.entries(v.value as Record<string, unknown>)) {
    const bin = Number(keyStr);
    if (!Number.isInteger(bin) || bin < 0 || bin >= PALETTE_BIN_COUNT) continue;
    if (typeof valueRaw !== 'number' || !Number.isFinite(valueRaw) || valueRaw <= 0) continue;
    hist.set(bin, valueRaw);
  }
  return hist;
}

function histogramTotal(hist: Map<number, number>): number {
  let total = 0;
  for (const c of hist.values()) total += c;
  return total;
}

// ---------------------------------------------------------------------------
// Similarity metrics
// ---------------------------------------------------------------------------

/**
 * Jensen-Shannon divergence (log base 2) between two histograms,
 * treated as discrete probability distributions after normalization
 * by their respective totals. Output is in [0, 1].
 */
function jensenShannonDivergence(
  a: Map<number, number>,
  b: Map<number, number>,
  totalA: number,
  totalB: number
): number {
  // Build the union of bins as the alignment space.
  const keys = new Set<number>();
  for (const k of a.keys()) keys.add(k);
  for (const k of b.keys()) keys.add(k);

  let klAM = 0;
  let klBM = 0;
  for (const k of keys) {
    const p = (a.get(k) ?? 0) / totalA;
    const q = (b.get(k) ?? 0) / totalB;
    const m = (p + q) / 2;
    if (m <= 0) continue;
    if (p > 0) klAM += p * Math.log2(p / m);
    if (q > 0) klBM += q * Math.log2(q / m);
  }

  const jsd = 0.5 * klAM + 0.5 * klBM;
  // Clamp tiny floating-point negatives or values just above 1.
  return Math.max(0, Math.min(1, jsd));
}

/**
 * Cosine similarity between two sparse histogram vectors. Treats
 * each bin's count as a dimension value; the dot product over the
 * union of bins divided by the L2 norms gives a [0, 1] score.
 *
 * Note that cosine compares directions, not magnitudes; an account
 * with 1000 images and an account with 100 images can score 1.0 if
 * their proportional color distributions match exactly.
 */
function cosineSimilarity(a: Map<number, number>, b: Map<number, number>): number {
  let dot = 0;
  let normASq = 0;
  let normBSq = 0;

  for (const [k, va] of a) {
    normASq += va * va;
    const vb = b.get(k);
    if (vb !== undefined) dot += va * vb;
  }
  for (const vb of b.values()) {
    normBSq += vb * vb;
  }

  const denom = Math.sqrt(normASq) * Math.sqrt(normBSq);
  if (denom === 0) return 0;
  return Math.max(0, Math.min(1, dot / denom));
}

// ---------------------------------------------------------------------------
// Top-K
// ---------------------------------------------------------------------------

function topKBins(hist: Map<number, number>): Set<number> {
  const entries = [...hist.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0] - b[0];
  });
  const out = new Set<number>();
  for (let i = 0; i < Math.min(TOP_K_COLORS, entries.length); i++) {
    out.add(entries[i][0]);
  }
  return out;
}

function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<T>();
  for (const x of small) if (large.has(x)) out.add(x);
  return out;
}

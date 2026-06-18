/**
 * Posted-image overlap pair extractor.
 *
 * Per the methodology paper §4.5.3, this extractor compares the set
 * of posted-image perceptual hashes between two accounts. Operators
 * frequently reuse the same memes, photos, or graphics across
 * sockpuppets (sometimes as exact-byte copies, more often as re-
 * encoded or re-cropped variants); this signal picks up both cases
 * via dHash Hamming distance.
 *
 * The set-level matching problem: traditional Jaccard requires exact
 * set membership, but two perceptually-identical images often have
 * slightly different dHashes due to re-encoding, resize, or minor
 * editing. The pair extractor uses greedy bipartite matching with a
 * Hamming-distance threshold to count fuzzy matches.
 *
 * Greedy bipartite matching:
 *
 *   1. Compute all pairwise Hamming distances between A's hash set
 *      and B's hash set.
 *   2. Filter to pairs with distance <= MATCH_THRESHOLD.
 *   3. Sort candidate pairs by distance ascending.
 *   4. Walk in order, claiming each A-hash and each B-hash at most
 *      once. The first pair to claim a hash wins.
 *
 * This is O(|A| * |B|) for the distance matrix, then O(K log K) for
 * the sort where K is the number of below-threshold pairs. Acceptable
 * for typical seed-set sizes (hundreds of images per account, dozens
 * of accounts).
 *
 * Threshold choice: 8 bits matches the 'near_identical' band defined
 * in dhash.ts. Images within 8 bits are essentially the same image
 * with minor variations. Images within 16 bits are 'similar' but the
 * false-positive rate climbs; 8 is the conservative choice for an
 * attribution signal.
 *
 * Features emitted per pair (always emitted when both accounts have
 * posted_image_dhash_set, including the empty case):
 *
 *   posted_image_count_a (numeric, |A|)
 *   posted_image_count_b (numeric, |B|)
 *   posted_image_exact_match_count (numeric, hashes that appear in
 *     BOTH sets bit-for-bit; strict subset of fuzzy matches)
 *   posted_image_fuzzy_match_count (numeric, greedy bipartite
 *     matches at threshold 8)
 *   posted_image_fuzzy_jaccard (numeric, [0, 1]; matches / (|A| +
 *     |B| - matches))
 *   posted_image_fuzzy_dice (numeric, [0, 1]; 2*matches / (|A| +
 *     |B|); more sensitive to overlap than Jaccard, useful when
 *     one set is much larger)
 *   posted_image_threshold_used (numeric, the Hamming threshold;
 *     recorded for reproducibility in case the default changes)
 *
 * Determinism: pure bit operations and sort. The sort is
 * deterministic (TypeScript's Array.sort is stable since ES2019;
 * tied distances break ties by (a-index, b-index) due to the loop
 * order). Same input always produces same output. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either account missing posted_image_dhash_set: returns empty.
 *   - Both sets empty: emit zero counts and zero similarity. The
 *     null-result is itself a data point.
 *   - One set empty: zero matches, zero Jaccard.
 *   - Sets are very large: O(|A|*|B|) distance matrix could be slow
 *     past a few thousand hashes per account. For seed-set scales
 *     (typical thousands at most) this is fine. If posted-image
 *     corpora ever exceed 10k per account, replace greedy with
 *     locality-sensitive hashing.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import { dhashFromHex, hammingDistance } from './dhash';

const NAME = 'posted_image_overlap_visual';
const VERSION = '1.0.0';

const MATCH_THRESHOLD = 8;

export class PostedImageOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'visual' as const;
  readonly requiredAccountFeatures = [
    'posted_image_dhash_set',
    'posted_image_url_set',
  ] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const setA = parseHashSet(featuresA);
    const setB = parseHashSet(featuresB);
    const urlsA = parseUrlSet(featuresA);
    const urlsB = parseUrlSet(featuresB);
    if ((!setA && !urlsA) || (!setB && !urlsB)) return [];

    const hashA = setA ?? { hexes: new Set(), bigints: [] };
    const hashB = setB ?? { hexes: new Set(), bigints: [] };
    const urlSetA = urlsA ?? new Set<string>();
    const urlSetB = urlsB ?? new Set<string>();

    const exactMatchCount = exactOverlap(hashA.hexes, hashB.hexes);
    const fuzzyMatchCount =
      hashA.bigints.length > 0 && hashB.bigints.length > 0
        ? greedyFuzzyOverlap(hashA.bigints, hashB.bigints, MATCH_THRESHOLD)
        : 0;

    const unionSize = hashA.bigints.length + hashB.bigints.length - fuzzyMatchCount;
    const dicePartner = hashA.bigints.length + hashB.bigints.length;

    const urlOverlap = exactOverlap(urlSetA, urlSetB);
    const urlUnion = urlSetA.size + urlSetB.size - urlOverlap;

    const cat = 'visual' as const;
    return [
      {
        category: cat,
        name: 'posted_image_count_a',
        value: {
          kind: 'numeric',
          value: Math.max(hashA.bigints.length, urlSetA.size),
        },
      },
      {
        category: cat,
        name: 'posted_image_count_b',
        value: {
          kind: 'numeric',
          value: Math.max(hashB.bigints.length, urlSetB.size),
        },
      },
      {
        category: cat,
        name: 'posted_image_exact_match_count',
        value: { kind: 'numeric', value: exactMatchCount },
      },
      {
        category: cat,
        name: 'posted_image_fuzzy_match_count',
        value: { kind: 'numeric', value: fuzzyMatchCount },
      },
      {
        category: cat,
        name: 'posted_image_fuzzy_jaccard',
        value: {
          kind: 'numeric',
          value: unionSize > 0 ? fuzzyMatchCount / unionSize : 0,
        },
      },
      {
        category: cat,
        name: 'posted_image_fuzzy_dice',
        value: {
          kind: 'numeric',
          value: dicePartner > 0 ? (2 * fuzzyMatchCount) / dicePartner : 0,
        },
      },
      {
        category: cat,
        name: 'posted_image_threshold_used',
        value: { kind: 'numeric', value: MATCH_THRESHOLD },
      },
      {
        category: cat,
        name: 'posted_image_url_overlap_count',
        value: { kind: 'numeric', value: urlOverlap },
      },
      {
        category: cat,
        name: 'posted_image_url_jaccard',
        value: {
          kind: 'numeric',
          value: urlUnion > 0 ? urlOverlap / urlUnion : 0,
        },
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface HashSet {
  hexes: Set<string>;
  bigints: bigint[];
}

function parseHashSet(features: AccountFeatureMap): HashSet | null {
  const v = features.get('posted_image_dhash_set');
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;

  const hexes = new Set<string>();
  const bigints: bigint[] = [];
  for (const item of v.value) {
    if (typeof item !== 'string') continue;
    const normalized = item.toLowerCase();
    if (!/^[0-9a-f]{16}$/.test(normalized)) continue;
    if (hexes.has(normalized)) continue;
    try {
      bigints.push(dhashFromHex(normalized));
      hexes.add(normalized);
    } catch {
      // Defensive: skip hashes that fail to parse despite the regex.
    }
  }
  return { hexes, bigints };
}

function parseUrlSet(features: AccountFeatureMap): Set<string> | null {
  const v = features.get('posted_image_url_set');
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;
  const out = new Set<string>();
  for (const item of v.value) {
    if (typeof item === 'string' && item.length > 0) out.add(item);
  }
  return out;
}

function exactOverlap(setA: Set<string>, setB: Set<string>): number {
  const [small, large] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
  let count = 0;
  for (const x of small) if (large.has(x)) count++;
  return count;
}

/**
 * Greedy bipartite fuzzy matching. Returns the count of (A-hash,
 * B-hash) pairs where each side is used at most once and the
 * Hamming distance is at most threshold.
 *
 * Greedy is suboptimal for maximum matching but is deterministic,
 * easy to reason about, and gives results within a constant factor
 * of optimal for the threshold-bounded case. For attribution-signal
 * purposes the exact match count matters less than the order of
 * magnitude.
 */
function greedyFuzzyOverlap(
  hashesA: bigint[],
  hashesB: bigint[],
  threshold: number
): number {
  // Build candidate pairs with distance <= threshold.
  const pairs: Array<{ a: number; b: number; dist: number }> = [];
  for (let i = 0; i < hashesA.length; i++) {
    for (let j = 0; j < hashesB.length; j++) {
      const d = hammingDistance(hashesA[i], hashesB[j]);
      if (d <= threshold) pairs.push({ a: i, b: j, dist: d });
    }
  }

  // Sort by ascending distance; ties broken by (a, b) index order
  // for determinism (the construction loop already produces (a, b)
  // in ascending lexicographic order, so Array.sort's stable
  // behavior preserves it).
  pairs.sort((x, y) => x.dist - y.dist);

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  let matches = 0;
  for (const p of pairs) {
    if (usedA.has(p.a) || usedB.has(p.b)) continue;
    usedA.add(p.a);
    usedB.add(p.b);
    matches++;
  }
  return matches;
}

/**
 * Distribution JSD helper for count dictionaries.
 *
 * The metadata-leakage pair extractors compare count distributions
 * (e.g., {clientApp: count}) between two accounts. To compute Jensen-
 * Shannon divergence, both distributions must be aligned to the same
 * index space and normalized to probability vectors.
 *
 * This helper handles that alignment and normalization, then computes
 * JSD via the standard formula:
 *
 *   JSD(P, Q) = 0.5 * KL(P || M) + 0.5 * KL(Q || M)   where M = (P+Q)/2
 *
 * JSD is bounded in [0, ln(2)] (about 0.693) for natural-log base,
 * or [0, 1] for log-base-2. This helper uses base-2 so the output is
 * in [0, 1], which is the typical convention for distribution
 * comparison.
 *
 * Determinism: pure arithmetic, no randomness, no I/O.
 */

/**
 * Compute Jensen-Shannon divergence (log base 2) between two count
 * distributions represented as dictionaries. Empty distributions
 * (zero total count) are treated as uniform over the union of keys
 * for the purpose of comparison; the helper returns 0 (perfectly
 * similar) when both are empty, and 1 (maximum divergence) when one
 * is empty and the other isn't.
 *
 * Returns a number in [0, 1].
 */
export function dictJensenShannonDivergence(
  a: Record<string, number>,
  b: Record<string, number>
): number {
  const totalA = sumValues(a);
  const totalB = sumValues(b);
  if (totalA === 0 && totalB === 0) return 0;
  if (totalA === 0 || totalB === 0) return 1;

  // Build the aligned key space and probability vectors.
  const keys = new Set<string>();
  for (const k of Object.keys(a)) keys.add(k);
  for (const k of Object.keys(b)) keys.add(k);

  const pA = new Map<string, number>();
  const pB = new Map<string, number>();
  for (const k of keys) {
    pA.set(k, (a[k] ?? 0) / totalA);
    pB.set(k, (b[k] ?? 0) / totalB);
  }

  // M = (P + Q) / 2
  const pM = new Map<string, number>();
  for (const k of keys) {
    pM.set(k, (pA.get(k)! + pB.get(k)!) / 2);
  }

  // KL(P || M) and KL(Q || M), using log base 2 so the result is in
  // [0, 1].
  const klAM = kullbackLeibler(pA, pM);
  const klBM = kullbackLeibler(pB, pM);
  const jsd = 0.5 * klAM + 0.5 * klBM;

  // Clamp tiny negative values from floating-point error.
  return Math.max(0, Math.min(1, jsd));
}

/**
 * Compute the number of distinct keys shared between two dictionaries
 * (i.e., the intersection size of their key sets).
 */
export function dictKeyIntersection(
  a: Record<string, number>,
  b: Record<string, number>
): number {
  const keysA = new Set(Object.keys(a));
  let count = 0;
  for (const k of Object.keys(b)) {
    if (keysA.has(k)) count++;
  }
  return count;
}

/**
 * Compute the size of the union of keys between two dictionaries.
 */
export function dictKeyUnion(
  a: Record<string, number>,
  b: Record<string, number>
): number {
  const keys = new Set<string>();
  for (const k of Object.keys(a)) keys.add(k);
  for (const k of Object.keys(b)) keys.add(k);
  return keys.size;
}

/**
 * Compute Jaccard similarity over the keys of two dictionaries
 * (ignoring the counts). Useful as a "did these distributions
 * touch the same categories" signal, complementary to JSD which
 * is sensitive to the relative weights.
 */
export function dictKeyJaccard(
  a: Record<string, number>,
  b: Record<string, number>
): number {
  const inter = dictKeyIntersection(a, b);
  const union = dictKeyUnion(a, b);
  return union > 0 ? inter / union : 0;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function sumValues(d: Record<string, number>): number {
  let total = 0;
  for (const v of Object.values(d)) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) total += v;
  }
  return total;
}

/**
 * Kullback-Leibler divergence in bits (log base 2). Both inputs
 * must share the same key space.
 *
 *   KL(P || Q) = sum over keys: p_i * log2(p_i / q_i)
 *
 * Following standard convention, contributions where p_i = 0 are
 * treated as 0 (limit case). Contributions where q_i = 0 but p_i > 0
 * are mathematically infinite; this function clamps them to a
 * large finite value to avoid NaN propagation. In practice, the JSD
 * caller ensures q_i (the mixture distribution) is non-zero wherever
 * p_i is non-zero, so this clamp is defensive.
 */
function kullbackLeibler(
  p: Map<string, number>,
  q: Map<string, number>
): number {
  let total = 0;
  for (const [k, pi] of p) {
    if (pi <= 0) continue;
    const qi = q.get(k) ?? 0;
    if (qi <= 0) {
      // p has mass where q does not; mathematically infinite, but
      // this shouldn't occur when q is the (p+r)/2 mixture.
      continue;
    }
    total += pi * Math.log2(pi / qi);
  }
  return total;
}

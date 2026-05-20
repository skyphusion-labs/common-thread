/**
 * Jensen-Shannon divergence over discrete distributions.
 *
 * JSD is symmetric and, with log base 2, bounded in [0, 1]:
 *
 *   M = (P + Q) / 2
 *   JSD(P, Q) = (1/2) KL(P || M) + (1/2) KL(Q || M)
 *
 * where KL is computed in base 2. JSD = 0 means identical distributions;
 * JSD = 1 means disjoint support. The methodology paper uses JSD for
 * temporal cadence comparisons (§4.2.1, §4.2.3) and for character-bigram
 * stylometric comparison (§4.3.1), all on the [0, 1] scale.
 *
 * This helper is shared across the two temporal JSD pair extractors
 * (cadence-jsd over the 168-bin hour-dow joint distribution, and
 * active-hour-jsd over the 24-bin hour marginal). The stylometric
 * jsd-bigrams.ts extractor inlines its own copy of the math because the
 * input shape there is a sparse Map<string, number> over union-keyed
 * support, which has different preprocessing requirements; this helper
 * is for dense, fixed-length numeric vectors only.
 */

/**
 * Renormalize a raw count distribution to probabilities. Returns null if
 * the total is zero (caller should treat as insufficient data).
 */
export function normalizeDistribution(counts: number[]): number[] | null {
  let total = 0;
  for (const c of counts) {
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) return null;
    total += c;
  }
  if (total === 0) return null;
  const result = new Array<number>(counts.length);
  for (let i = 0; i < counts.length; i++) result[i] = counts[i] / total;
  return result;
}

/**
 * Jensen-Shannon divergence with log base 2, output in [0, 1].
 * Assumes P and Q are normalized probability distributions over the same
 * support (same length, both sum to ~1.0 within floating-point tolerance).
 */
export function jensenShannonDivergence(P: number[], Q: number[]): number {
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

/**
 * Find the index where |P[i] - Q[i]| is largest, along with the absolute
 * difference. Returns { index: -1, diff: 0 } if both distributions are
 * empty or all positions tie at zero. Useful for surfacing the most
 * distinguishing bin alongside the aggregate JSD score.
 */
export function maxAbsDiffIndex(
  P: number[],
  Q: number[]
): { index: number; diff: number } {
  if (P.length !== Q.length) {
    throw new Error('maxAbsDiffIndex: P and Q must have the same length');
  }
  let maxIdx = -1;
  let maxDiff = 0;
  for (let i = 0; i < P.length; i++) {
    const d = Math.abs(P[i] - Q[i]);
    if (d > maxDiff) {
      maxDiff = d;
      maxIdx = i;
    }
  }
  return { index: maxIdx, diff: maxDiff };
}

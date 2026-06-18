/**
 * Shared string similarity helpers for §4.1 account-metadata pair extractors.
 * Paper §6.2.1 specifies Levenshtein for display-name/handle distances.
 */

/** Levenshtein edit distance (paper §6.2.1). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

/** Normalized similarity in [0, 1] from edit distance. */
export function normalizedSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/** Character bigram set Jaccard in [0, 1]. */
export function bigramJaccard(a: string, b: string): number {
  const gramsA = charBigrams(normalizeForCompare(a));
  const gramsB = charBigrams(normalizeForCompare(b));
  if (gramsA.size === 0 && gramsB.size === 0) return 1;
  if (gramsA.size === 0 || gramsB.size === 0) return 0;

  let intersection = 0;
  for (const g of gramsA) {
    if (gramsB.has(g)) intersection++;
  }
  const union = gramsA.size + gramsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

export function normalizeForCompare(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

function charBigrams(s: string): Set<string> {
  const out = new Set<string>();
  if (s.length < 2) {
    if (s.length === 1) out.add(s);
    return out;
  }
  for (let i = 0; i < s.length - 1; i++) {
    out.add(s.slice(i, i + 2));
  }
  return out;
}

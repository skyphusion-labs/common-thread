/**
 * Investigation-corpus rarity weights for §6.2.6 cross-platform overlap.
 *
 * Document frequency is computed over seed accounts in the investigation
 * (not a global web prior). Weight for an item present in `df` of `N`
 * accounts:
 *
 *   idf = log((N + 1) / (df + 1)) + 1
 *
 * Rarity-weighted Jaccard for sets A and B:
 *
 *   sum(weight(x) for x in A∩B) / sum(weight(x) for x in A∪B)
 *
 * Items missing from the DF map (should not happen for seed-derived
 * items) fall back to the maximum rarity weight for N accounts
 * (df = 1).
 */

export function idfWeight(documentFrequency: number, corpusSize: number): number {
  const df = Math.max(0, documentFrequency);
  const n = Math.max(1, corpusSize);
  return Math.log((n + 1) / (df + 1)) + 1;
}

export function rarityWeightedJaccard(
  setA: ReadonlySet<string>,
  setB: ReadonlySet<string>,
  documentFrequency: ReadonlyMap<string, number>,
  corpusSize: number
): number {
  if (setA.size === 0 && setB.size === 0) return 0;

  let interWeight = 0;
  let unionWeight = 0;
  const seen = new Set<string>();

  for (const item of setA) {
    const w = idfWeight(documentFrequency.get(item) ?? 1, corpusSize);
    unionWeight += w;
    seen.add(item);
    if (setB.has(item)) interWeight += w;
  }
  for (const item of setB) {
    if (seen.has(item)) continue;
    unionWeight += idfWeight(documentFrequency.get(item) ?? 1, corpusSize);
  }

  return unionWeight > 0 ? interWeight / unionWeight : 0;
}

/**
 * Build per-item document frequency: how many seed accounts contain
 * the item at least once.
 */
export function buildDocumentFrequency(
  accountItemSets: ReadonlyArray<ReadonlySet<string>>
): { corpusSize: number; documentFrequency: Map<string, number> } {
  const documentFrequency = new Map<string, number>();
  for (const items of accountItemSets) {
    for (const item of items) {
      documentFrequency.set(item, (documentFrequency.get(item) ?? 0) + 1);
    }
  }
  return { corpusSize: accountItemSets.length, documentFrequency };
}

/** Lowercase alphanumeric tokens of length ≥ 3 (bio text rarity). */
export function tokenizeBio(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z0-9]+/g) ?? []) {
    if (raw.length >= 3) out.add(raw);
  }
  return out;
}

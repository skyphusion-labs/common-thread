/**
 * Background-weighted TF-IDF term overlap and novelty n-gram overlap (§4.3.2–3).
 *
 * buildContext loads background_doc_count / background_term_df /
 * background_ngram_df from a control (or any) account via
 * contextAccountFeatures, then extract() compares seed pairs using
 * rarity-weighted distinctive vocabulary and novelty n-grams.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const TOP_N = 100;
const TOP_SHARED = 25;

interface BackgroundNoveltyContext {
  docCount: number;
  termDf: Record<string, number>;
  ngramDf: Record<string, number>;
  controlAccounts: Set<string>;
  /** Per-account top background-weighted terms (for overlap). */
  topTerms: Map<string, Map<string, number>>;
  /** Per-account novelty-weighted n-grams. */
  topNgrams: Map<string, Map<string, number>>;
}

export class BackgroundNoveltyPairExtractor implements PairFeatureExtractor {
  readonly name = 'background_novelty_stylometric';
  readonly version = '1.0.0';
  readonly category = 'stylometric' as const;
  readonly requiredAccountFeatures = ['account_term_tf'] as const;
  readonly contextAccountFeatures = [
    'background_doc_count',
    'background_term_df',
    'background_ngram_df',
    'account_ngram_tf',
  ] as const;

  buildContext(
    seedAccounts: ReadonlyArray<{
      account: string;
      features: AccountFeatureMap;
      isControl?: boolean;
    }>
  ): PairContext {
    const controlAccounts = new Set(
      seedAccounts.filter((a) => a.isControl).map((a) => a.account)
    );

    let docCount = 0;
    let termDf: Record<string, number> = {};
    let ngramDf: Record<string, number> = {};

    // Prefer control accounts for background; else any account that has it.
    const bgSource =
      seedAccounts.find(
        (a) => a.isControl && a.features.has('background_doc_count')
      ) ?? seedAccounts.find((a) => a.features.has('background_doc_count'));

    if (bgSource) {
      const n = getNumeric(bgSource.features, 'background_doc_count');
      const tdf = getCountDict(bgSource.features, 'background_term_df');
      const ndf = getCountDict(bgSource.features, 'background_ngram_df');
      if (n !== null && n > 0 && tdf) {
        docCount = n;
        termDf = tdf;
        ngramDf = ndf ?? {};
      }
    }

    const topTerms = new Map<string, Map<string, number>>();
    const topNgrams = new Map<string, Map<string, number>>();

    if (docCount > 0) {
      for (const acct of seedAccounts) {
        if (acct.isControl) continue;
        const tf = getCountDict(acct.features, 'account_term_tf');
        if (tf) {
          topTerms.set(
            acct.account,
            topWeighted(tf, termDf, docCount, TOP_N)
          );
        }
        const ntf = getCountDict(acct.features, 'account_ngram_tf');
        if (ntf) {
          topNgrams.set(
            acct.account,
            topWeighted(ntf, ngramDf, docCount, TOP_N)
          );
        }
      }
    }

    const ctx: BackgroundNoveltyContext = {
      docCount,
      termDf,
      ngramDf,
      controlAccounts,
      topTerms,
      topNgrams,
    };
    return ctx;
  }

  extract(
    accountA: string,
    accountB: string,
    _featuresA: AccountFeatureMap,
    _featuresB: AccountFeatureMap,
    context?: PairContext
  ): ExtractedFeature[] {
    const ctx = context as BackgroundNoveltyContext | undefined;
    if (!ctx || ctx.docCount <= 0) return [];
    if (ctx.controlAccounts.has(accountA) || ctx.controlAccounts.has(accountB)) {
      return [];
    }

    const termsA = ctx.topTerms.get(accountA);
    const termsB = ctx.topTerms.get(accountB);
    const ngramsA = ctx.topNgrams.get(accountA);
    const ngramsB = ctx.topNgrams.get(accountB);

    if (!termsA && !termsB && !ngramsA && !ngramsB) return [];

    const features: ExtractedFeature[] = [];

    if (termsA && termsB) {
      const { overlapCount, weightedOverlap, jaccard, shared } =
        weightedOverlapStats(termsA, termsB);
      features.push(
        {
          category: 'stylometric',
          name: 'background_tfidf_term_overlap_count',
          value: { kind: 'numeric', value: overlapCount },
        },
        {
          category: 'stylometric',
          name: 'background_tfidf_term_weighted_overlap',
          value: { kind: 'numeric', value: weightedOverlap },
        },
        {
          category: 'stylometric',
          name: 'background_tfidf_term_jaccard',
          value: { kind: 'numeric', value: jaccard },
        }
      );
      if (shared.length > 0) {
        features.push({
          category: 'stylometric',
          name: 'shared_background_tfidf_terms',
          value: { kind: 'json', value: shared.slice(0, TOP_SHARED) },
        });
      }
    }

    if (ngramsA && ngramsB) {
      const { overlapCount, weightedOverlap, jaccard, shared } =
        weightedOverlapStats(ngramsA, ngramsB);
      features.push(
        {
          category: 'stylometric',
          name: 'novelty_ngram_overlap_count',
          value: { kind: 'numeric', value: overlapCount },
        },
        {
          category: 'stylometric',
          name: 'novelty_ngram_weighted_overlap',
          value: { kind: 'numeric', value: weightedOverlap },
        },
        {
          category: 'stylometric',
          name: 'novelty_ngram_jaccard',
          value: { kind: 'numeric', value: jaccard },
        }
      );
      if (shared.length > 0) {
        features.push({
          category: 'stylometric',
          name: 'shared_novelty_ngrams',
          value: { kind: 'json', value: shared.slice(0, TOP_SHARED) },
        });
      }
    }

    return features;
  }
}

/** idf = log((N+1)/(df+1)) + 1; score = tf * idf. Prefer rare background terms. */
export function topWeighted(
  tf: Record<string, number>,
  df: Record<string, number>,
  docCount: number,
  topN: number
): Map<string, number> {
  const scored: Array<[string, number]> = [];
  for (const [term, f] of Object.entries(tf)) {
    if (typeof f !== 'number' || f <= 0) continue;
    const d = df[term] ?? 0;
    const idf = Math.log((docCount + 1) / (d + 1)) + 1;
    scored.push([term, f * idf]);
  }
  scored.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const out = new Map<string, number>();
  for (const [t, s] of scored.slice(0, topN)) out.set(t, s);
  return out;
}

function weightedOverlapStats(
  a: Map<string, number>,
  b: Map<string, number>
): {
  overlapCount: number;
  weightedOverlap: number;
  jaccard: number;
  shared: string[];
} {
  const shared: Array<{ term: string; weight: number }> = [];
  for (const [term, wa] of a) {
    const wb = b.get(term);
    if (wb === undefined) continue;
    shared.push({ term, weight: Math.min(wa, wb) });
  }
  shared.sort((x, y) => y.weight - x.weight || x.term.localeCompare(y.term));
  const overlapCount = shared.length;
  const weightedOverlap = shared.reduce((s, x) => s + x.weight, 0);
  const union = new Set([...a.keys(), ...b.keys()]);
  const jaccard = union.size > 0 ? overlapCount / union.size : 0;
  return {
    overlapCount,
    weightedOverlap,
    jaccard,
    shared: shared.map((x) => x.term),
  };
}

function getNumeric(features: AccountFeatureMap, name: string): number | null {
  const v = features.get(name);
  if (!v || v.kind !== 'numeric') return null;
  if (typeof v.value !== 'number' || !Number.isFinite(v.value)) return null;
  return v.value;
}

function getCountDict(
  features: AccountFeatureMap,
  name: string
): Record<string, number> | null {
  const v = features.get(name);
  if (!v || v.kind !== 'json') return null;
  if (!v.value || typeof v.value !== 'object' || Array.isArray(v.value)) {
    return null;
  }
  const out: Record<string, number> = {};
  for (const [k, c] of Object.entries(v.value as Record<string, unknown>)) {
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) return null;
    out[k] = c;
  }
  if (Object.keys(out).length === 0) return null;
  return out;
}

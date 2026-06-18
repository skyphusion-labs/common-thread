/**
 * Pair overlap on distinctive terms and rare phrase n-grams (§4.3.2–3).
 */

import type { PairFeatureExtractor, AccountFeatureMap } from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'topic_phrase_overlap_stylometric';
const VERSION = '1.0.0';

export class TopicPhraseOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'stylometric' as const;
  readonly requiredAccountFeatures = [
    'distinctive_terms_top50',
    'rare_phrase_ngrams_top100',
  ] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap
  ): ExtractedFeature[] {
    const termsA = parseTerms(featuresA.get('distinctive_terms_top50'));
    const termsB = parseTerms(featuresB.get('distinctive_terms_top50'));
    const ngramsA = parseNgrams(featuresA.get('rare_phrase_ngrams_top100'));
    const ngramsB = parseNgrams(featuresB.get('rare_phrase_ngrams_top100'));

    if (termsA.size === 0 && termsB.size === 0 && ngramsA.size === 0 && ngramsB.size === 0) {
      return [];
    }

    const termIntersection = intersectSets(termsA, termsB);
    const termUnion = unionSize(termsA, termsB);
    const ngramIntersection = intersectSets(ngramsA, ngramsB);
    const ngramUnion = unionSize(ngramsA, ngramsB);

    return [
      {
        category: 'stylometric',
        name: 'distinctive_term_overlap_count',
        value: { kind: 'numeric', value: termIntersection.size },
      },
      {
        category: 'stylometric',
        name: 'distinctive_term_overlap_jaccard',
        value: {
          kind: 'numeric',
          value: termUnion > 0 ? termIntersection.size / termUnion : 0,
        },
      },
      {
        category: 'stylometric',
        name: 'shared_phrase_ngram_count',
        value: { kind: 'numeric', value: ngramIntersection.size },
      },
      {
        category: 'stylometric',
        name: 'phrase_ngram_overlap_jaccard',
        value: {
          kind: 'numeric',
          value: ngramUnion > 0 ? ngramIntersection.size / ngramUnion : 0,
        },
      },
      ...(termIntersection.size > 0
        ? [
            {
              category: 'stylometric' as const,
              name: 'shared_distinctive_terms',
              value: { kind: 'json' as const, value: [...termIntersection].sort() },
            },
          ]
        : []),
      ...(ngramIntersection.size > 0
        ? [
            {
              category: 'stylometric' as const,
              name: 'shared_phrase_ngrams',
              value: { kind: 'json' as const, value: [...ngramIntersection].sort() },
            },
          ]
        : []),
    ];
  }
}

function parseTerms(value: import('../../schema/db-types').FeatureValue | undefined): Set<string> {
  const out = new Set<string>();
  if (!value || value.kind !== 'json' || !Array.isArray(value.value)) return out;
  for (const item of value.value) {
    if (typeof item === 'string') out.add(item);
    else if (item && typeof item === 'object' && typeof (item as { term?: string }).term === 'string') {
      out.add((item as { term: string }).term);
    }
  }
  return out;
}

function parseNgrams(value: import('../../schema/db-types').FeatureValue | undefined): Set<string> {
  const out = new Set<string>();
  if (!value || value.kind !== 'json' || !Array.isArray(value.value)) return out;
  for (const item of value.value) {
    if (typeof item === 'string' && item.length > 0) out.add(item);
  }
  return out;
}

function intersectSets(a: Set<string>, b: Set<string>): Set<string> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<string>();
  for (const x of small) if (large.has(x)) out.add(x);
  return out;
}

function unionSize(a: Set<string>, b: Set<string>): number {
  const merged = new Set(a);
  for (const x of b) merged.add(x);
  return merged.size;
}

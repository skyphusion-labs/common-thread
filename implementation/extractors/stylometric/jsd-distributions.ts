/**
 * Pairwise Jensen-Shannon divergence on stylometric distributions (§6.2.3).
 *
 * Account extractors emit:
 *   - sentence_length_distribution (dense 20-bin count vector)
 *   - punctuation_distribution (count dict of major marks)
 *   - capitalization_distribution (count dict: lower / capitalized)
 *
 * Each pair extractor compares one distribution across two accounts and
 * emits a numeric JSD in [0, 1] (log base 2). Missing features on either
 * side yield no rows (insufficient data).
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import {
  normalizeDistribution,
  jensenShannonDivergence,
} from '../temporal/jsd';
import { dictJensenShannonDivergence } from '../metadata-leakage/distribution-jsd';
import { SENTENCE_LENGTH_BIN_COUNT } from './text-helpers';

function getJsonArray(features: AccountFeatureMap, name: string): number[] | null {
  const v = features.get(name);
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;
  const arr = v.value as unknown[];
  if (arr.length !== SENTENCE_LENGTH_BIN_COUNT) return null;
  const out: number[] = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const n = arr[i];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null;
    out[i] = n;
  }
  return out;
}

function getJsonCountDict(
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

export class JsdSentenceLengthExtractor implements PairFeatureExtractor {
  readonly name = 'jsd_sentence_length_stylometric';
  readonly version = '1.0.0';
  readonly category = 'stylometric' as const;
  readonly requiredAccountFeatures = ['sentence_length_distribution'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const a = getJsonArray(featuresA, 'sentence_length_distribution');
    const b = getJsonArray(featuresB, 'sentence_length_distribution');
    if (!a || !b) return [];
    const p = normalizeDistribution(a);
    const q = normalizeDistribution(b);
    if (!p || !q) return [];
    return [
      {
        category: 'stylometric',
        name: 'jsd_sentence_length',
        value: { kind: 'numeric', value: jensenShannonDivergence(p, q) },
      },
    ];
  }
}

export class JsdPunctuationExtractor implements PairFeatureExtractor {
  readonly name = 'jsd_punctuation_stylometric';
  readonly version = '1.0.0';
  readonly category = 'stylometric' as const;
  readonly requiredAccountFeatures = ['punctuation_distribution'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const a = getJsonCountDict(featuresA, 'punctuation_distribution');
    const b = getJsonCountDict(featuresB, 'punctuation_distribution');
    if (!a || !b) return [];
    return [
      {
        category: 'stylometric',
        name: 'jsd_punctuation',
        value: { kind: 'numeric', value: dictJensenShannonDivergence(a, b) },
      },
    ];
  }
}

export class JsdCapitalizationExtractor implements PairFeatureExtractor {
  readonly name = 'jsd_capitalization_stylometric';
  readonly version = '1.0.0';
  readonly category = 'stylometric' as const;
  readonly requiredAccountFeatures = ['capitalization_distribution'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const a = getJsonCountDict(featuresA, 'capitalization_distribution');
    const b = getJsonCountDict(featuresB, 'capitalization_distribution');
    if (!a || !b) return [];
    return [
      {
        category: 'stylometric',
        name: 'jsd_capitalization',
        value: { kind: 'numeric', value: dictJensenShannonDivergence(a, b) },
      },
    ];
  }
}

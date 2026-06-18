/**
 * Display name, handle, and bio similarity pair extractor (§4.1.2).
 *
 * Pairwise Levenshtein distances and normalized similarities on display
 * name, username, and bio; bio bigram Jaccard as a lightweight n-gram
 * overlap signal.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import {
  bigramJaccard,
  levenshtein,
  normalizeForCompare,
  normalizedSimilarity,
} from './text-similarity';

const NAME = 'display_name_bio_similarity_account_metadata';
const VERSION = '1.0.0';

export class DisplayNameBioSimilarityExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'account_metadata' as const;
  readonly requiredAccountFeatures = ['display_name', 'username', 'bio'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const displayA = readText(featuresA, 'display_name');
    const displayB = readText(featuresB, 'display_name');
    const userA = readText(featuresA, 'username');
    const userB = readText(featuresB, 'username');
    const bioA = readText(featuresA, 'bio');
    const bioB = readText(featuresB, 'bio');

    if (!displayA || !displayB || !userA || !userB || bioA === null || bioB === null) {
      return [];
    }

    const cat = 'account_metadata' as const;
    const normDisplayA = normalizeForCompare(displayA);
    const normDisplayB = normalizeForCompare(displayB);
    const normUserA = normalizeForCompare(userA.replace(/^@/, ''));
    const normUserB = normalizeForCompare(userB.replace(/^@/, ''));
    const normBioA = normalizeForCompare(bioA);
    const normBioB = normalizeForCompare(bioB);

    return [
      {
        category: cat,
        name: 'display_name_edit_distance',
        value: { kind: 'numeric', value: levenshtein(normDisplayA, normDisplayB) },
      },
      {
        category: cat,
        name: 'display_name_similarity',
        value: {
          kind: 'numeric',
          value: normalizedSimilarity(normDisplayA, normDisplayB),
        },
      },
      {
        category: cat,
        name: 'username_edit_distance',
        value: { kind: 'numeric', value: levenshtein(normUserA, normUserB) },
      },
      {
        category: cat,
        name: 'username_similarity',
        value: { kind: 'numeric', value: normalizedSimilarity(normUserA, normUserB) },
      },
      {
        category: cat,
        name: 'bio_edit_distance',
        value: { kind: 'numeric', value: levenshtein(normBioA, normBioB) },
      },
      {
        category: cat,
        name: 'bio_similarity',
        value: { kind: 'numeric', value: normalizedSimilarity(normBioA, normBioB) },
      },
      {
        category: cat,
        name: 'bio_bigram_jaccard',
        value: { kind: 'numeric', value: bigramJaccard(normBioA, normBioB) },
      },
    ];
  }
}

function readText(features: AccountFeatureMap, name: string): string | null {
  const v = features.get(name);
  if (!v || v.kind !== 'text') return null;
  return v.value;
}

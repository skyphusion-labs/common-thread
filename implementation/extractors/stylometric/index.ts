/**
 * Stylometric extractor registry.
 *
 * Account-level extractors produce per-account stylometric features
 * (function-word vectors, character-bigram distributions, lexical
 * richness, sentence shape). Pair extractors consume those account
 * features and produce per-pair stylometric features (Burrows' Delta,
 * Jensen-Shannon divergence over bigrams).
 */

import { TwitterStylometricExtractor } from './twitter';
import { BurrowsDeltaExtractor } from './burrows-delta';
import { JsdCharacterBigramsExtractor } from './jsd-bigrams';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const STYLOMETRIC_EXTRACTORS: AccountFeatureExtractor[] = [
  new TwitterStylometricExtractor(),
  // Future:
  // new RedditStylometricExtractor(),
  // new BlueskyStylometricExtractor(),
];

export const STYLOMETRIC_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new BurrowsDeltaExtractor(),
  new JsdCharacterBigramsExtractor(),
];

export { TwitterStylometricExtractor } from './twitter';
export { BurrowsDeltaExtractor } from './burrows-delta';
export { JsdCharacterBigramsExtractor } from './jsd-bigrams';
export {
  FUNCTION_WORDS_150,
  FUNCTION_WORD_INDEX,
  FUNCTION_WORD_VECTOR_LENGTH,
} from './function-words';

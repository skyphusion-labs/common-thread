/**
 * Stylometric extractor registry.
 *
 * Paper §4.3 "linguistic" signals; feature category name is
 * `stylometric` in the signal table (see paper §4.3 terminology note).
 *
 * Account-level extractors produce per-account stylometric features
 * (function-word vectors, character-bigram distributions, lexical
 * richness, sentence shape, character ratios, platform aggregates).
 * Twitter and Reddit extractors emit identical feature names where
 * signals match, so pair extractors operate cross-platform.
 *
 * Pair extractors consume those account features and produce per-pair
 * stylometric features: Burrows' Delta on function_word_frequencies
 * (§4.3.1), Jensen-Shannon divergence on character_bigram_top50
 * (§4.3.1 character-level companion), JSD on sentence-length /
 * punctuation / capitalization distributions (§6.2.3), and register /
 * code-switch pattern comparisons (§4.3.4).
 *
 * Shared text-processing math lives in text-helpers.ts; platform-
 * specific parsing and cleaning stays in each per-platform file.
 */

import { TwitterStylometricExtractor } from './twitter';
import { RedditStylometricExtractor } from './reddit';
import { InstagramStylometricExtractor } from './instagram';
import { BurrowsDeltaExtractor } from './burrows-delta';
import { JsdCharacterBigramsExtractor } from './jsd-bigrams';
import {
  JsdSentenceLengthExtractor,
  JsdPunctuationExtractor,
  JsdCapitalizationExtractor,
} from './jsd-distributions';
import { TwitterTopicPhraseExtractor } from './topic-phrase';
import { TopicPhraseOverlapExtractor } from './topic-phrase-overlap';
import { TwitterCodeSwitchingExtractor } from './code-switching';
import {
  RegisterPatternPairExtractor,
  CodeSwitchPatternPairExtractor,
} from './code-switching-pair';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const STYLOMETRIC_EXTRACTORS: AccountFeatureExtractor[] = [
  new TwitterStylometricExtractor(),
  new RedditStylometricExtractor(),
  new InstagramStylometricExtractor(),
  new TwitterTopicPhraseExtractor(),
  new TwitterCodeSwitchingExtractor(),
  // Future:
  // new BlueskyStylometricExtractor(),
  // new MastodonStylometricExtractor(),
];

export const STYLOMETRIC_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new BurrowsDeltaExtractor(),
  new JsdCharacterBigramsExtractor(),
  new JsdSentenceLengthExtractor(),
  new JsdPunctuationExtractor(),
  new JsdCapitalizationExtractor(),
  new TopicPhraseOverlapExtractor(),
  new RegisterPatternPairExtractor(),
  new CodeSwitchPatternPairExtractor(),
];

export { TwitterStylometricExtractor } from './twitter';
export { RedditStylometricExtractor } from './reddit';
export { InstagramStylometricExtractor } from './instagram';
export { BurrowsDeltaExtractor } from './burrows-delta';
export { JsdCharacterBigramsExtractor } from './jsd-bigrams';
export { TwitterCodeSwitchingExtractor } from './code-switching';
export {
  RegisterPatternPairExtractor,
  CodeSwitchPatternPairExtractor,
} from './code-switching-pair';
export {
  JsdSentenceLengthExtractor,
  JsdPunctuationExtractor,
  JsdCapitalizationExtractor,
} from './jsd-distributions';
export {
  FUNCTION_WORDS_150,
  FUNCTION_WORD_INDEX,
  FUNCTION_WORD_VECTOR_LENGTH,
} from './function-words';
export {
  tokenize,
  splitSentences,
  computeCharBigrams,
  shannonEntropyFromMap,
  computeCharacterRatios,
  countMatches,
  median,
} from './text-helpers';

/**
 * Shared stylometric feature computation from pre-cleaned post metrics.
 */

import type { ExtractedFeature } from '../types';
import {
  FUNCTION_WORD_INDEX,
  FUNCTION_WORD_VECTOR_LENGTH,
} from './function-words';
import {
  tokenize,
  splitSentences,
  computeCharBigrams,
  shannonEntropyFromMap,
  computeCharacterRatios,
  median,
} from './text-helpers';
import { withRecentSuffix } from './windowing';
import { shortenerAccountFeatures } from '../metadata-leakage/shortener';

export interface PostStylometryInput {
  rawText: string;
  cleanedText: string;
  charLength: number;
  tokenLength: number;
  hashtagCount: number;
  mentionCount: number;
  emojiCount: number;
  urlCount: number;
}

export interface BuildStylometricFeaturesOptions {
  /** When set, stylometric feature names get a `_recent` suffix (§6.4.4). */
  recentWindow?: boolean;
  /** Include content_artifacts posted_urls (full window only). */
  includePostedUrls?: boolean;
  postedUrls?: Set<string>;
}

function featureName(base: string, recentWindow: boolean): string {
  return recentWindow ? withRecentSuffix(base) : base;
}

export function buildStylometricFeatures(
  posts: PostStylometryInput[],
  options: BuildStylometricFeaturesOptions = {}
): ExtractedFeature[] {
  if (posts.length === 0) return [];

  const recent = options.recentWindow ?? false;
  const rawTexts = posts.map((p) => p.rawText);
  const cleanedTexts = posts.map((p) => p.cleanedText);
  const corpus = cleanedTexts.join(' ');
  const tokens = tokenize(corpus);
  if (tokens.length === 0) return [];

  const features: ExtractedFeature[] = [];
  const cat = 'stylometric' as const;
  const totalTokens = tokens.length;

  const fwCounts = new Array(FUNCTION_WORD_VECTOR_LENGTH).fill(0) as number[];
  let fwTotal = 0;
  for (const tok of tokens) {
    const idx = FUNCTION_WORD_INDEX.get(tok);
    if (idx !== undefined) {
      fwCounts[idx]++;
      fwTotal++;
    }
  }
  const fwFreq = fwCounts.map((c) => c / totalTokens);

  features.push({
    category: cat,
    name: featureName('function_word_frequencies', recent),
    value: { kind: 'json', value: fwFreq },
  });
  features.push({
    category: cat,
    name: featureName('function_word_total', recent),
    value: { kind: 'numeric', value: fwTotal },
  });
  features.push({
    category: cat,
    name: featureName('function_word_ratio', recent),
    value: { kind: 'numeric', value: fwTotal / totalTokens },
  });

  const bigramCounts = computeCharBigrams(corpus);
  const bigramTotal = Array.from(bigramCounts.values()).reduce((s, x) => s + x, 0);
  const top50 = Array.from(bigramCounts.entries())
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, 50);
  const top50Map: Record<string, number> = {};
  for (const [bg, count] of top50) top50Map[bg] = count;

  features.push({
    category: cat,
    name: featureName('character_bigram_top50', recent),
    value: { kind: 'json', value: top50Map },
  });
  features.push({
    category: cat,
    name: featureName('character_bigram_entropy', recent),
    value: { kind: 'numeric', value: shannonEntropyFromMap(bigramCounts, bigramTotal) },
  });

  const typeCounts = new Map<string, number>();
  for (const tok of tokens) {
    typeCounts.set(tok, (typeCounts.get(tok) ?? 0) + 1);
  }
  const typeCount = typeCounts.size;
  let hapaxCount = 0;
  for (const c of typeCounts.values()) {
    if (c === 1) hapaxCount++;
  }

  features.push({
    category: cat,
    name: featureName('token_count', recent),
    value: { kind: 'numeric', value: totalTokens },
  });
  features.push({
    category: cat,
    name: featureName('type_count', recent),
    value: { kind: 'numeric', value: typeCount },
  });
  features.push({
    category: cat,
    name: featureName('type_token_ratio', recent),
    value: { kind: 'numeric', value: typeCount / totalTokens },
  });
  features.push({
    category: cat,
    name: featureName('hapax_legomena_count', recent),
    value: { kind: 'numeric', value: hapaxCount },
  });
  features.push({
    category: cat,
    name: featureName('hapax_legomena_ratio', recent),
    value: { kind: 'numeric', value: hapaxCount / totalTokens },
  });

  const wordLengths = tokens.map((t) => t.length).sort((a, b) => a - b);
  features.push({
    category: cat,
    name: featureName('mean_word_length', recent),
    value: { kind: 'numeric', value: wordLengths.reduce((s, x) => s + x, 0) / wordLengths.length },
  });
  features.push({
    category: cat,
    name: featureName('median_word_length', recent),
    value: { kind: 'numeric', value: median(wordLengths) },
  });

  const sentences = splitSentences(corpus);
  if (sentences.length > 0) {
    const sentLengths = sentences.map((s) => tokenize(s).length).filter((n) => n > 0);
    if (sentLengths.length > 0) {
      const sortedSentLens = [...sentLengths].sort((a, b) => a - b);
      const meanSent = sentLengths.reduce((s, x) => s + x, 0) / sentLengths.length;
      const variance =
        sentLengths.reduce((s, x) => s + (x - meanSent) ** 2, 0) / sentLengths.length;
      features.push({
        category: cat,
        name: featureName('sentence_count', recent),
        value: { kind: 'numeric', value: sentLengths.length },
      });
      features.push({
        category: cat,
        name: featureName('mean_sentence_length', recent),
        value: { kind: 'numeric', value: meanSent },
      });
      features.push({
        category: cat,
        name: featureName('median_sentence_length', recent),
        value: { kind: 'numeric', value: median(sortedSentLens) },
      });
      features.push({
        category: cat,
        name: featureName('sentence_length_stdev', recent),
        value: { kind: 'numeric', value: Math.sqrt(variance) },
      });
    }
  }

  const allRawText = rawTexts.join(' ');
  const charRatios = computeCharacterRatios(allRawText);
  features.push({
    category: cat,
    name: featureName('uppercase_ratio', recent),
    value: { kind: 'numeric', value: charRatios.uppercase },
  });
  features.push({
    category: cat,
    name: featureName('digit_ratio', recent),
    value: { kind: 'numeric', value: charRatios.digit },
  });
  features.push({
    category: cat,
    name: featureName('punctuation_ratio', recent),
    value: { kind: 'numeric', value: charRatios.punctuation },
  });

  const postCount = rawTexts.length;
  const sum = (vals: number[]) => vals.reduce((s, x) => s + x, 0);
  features.push({
    category: cat,
    name: featureName('post_count', recent),
    value: { kind: 'numeric', value: postCount },
  });
  features.push({
    category: cat,
    name: featureName('avg_post_length_chars', recent),
    value: { kind: 'numeric', value: sum(posts.map((p) => p.charLength)) / postCount },
  });
  features.push({
    category: cat,
    name: featureName('avg_post_length_tokens', recent),
    value: { kind: 'numeric', value: sum(posts.map((p) => p.tokenLength)) / postCount },
  });
  features.push({
    category: cat,
    name: featureName('hashtag_per_post_mean', recent),
    value: { kind: 'numeric', value: sum(posts.map((p) => p.hashtagCount)) / postCount },
  });
  features.push({
    category: cat,
    name: featureName('mention_per_post_mean', recent),
    value: { kind: 'numeric', value: sum(posts.map((p) => p.mentionCount)) / postCount },
  });
  features.push({
    category: cat,
    name: featureName('emoji_per_post_mean', recent),
    value: { kind: 'numeric', value: sum(posts.map((p) => p.emojiCount)) / postCount },
  });
  features.push({
    category: cat,
    name: featureName('url_per_post_mean', recent),
    value: { kind: 'numeric', value: sum(posts.map((p) => p.urlCount)) / postCount },
  });

  if (options.includePostedUrls && options.postedUrls) {
    features.push({
      category: 'content_artifacts',
      name: 'posted_urls',
      value: { kind: 'json', value: [...options.postedUrls].sort() },
    });
    features.push({
      category: 'content_artifacts',
      name: 'posted_urls_unique_count',
      value: { kind: 'numeric', value: options.postedUrls.size },
    });
    // §4.7.4 link shortener fingerprints (metadata_leakage).
    features.push(...shortenerAccountFeatures(options.postedUrls));
  }

  return features;
}

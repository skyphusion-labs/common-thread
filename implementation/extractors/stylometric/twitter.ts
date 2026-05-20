/**
 * Twitter stylometric account features extractor.
 *
 * Reads a timeline artifact and emits account-level stylometric
 * features in the 'stylometric' category. These features are the
 * inputs to Burrows' Delta and JSD-on-character-bigrams (the pair-
 * level computations in §4.3 of the methodology paper).
 *
 * Features produced:
 *
 *   Word-level stylometry:
 *     function_word_frequencies (json, 150-element vector of rel freq),
 *     function_word_total, function_word_ratio
 *
 *   Character-level stylometry:
 *     character_bigram_top50 (json, top 50 bigrams with counts),
 *     character_bigram_entropy
 *
 *   Lexical richness:
 *     token_count, type_count, type_token_ratio,
 *     hapax_legomena_count, hapax_legomena_ratio
 *
 *   Word and sentence shape:
 *     mean_word_length, median_word_length,
 *     sentence_count, mean_sentence_length, median_sentence_length,
 *     sentence_length_stdev
 *
 *   Character ratios:
 *     uppercase_ratio, digit_ratio, punctuation_ratio
 *
 *   Twitter-specific:
 *     post_count, avg_post_length_chars, avg_post_length_tokens,
 *     hashtag_per_post_mean, mention_per_post_mean,
 *     emoji_per_post_mean, url_per_post_mean
 *
 * Determinism: same input bytes produce the same output. Platform-
 * agnostic text math lives in text-helpers.ts; this file holds only
 * the Twitter-specific parsing and cleaning.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import {
  FUNCTION_WORDS_150,
  FUNCTION_WORD_INDEX,
  FUNCTION_WORD_VECTOR_LENGTH,
} from './function-words';
import {
  tokenize,
  splitSentences,
  computeCharBigrams,
  shannonEntropyFromMap,
  computeCharacterRatios,
  countMatches,
  median,
} from './text-helpers';

const NAME = 'stylometric_twitter';
const VERSION = '1.0.0';

interface TwitterPost {
  createdAt?: string;
  created_at?: string;
  text?: string;
  full_text?: string;
}

export class TwitterStylometricExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();

    if (
      tool.includes('timeline') ||
      tool.includes('tweets') ||
      tool.includes('posts')
    ) {
      return true;
    }
    if (
      source.includes('/timeline') ||
      source.includes('/tweets') ||
      source.includes('/user_timeline')
    ) {
      return true;
    }

    if (tool.includes('twitter') || tool.includes('x-com')) return true;
    if (source.includes('twitter.com') || source.includes('x.com')) return true;

    return false;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = tryParseTimeline(input.bytes);
    if (!posts || posts.length === 0) return [];

    // Extract post texts (handle RT prefix removal)
    const rawTexts = posts
      .map(p => p.full_text ?? p.text ?? '')
      .filter(t => t.length > 0)
      .map(stripRetweetPrefix);

    if (rawTexts.length === 0) return [];

    // Per-post counts for Twitter-specific features
    const hashtagCounts: number[] = [];
    const mentionCounts: number[] = [];
    const emojiCounts: number[] = [];
    const urlCounts: number[] = [];
    const charLengths: number[] = [];
    const tokenLengths: number[] = [];

    // Build the cleaned corpus for stylometric analysis
    const cleanedTexts: string[] = [];

    for (const raw of rawTexts) {
      hashtagCounts.push(countMatches(raw, /#[\w\u00C0-\uFFFF]+/g));
      mentionCounts.push(countMatches(raw, /@\w+/g));
      emojiCounts.push(countMatches(raw, /\p{Extended_Pictographic}/gu));
      urlCounts.push(countMatches(raw, /https?:\/\/\S+/gi));
      charLengths.push(raw.length);

      const cleaned = cleanForStylometry(raw);
      cleanedTexts.push(cleaned);
      tokenLengths.push(tokenize(cleaned).length);
    }

    const corpus = cleanedTexts.join(' ');
    const tokens = tokenize(corpus);

    if (tokens.length === 0) return [];

    const features: ExtractedFeature[] = [];
    const cat = 'stylometric' as const;
    const totalTokens = tokens.length;

    // ----- Function-word frequencies -----
    const fwCounts = new Array(FUNCTION_WORD_VECTOR_LENGTH).fill(0) as number[];
    let fwTotal = 0;
    for (const tok of tokens) {
      const idx = FUNCTION_WORD_INDEX.get(tok);
      if (idx !== undefined) {
        fwCounts[idx]++;
        fwTotal++;
      }
    }
    const fwFreq = fwCounts.map(c => c / totalTokens);

    features.push({
      category: cat,
      name: 'function_word_frequencies',
      value: { kind: 'json', value: fwFreq },
    });
    features.push({
      category: cat,
      name: 'function_word_total',
      value: { kind: 'numeric', value: fwTotal },
    });
    features.push({
      category: cat,
      name: 'function_word_ratio',
      value: { kind: 'numeric', value: fwTotal / totalTokens },
    });

    // ----- Character bigrams -----
    const bigramCounts = computeCharBigrams(corpus);
    const bigramTotal = Array.from(bigramCounts.values()).reduce((s, x) => s + x, 0);

    // Top 50 bigrams as JSON map (sorted by count desc, then by bigram asc for determinism)
    const top50 = Array.from(bigramCounts.entries())
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, 50);
    const top50Map: Record<string, number> = {};
    for (const [bg, count] of top50) top50Map[bg] = count;

    features.push({
      category: cat,
      name: 'character_bigram_top50',
      value: { kind: 'json', value: top50Map },
    });
    features.push({
      category: cat,
      name: 'character_bigram_entropy',
      value: { kind: 'numeric', value: shannonEntropyFromMap(bigramCounts, bigramTotal) },
    });

    // ----- Lexical richness -----
    const typeCounts = new Map<string, number>();
    for (const tok of tokens) {
      typeCounts.set(tok, (typeCounts.get(tok) ?? 0) + 1);
    }
    const typeCount = typeCounts.size;
    let hapaxCount = 0;
    for (const c of typeCounts.values()) {
      if (c === 1) hapaxCount++;
    }

    features.push({ category: cat, name: 'token_count', value: { kind: 'numeric', value: totalTokens } });
    features.push({ category: cat, name: 'type_count', value: { kind: 'numeric', value: typeCount } });
    features.push({
      category: cat,
      name: 'type_token_ratio',
      value: { kind: 'numeric', value: typeCount / totalTokens },
    });
    features.push({
      category: cat,
      name: 'hapax_legomena_count',
      value: { kind: 'numeric', value: hapaxCount },
    });
    features.push({
      category: cat,
      name: 'hapax_legomena_ratio',
      value: { kind: 'numeric', value: hapaxCount / totalTokens },
    });

    // ----- Word length -----
    const wordLengths = tokens.map(t => t.length).sort((a, b) => a - b);
    features.push({
      category: cat,
      name: 'mean_word_length',
      value: { kind: 'numeric', value: wordLengths.reduce((s, x) => s + x, 0) / wordLengths.length },
    });
    features.push({
      category: cat,
      name: 'median_word_length',
      value: { kind: 'numeric', value: median(wordLengths) },
    });

    // ----- Sentence-level (operates on the corpus before tokenization) -----
    const sentences = splitSentences(corpus);
    if (sentences.length > 0) {
      const sentLengths = sentences.map(s => tokenize(s).length).filter(n => n > 0);
      if (sentLengths.length > 0) {
        const sortedSentLens = [...sentLengths].sort((a, b) => a - b);
        const meanSent = sentLengths.reduce((s, x) => s + x, 0) / sentLengths.length;
        const variance =
          sentLengths.reduce((s, x) => s + (x - meanSent) ** 2, 0) / sentLengths.length;
        features.push({
          category: cat,
          name: 'sentence_count',
          value: { kind: 'numeric', value: sentLengths.length },
        });
        features.push({
          category: cat,
          name: 'mean_sentence_length',
          value: { kind: 'numeric', value: meanSent },
        });
        features.push({
          category: cat,
          name: 'median_sentence_length',
          value: { kind: 'numeric', value: median(sortedSentLens) },
        });
        features.push({
          category: cat,
          name: 'sentence_length_stdev',
          value: { kind: 'numeric', value: Math.sqrt(variance) },
        });
      }
    }

    // ----- Character-level ratios (computed on raw text, not cleaned) -----
    const allRawText = rawTexts.join(' ');
    const charRatios = computeCharacterRatios(allRawText);
    features.push({
      category: cat,
      name: 'uppercase_ratio',
      value: { kind: 'numeric', value: charRatios.uppercase },
    });
    features.push({
      category: cat,
      name: 'digit_ratio',
      value: { kind: 'numeric', value: charRatios.digit },
    });
    features.push({
      category: cat,
      name: 'punctuation_ratio',
      value: { kind: 'numeric', value: charRatios.punctuation },
    });

    // ----- Twitter-specific aggregates -----
    const postCount = rawTexts.length;
    features.push({ category: cat, name: 'post_count', value: { kind: 'numeric', value: postCount } });
    features.push({
      category: cat,
      name: 'avg_post_length_chars',
      value: { kind: 'numeric', value: charLengths.reduce((s, x) => s + x, 0) / postCount },
    });
    features.push({
      category: cat,
      name: 'avg_post_length_tokens',
      value: { kind: 'numeric', value: tokenLengths.reduce((s, x) => s + x, 0) / postCount },
    });
    features.push({
      category: cat,
      name: 'hashtag_per_post_mean',
      value: { kind: 'numeric', value: hashtagCounts.reduce((s, x) => s + x, 0) / postCount },
    });
    features.push({
      category: cat,
      name: 'mention_per_post_mean',
      value: { kind: 'numeric', value: mentionCounts.reduce((s, x) => s + x, 0) / postCount },
    });
    features.push({
      category: cat,
      name: 'emoji_per_post_mean',
      value: { kind: 'numeric', value: emojiCounts.reduce((s, x) => s + x, 0) / postCount },
    });
    features.push({
      category: cat,
      name: 'url_per_post_mean',
      value: { kind: 'numeric', value: urlCounts.reduce((s, x) => s + x, 0) / postCount },
    });

    return features;
  }
}

// ---------------------------------------------------------------------------
// Twitter-specific parsing and cleaning
// ---------------------------------------------------------------------------

function tryParseTimeline(bytes: Uint8Array): TwitterPost[] | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);

    if (Array.isArray(parsed)) {
      return parsed.filter(isPostLike);
    }
    if (parsed && typeof parsed === 'object') {
      for (const key of ['tweets', 'posts', 'statuses', 'data']) {
        const candidate = parsed[key];
        if (Array.isArray(candidate)) {
          return candidate.filter(isPostLike);
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

function isPostLike(value: unknown): value is TwitterPost {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return 'text' in obj || 'full_text' in obj;
}

function stripRetweetPrefix(text: string): string {
  // "RT @user: actual content" → "actual content"
  return text.replace(/^RT @\w+:\s*/i, '');
}

/**
 * Clean Twitter post text for stylometric analysis. Strips URLs,
 * @mentions, hashtags, and HTML entities, then lowercases. The
 * stripped tokens are identity/topic/affordance markers rather than
 * stylistic markers, so removing them yields a cleaner signal for the
 * writer's word-pattern fingerprint.
 */
function cleanForStylometry(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, ' ')      // strip URLs (not stylistic)
    .replace(/@\w+/g, ' ')                  // strip @mentions (identity, not style)
    .replace(/#[\w\u00C0-\uFFFF]+/g, ' ')  // strip hashtags (topic, not style)
    .replace(/&\w+;/g, ' ')                 // strip HTML entities
    .toLowerCase();
}

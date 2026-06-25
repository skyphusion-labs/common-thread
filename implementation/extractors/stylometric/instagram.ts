/**
 * Instagram stylometric account features extractor.
 *
 * Reads an Instagram post-list artifact and emits account-level
 * stylometric features schema-parallel to stylometric_twitter so
 * Burrows' Delta, JSD-bigrams, and topic-phrase pair extractors
 * operate on Instagram accounts and cross-platform pairs without
 * modification.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
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
  countMatches,
  median,
  extractAndNormalizeUrls,
} from './text-helpers';
import { parseInstagramListingBytes } from '../../ingest/instagram-listing-parser';

const NAME = 'stylometric_instagram';
const VERSION = '1.0.0';

export class InstagramStylometricExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();

    if (tool.includes('instagram-profile')) return false;
    if (source.includes('/p/') || source.includes('/reel/')) return true;

    if (
      tool.includes('instagram-post') ||
      tool.includes('instagram-timeline') ||
      tool.includes('instagram-media') ||
      tool.includes('instagram-scraper')
    ) {
      return true;
    }

    if (tool.includes('instagram')) return true;

    let sourceHostname: string | null = null;
    try {
      sourceHostname = new URL(source).hostname.toLowerCase();
      if (
        sourceHostname === 'instagram.com' ||
        sourceHostname.endsWith('.instagram.com')
      ) {
        return true;
      }
    } catch {
      // Ignore invalid/non-URL source values and continue with other heuristics.
    }

    if (tool.includes('twitter') || tool.includes('x-com')) return false;
    if (tool.includes('reddit')) return false;
    if (
      sourceHostname &&
      (sourceHostname === 'twitter.com' ||
        sourceHostname.endsWith('.twitter.com') ||
        sourceHostname === 'x.com' ||
        sourceHostname.endsWith('.x.com'))
    ) {
      return false;
    }
    if (
      sourceHostname &&
      (sourceHostname === 'reddit.com' ||
        sourceHostname.endsWith('.reddit.com') ||
        sourceHostname === 'redd.it' ||
        sourceHostname.endsWith('.redd.it'))
    ) {
      return false;
    }

    return false;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const items = parseInstagramListingBytes(input.bytes);
    if (!items || items.length === 0) return [];

    const hashtagCounts: number[] = [];
    const mentionCounts: number[] = [];
    const emojiCounts: number[] = [];
    const urlCounts: number[] = [];
    const charLengths: number[] = [];
    const tokenLengths: number[] = [];
    const postedUrls = new Set<string>();

    let videoCount = 0;
    let carouselCount = 0;

    const cleanedTexts: string[] = [];
    const rawTexts: string[] = [];

    for (const item of items) {
      const raw = item.text;
      if (raw.length === 0) continue;

      rawTexts.push(raw);
      if (item.isVideo) videoCount++;
      if (item.isCarousel) carouselCount++;

      hashtagCounts.push(countMatches(raw, /#[\w\u00C0-\uFFFF]+/g));
      mentionCounts.push(countMatches(raw, /@[\w.]+/g));
      emojiCounts.push(countMatches(raw, /\p{Extended_Pictographic}/gu));
      urlCounts.push(countMatches(raw, /https?:\/\/\S+/gi));
      for (const u of extractAndNormalizeUrls(raw)) postedUrls.add(u);
      charLengths.push(raw.length);

      const cleaned = cleanForStylometry(raw);
      cleanedTexts.push(cleaned);
      tokenLengths.push(tokenize(cleaned).length);
    }

    if (rawTexts.length === 0) return [];

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

    const bigramCounts = computeCharBigrams(corpus);
    const bigramTotal = Array.from(bigramCounts.values()).reduce((s, x) => s + x, 0);
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

    features.push({
      category: cat,
      name: 'video_ratio',
      value: { kind: 'numeric', value: videoCount / postCount },
    });
    features.push({
      category: cat,
      name: 'carousel_ratio',
      value: { kind: 'numeric', value: carouselCount / postCount },
    });

    features.push({
      category: 'content_artifacts',
      name: 'posted_urls',
      value: { kind: 'json', value: [...postedUrls].sort() },
    });
    features.push({
      category: 'content_artifacts',
      name: 'posted_urls_unique_count',
      value: { kind: 'numeric', value: postedUrls.size },
    });

    return features;
  }
}

function cleanForStylometry(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/@[\w.]+/g, ' ')
    .replace(/#[\w\u00C0-\uFFFF]+/g, ' ')
    .replace(/&\w+;/g, ' ')
    .toLowerCase();
}

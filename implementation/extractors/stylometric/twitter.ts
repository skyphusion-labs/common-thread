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
import { sourceMatchesHost } from '../platform';
import { isApifyTweetLike, tweetLanguage, tweetText } from '../../ingest/apify-tweet-fields';
import { filterByDominantLanguage } from './corpus-language';
import { computeInternalStylometricVariance } from './internal-variance';
import {
  buildStylometricFeatures,
  type PostStylometryInput,
} from './stylometry-features';
import { countMatches, extractAndNormalizeUrls, tokenize } from './text-helpers';
import { selectRecentThirdWindow } from './windowing';

const NAME = 'stylometric_twitter';
const VERSION = '1.1.0';

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
    if (sourceMatchesHost(source, 'twitter.com', 'x.com')) return true;

    return false;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const posts = tryParseTimeline(input.bytes);
    if (!posts || posts.length === 0) return [];

    const langFilter = filterByDominantLanguage(posts, (p) => tweetLanguage(p));
    const workingPosts = langFilter.items;

    const metrics = buildPostMetrics(workingPosts);
    if (metrics.length === 0) return [];

    const postedUrls = new Set<string>();
    for (const m of metrics) {
      for (const u of extractAndNormalizeUrls(m.rawText)) postedUrls.add(u);
    }

    const features: ExtractedFeature[] = [
      {
        category: 'stylometric',
        name: 'stylometric_corpus_language',
        value: { kind: 'text', value: langFilter.dominant_language },
      },
      {
        category: 'stylometric',
        name: 'stylometric_corpus_post_count',
        value: { kind: 'numeric', value: langFilter.total_count },
      },
      {
        category: 'stylometric',
        name: 'stylometric_corpus_filtered_post_count',
        value: { kind: 'numeric', value: langFilter.filtered_count },
      },
      ...buildStylometricFeatures(metrics, {
        includePostedUrls: true,
        postedUrls,
      }),
    ];

    const internalVariance = computeInternalStylometricVariance(
      metrics.map((m) => m.cleanedText)
    );
    if (internalVariance) {
      features.push({
        category: 'stylometric',
        name: 'internal_stylometric_variance',
        value: { kind: 'numeric', value: internalVariance.variance },
      });
      features.push({
        category: 'stylometric',
        name: 'internal_stylometric_variance_chunk_count',
        value: { kind: 'numeric', value: internalVariance.chunk_count },
      });
      features.push({
        category: 'stylometric',
        name: 'high_internal_stylometric_variance',
        value: {
          kind: 'json',
          value: { flag: internalVariance.high_internal_variance },
        },
      });
    }

    const recent = selectRecentThirdWindow(workingPosts, (p) =>
      p.createdAt ?? p.created_at ?? null
    );
    if (recent.window === 'recent_third') {
      const recentMetrics = buildPostMetrics(recent.items);
      features.push(
        ...buildStylometricFeatures(recentMetrics, { recentWindow: true })
      );
      features.push({
        category: 'stylometric',
        name: 'stylometric_recent_window_post_count',
        value: { kind: 'numeric', value: recent.items.length },
      });
      features.push({
        category: 'stylometric',
        name: 'stylometric_recent_window_source_post_count',
        value: { kind: 'numeric', value: recent.source_count },
      });
    }

    return features;
  }
}

function buildPostMetrics(posts: TwitterPost[]): PostStylometryInput[] {
  const out: PostStylometryInput[] = [];
  for (const post of posts) {
    const raw = stripRetweetPrefix(tweetText(post));
    if (raw.length === 0) continue;
    const cleaned = cleanForStylometry(raw);
    out.push({
      rawText: raw,
      cleanedText: cleaned,
      charLength: raw.length,
      tokenLength: tokenize(cleaned).length,
      hashtagCount: countMatches(raw, /#[\w\u00C0-\uFFFF]+/g),
      mentionCount: countMatches(raw, /@\w+/g),
      emojiCount: countMatches(raw, /\p{Extended_Pictographic}/gu),
      urlCount: countMatches(raw, /https?:\/\/\S+/gi),
    });
  }
  return out;
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
      if (isPostLike(parsed)) return [parsed];
    }
    return null;
  } catch {
    return null;
  }
}

function isPostLike(value: unknown): value is TwitterPost {
  return isApifyTweetLike(value);
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

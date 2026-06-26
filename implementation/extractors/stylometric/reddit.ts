/**
 * Reddit stylometric account features extractor.
 *
 * Reads a Reddit user listing artifact (submissions and/or comments)
 * and emits account-level stylometric features in the 'stylometric'
 * category. Schema-parallel to stylometric_twitter so the existing
 * Burrows' Delta and JSD-bigrams pair extractors operate on Reddit
 * accounts and on Twitter-Reddit cross-platform pairs without any
 * modification to the pair extractors themselves.
 *
 * Features produced (identical names to stylometric_twitter where
 * signals match, plus three Reddit-specific aggregates and one feature
 * dropped for absence):
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
 *   Reddit aggregates parallel to the Twitter-specific block:
 *     post_count, avg_post_length_chars, avg_post_length_tokens,
 *     mention_per_post_mean (counts u/ and r/ references),
 *     emoji_per_post_mean, url_per_post_mean
 *
 *   Reddit-specific (no Twitter analog):
 *     submission_ratio (fraction of items that are submissions),
 *     comment_ratio (fraction of items that are comments),
 *     markdown_density (markdown-syntax-character count / raw character
 *       count, before cleaning; a fingerprint of how heavily a writer
 *       uses formatting like **bold**, *italic*, [links](), > quotes)
 *
 *   Notably absent (correctly):
 *     hashtag_per_post_mean, since Reddit has no native hashtag
 *     syntax. If downstream consumers need the field present for
 *     schema uniformity, they can treat absence as zero; emitting a
 *     zero row here would imply that hashtags were searched for and
 *     found missing, which over-claims the platform-equivalence.
 *
 * Markdown handling: the cleaner strips Reddit markdown syntax
 * (bold/italic markers, link decorations, code blocks, block-quote
 * markers, superscript, spoiler markers) while keeping the underlying
 * text content. A writer's stylistic word choices matter more than
 * their formatting choices for the function-word and bigram signals;
 * the markdown_density feature separately preserves the formatting-
 * intensity signal so it isn't lost.
 *
 * Determinism: same input bytes produce the same output.
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
  extractAndNormalizeUrls,
} from './text-helpers';

const NAME = 'stylometric_reddit';
const VERSION = '1.0.0';

interface RedditPostData {
  // Common
  created_utc?: number;
  // Submission fields
  title?: string;
  selftext?: string;
  // Comment fields
  body?: string;
}

interface RedditChild {
  kind?: string; // 't1' = comment, 't3' = submission
  data?: RedditPostData;
}

/**
 * Internal normalized post: a single piece of text plus its kind
 * classification. For submissions we concatenate title and selftext
 * (when both are present), since the stylometric signal lives in both.
 */
interface NormalizedRedditText {
  text: string;
  isComment: boolean;
}

export class RedditStylometricExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();

    if (tool.includes('reddit')) return true;
    if (source.includes('reddit.com') || source.includes('redd.it')) return true;

    // Exclude artifacts that obviously belong to other platforms.
    if (tool.includes('twitter') || tool.includes('x-com')) return false;
    if (source.includes('twitter.com') || source.includes('x.com')) return false;

    return false;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const items = tryParseListing(input.bytes);
    if (!items || items.length === 0) return [];

    // Per-post counts for Reddit aggregates
    const mentionCounts: number[] = []; // u/ and r/ refs
    const emojiCounts: number[] = [];
    const urlCounts: number[] = [];
    const charLengths: number[] = [];
    const tokenLengths: number[] = [];
    const markdownChars: number[] = []; // count of markdown-syntax characters per post

    // Aggregate posted URL set across all posts (§4.6.3 input).
    const postedUrls = new Set<string>();

    let submissionCount = 0;
    let commentCount = 0;

    const cleanedTexts: string[] = [];
    const rawTexts: string[] = [];

    for (const item of items) {
      const raw = item.text;
      if (raw.length === 0) continue;

      rawTexts.push(raw);
      if (item.isComment) commentCount++;
      else submissionCount++;

      // Raw-text counts (before cleaning)
      mentionCounts.push(countMatches(raw, /\b(?:\/?[ur]\/)\w+/g));
      emojiCounts.push(countMatches(raw, /\p{Extended_Pictographic}/gu));
      urlCounts.push(countMatches(raw, /https?:\/\/\S+/gi));
      for (const u of extractAndNormalizeUrls(raw)) postedUrls.add(u);
      charLengths.push(raw.length);
      markdownChars.push(countMarkdownSyntaxChars(raw));

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

    // ----- Sentence-level -----
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

    // ----- Reddit aggregates -----
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

    // ----- Reddit-specific -----
    features.push({
      category: cat,
      name: 'submission_ratio',
      value: { kind: 'numeric', value: submissionCount / postCount },
    });
    features.push({
      category: cat,
      name: 'comment_ratio',
      value: { kind: 'numeric', value: commentCount / postCount },
    });
    const totalRawChars = charLengths.reduce((s, x) => s + x, 0);
    const totalMarkdownChars = markdownChars.reduce((s, x) => s + x, 0);
    features.push({
      category: cat,
      name: 'markdown_density',
      value: {
        kind: 'numeric',
        value: totalRawChars > 0 ? totalMarkdownChars / totalRawChars : 0,
      },
    });

    // ----- Posted URLs (content_artifacts category per paper §4.6.3) -----
    //
    // The URL list is emitted regardless of count (including the empty
    // case) so the pair extractor (external_link_overlap_cross_platform)
    // can fire on every pair where both accounts have at least one post.
    // Empty list is itself informative.
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

// ---------------------------------------------------------------------------
// Reddit-specific parsing
// ---------------------------------------------------------------------------

/**
 * Parse a Reddit listing artifact into normalized text items.
 *
 * Accepts the same shape variants as the temporal extractor:
 *   - { kind: 'Listing', data: { children: [...] } }
 *   - An array of Listings (user/overview endpoint)
 *   - An array of { kind: 't1' | 't3', data: {...} } items
 *   - A flat array of bare post objects (Pushshift-style)
 *   - Wrapper objects with posts/comments/submissions/children arrays
 */
function tryParseListing(bytes: Uint8Array): NormalizedRedditText[] | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    const collected: NormalizedRedditText[] = [];
    collectFrom(parsed, collected);
    return collected.length > 0 ? collected : null;
  } catch {
    return null;
  }
}

function collectFrom(value: unknown, out: NormalizedRedditText[]): void {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const item of value) collectFrom(item, out);
    return;
  }

  if (typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;

  // Listing envelope: { kind: 'Listing', data: { children: [...] } }
  if (obj.kind === 'Listing' && obj.data && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>;
    if (Array.isArray(data.children)) {
      for (const child of data.children) collectFrom(child, out);
    }
    return;
  }

  // Wrapped item: { kind: 't1' | 't3', data: {...} }
  if (typeof obj.kind === 'string' && obj.data && typeof obj.data === 'object') {
    const normalized = normalizeItem(obj.kind, obj.data as RedditPostData);
    if (normalized) out.push(normalized);
    return;
  }

  // Bare post object (no envelope; archival exports)
  if (looksLikeBarePost(obj)) {
    const normalized = normalizeItem(inferKind(obj), obj as RedditPostData);
    if (normalized) out.push(normalized);
    return;
  }

  // Wrapper around children arrays
  for (const key of ['posts', 'comments', 'submissions', 'children']) {
    const candidate = obj[key];
    if (Array.isArray(candidate)) {
      for (const c of candidate) collectFrom(c, out);
    }
  }
}

function normalizeItem(
  kind: string | undefined,
  data: RedditPostData
): NormalizedRedditText | null {
  // Concatenate title + selftext for submissions; body alone for comments.
  // For link-only submissions, selftext is empty and title carries the
  // entire textual content. Both signals matter for stylometry.
  const parts: string[] = [];
  if (typeof data.title === 'string' && data.title.length > 0) parts.push(data.title);
  if (typeof data.selftext === 'string' && data.selftext.length > 0) parts.push(data.selftext);
  if (typeof data.body === 'string' && data.body.length > 0) parts.push(data.body);

  const text = parts.join(' ').trim();
  if (text.length === 0) return null;

  const isComment = kind === 't1' || (kind === undefined && typeof data.body === 'string');
  return { text, isComment };
}

function looksLikeBarePost(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.body === 'string' ||
    typeof obj.title === 'string' ||
    typeof obj.selftext === 'string'
  );
}

function inferKind(obj: Record<string, unknown>): string | undefined {
  if (typeof obj.body === 'string') return 't1';
  if (typeof obj.title === 'string') return 't3';
  return undefined;
}

// ---------------------------------------------------------------------------
// Reddit-specific cleaning
// ---------------------------------------------------------------------------

/**
 * Clean Reddit post text for stylometric analysis. Strips URLs,
 * u/-and-r/ references, markdown formatting (bold, italic, strike-
 * through, links, code blocks, inline code, block-quote markers,
 * superscript, spoiler markers), and HTML entities, then lowercases.
 *
 * Markdown stripping is done before mention stripping so that link
 * text in [text](url) survives but the URL is dropped. Code blocks are
 * stripped entirely because their content is often code, not natural
 * prose, and would skew the stylometric signal.
 */
function cleanForStylometry(text: string): string {
  return text
    // Strip fenced code blocks: ```...``` (multiline, non-greedy)
    .replace(/```[\s\S]*?```/g, ' ')
    // Strip inline code: `code` → drop entirely (code is not prose)
    .replace(/`[^`]+`/g, ' ')
    // Strip markdown links: [text](url) → keep just the link text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Strip URLs (any survivors from non-markdown formatting)
    .replace(/https?:\/\/\S+/gi, ' ')
    // Strip Reddit mentions: u/username, /u/username, r/subreddit, /r/subreddit
    .replace(/\b\/?[ur]\/\w+/g, ' ')
    // Strip bold markers: **text** and __text__ → keep text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // Strip italic markers: *text* and _text_ (the latter only when not
    // surrounded by word characters, to avoid eating snake_case-style
    // tokens that may have survived code-block stripping)
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/(?<!\w)_([^_]+)_(?!\w)/g, '$1')
    // Strip strikethrough: ~~text~~ → text
    .replace(/~~([^~]+)~~/g, '$1')
    // Strip Reddit superscript: ^(text) and ^word
    .replace(/\^\(([^)]+)\)/g, '$1')
    .replace(/\^(\w+)/g, '$1')
    // Strip Reddit spoiler markers: >!text!<
    .replace(/>!([^!]+)!</g, '$1')
    // Strip block-quote markers: leading "> " on a line
    .replace(/^>\s*/gm, '')
    // Strip HTML entities
    .replace(/&\w+;/g, ' ')
    .toLowerCase();
}

/**
 * Count the markdown syntax characters in raw text. Used to compute
 * markdown_density (formatting-intensity fingerprint). Each match
 * counts the marker characters (e.g., the four asterisks in **bold**)
 * rather than the surrounded content.
 */
function countMarkdownSyntaxChars(text: string): number {
  let count = 0;
  // Bold/italic markers
  count += countMatches(text, /\*\*/g) * 2;
  count += countMatches(text, /__/g) * 2;
  count += countMatches(text, /(?<!\*)\*(?!\*)/g);
  count += countMatches(text, /(?<![_\w])_(?![_\w])/g);
  // Strikethrough
  count += countMatches(text, /~~/g) * 2;
  // Link decoration: count brackets and parens of [text](url)
  count += countMatches(text, /\[[^\]]+\]\([^)]+\)/g) * 4;
  // Inline code backticks
  count += countMatches(text, /`/g);
  // Block-quote markers (count leading > on lines)
  count += countMatches(text, /^>/gm);
  // Superscript markers
  count += countMatches(text, /\^[(\w]/g);
  // Spoiler markers (>! and !<)
  count += countMatches(text, />!|!</g) * 2;
  return count;
}

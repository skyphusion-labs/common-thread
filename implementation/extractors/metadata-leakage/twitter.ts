/**
 * Twitter metadata-leakage account extractor.
 *
 * Reads a Twitter timeline artifact and aggregates two platform-
 * supplied per-tweet metadata fields into account-level distributions:
 *
 *   1. Client app signature (the 'source' field): which application
 *      posted each tweet. Platform-supplied; until Twitter removed
 *      it from default API responses around 2022, this was one of
 *      the strongest sockpuppet attribution signals in the literature.
 *      Modern API tiers and scrapers vary in whether they expose it.
 *
 *   2. Per-tweet language ('lang' field): Twitter's auto-detected
 *      language for each tweet. Distinct from stylometric language
 *      inference because it's platform-supplied metadata, not
 *      derived from content. Operators who post in the same
 *      languages on different sockpuppets produce matching
 *      distributions.
 *
 * Both signals are aggregated into count distributions over the
 * tweets in the timeline artifact. Storage form is a JSON object
 * with keys sorted for determinism, mapping each observed value to
 * its count.
 *
 * Source-field parsing: the 'source' field comes from Twitter as
 * either HTML markup ('<a href="..." rel="nofollow">Twitter for
 * iPhone</a>') or as plain text on newer scrapers. The parser
 * strips HTML if present and falls back to the raw string.
 *
 * Features emitted (only when the timeline contains at least one
 * tweet that carries the corresponding field):
 *
 *   client_app_distribution (json, {appName: count}, sorted keys)
 *   client_app_unique_count (numeric, distinct app count)
 *   tweet_language_distribution (json, {langCode: count}, sorted keys)
 *   tweet_language_unique_count (numeric, distinct lang count)
 *   tweet_with_source_count (numeric, tweets that carried a
 *     non-empty source field; useful for confidence weighting in
 *     the pair extractor)
 *   tweet_with_lang_count (numeric, tweets that carried a non-empty
 *     lang field)
 *
 * Determinism: pure JSON parsing, string handling, and counting.
 * No randomness, no clock, no I/O beyond the artifact bytes.
 * Satisfies §6.1.
 *
 * Edge cases:
 *   - Tweet timeline artifact with no tweets carrying source or
 *     lang: returns empty (or partial, if only one field is present
 *     across the tweets).
 *   - HTML in source that fails to parse: falls back to using the
 *     raw string trimmed of whitespace.
 *   - Twitter's 'und' lang marker (undetectable language): kept
 *     verbatim as a distinct distribution key rather than dropped.
 *     This preserves a meaningful signal (two accounts both heavy
 *     in 'und' tweets is itself a pattern).
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';

const NAME = 'metadata_leakage_twitter';
const VERSION = '1.0.0';

interface TweetLike {
  source?: string;
  source_label?: string;
  client?: string;
  lang?: string;
  language?: string;
}

export class TwitterMetadataLeakageExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    // Same filtering surface as temporal_twitter: timeline artifacts.
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();

    if (tool.includes('twitter') || tool.includes('x-com')) {
      // Reject explicitly non-timeline Twitter artifacts.
      if (
        tool.includes('profile') ||
        tool.includes('user_metadata') ||
        tool.includes('followers') ||
        tool.includes('following') ||
        tool.includes('friends') ||
        tool.includes('image') ||
        tool.includes('avatar')
      ) {
        return false;
      }
      return true;
    }
    if (source.includes('twitter.com') || source.includes('x.com')) {
      if (
        source.includes('/profile') ||
        source.includes('/followers') ||
        source.includes('/following') ||
        source.includes('/profile_images/') ||
        source.includes('/banners/')
      ) {
        return false;
      }
      return true;
    }

    // Conservative default: let it through and rely on extract() to
    // discriminate via tweet shape inspection.
    return true;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const tweets = tryParseTweets(input.bytes);
    if (!tweets || tweets.length === 0) return [];
    if (!looksLikeTwitterTimeline(tweets)) return [];

    const clientApps = new Map<string, number>();
    const languages = new Map<string, number>();
    let tweetsWithSource = 0;
    let tweetsWithLang = 0;

    for (const t of tweets) {
      const app = extractClientApp(t);
      if (app) {
        clientApps.set(app, (clientApps.get(app) ?? 0) + 1);
        tweetsWithSource++;
      }
      const lang = extractLanguage(t);
      if (lang) {
        languages.set(lang, (languages.get(lang) ?? 0) + 1);
        tweetsWithLang++;
      }
    }

    const features: ExtractedFeature[] = [];

    if (clientApps.size > 0) {
      features.push(
        {
          category: 'metadata_leakage',
          name: 'client_app_distribution',
          value: { kind: 'json', value: sortedObject(clientApps) },
        },
        {
          category: 'metadata_leakage',
          name: 'client_app_unique_count',
          value: { kind: 'numeric', value: clientApps.size },
        },
        {
          category: 'metadata_leakage',
          name: 'tweet_with_source_count',
          value: { kind: 'numeric', value: tweetsWithSource },
        }
      );
    }

    if (languages.size > 0) {
      features.push(
        {
          category: 'metadata_leakage',
          name: 'tweet_language_distribution',
          value: { kind: 'json', value: sortedObject(languages) },
        },
        {
          category: 'metadata_leakage',
          name: 'tweet_language_unique_count',
          value: { kind: 'numeric', value: languages.size },
        },
        {
          category: 'metadata_leakage',
          name: 'tweet_with_lang_count',
          value: { kind: 'numeric', value: tweetsWithLang },
        }
      );
    }

    return features;
  }
}

// ---------------------------------------------------------------------------
// Tweet parsing
// ---------------------------------------------------------------------------

function tryParseTweets(bytes: Uint8Array): TweetLike[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) return parsed as TweetLike[];
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['tweets', 'data', 'timeline', 'statuses', 'results']) {
      const v = obj[key];
      if (Array.isArray(v)) return v as TweetLike[];
    }
  }
  return null;
}

/**
 * Confirm the parsed array looks like Twitter tweets. We don't require
 * every tweet to have source/lang (those are exactly what we're
 * sampling for), but we want some signal that this is a Twitter
 * timeline rather than e.g. a Reddit listing.
 */
function looksLikeTwitterTimeline(tweets: TweetLike[]): boolean {
  for (const t of tweets) {
    if (!t || typeof t !== 'object') continue;
    const obj = t as Record<string, unknown>;
    // Twitter-distinctive fields.
    if (
      'retweet_count' in obj ||
      'retweetCount' in obj ||
      'favorite_count' in obj ||
      'favoriteCount' in obj ||
      'in_reply_to_status_id' in obj ||
      'tweet_id' in obj ||
      'id_str' in obj
    ) {
      return true;
    }
    // If we already see source or lang, the structure is Twitter-shaped.
    if ('source' in obj || 'lang' in obj) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Field extraction
// ---------------------------------------------------------------------------

/**
 * Extract the client app name from a tweet. The 'source' field may be:
 *   - HTML: '<a href="..." rel="nofollow">Twitter for iPhone</a>'
 *   - Plain text: 'Twitter for iPhone'
 *   - Some scrapers expose 'source_label' or 'client' as pre-parsed text.
 *
 * Returns null if no app name could be extracted.
 */
function extractClientApp(tweet: TweetLike): string | null {
  // Prefer pre-parsed fields if scrapers provide them.
  for (const direct of [tweet.source_label, tweet.client]) {
    if (typeof direct === 'string' && direct.trim().length > 0) {
      return normalizeAppName(direct);
    }
  }

  const raw = tweet.source;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;

  // Strip HTML: extract the visible text between > and <.
  const htmlMatch = raw.match(/>([^<]+)</);
  if (htmlMatch && htmlMatch[1].trim().length > 0) {
    return normalizeAppName(htmlMatch[1]);
  }

  return normalizeAppName(raw);
}

function normalizeAppName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

function extractLanguage(tweet: TweetLike): string | null {
  const lang = tweet.lang ?? tweet.language;
  if (typeof lang !== 'string' || lang.trim().length === 0) return null;
  return lang.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

/**
 * Convert a count Map into a plain object with keys sorted
 * lexicographically. Sorting matters for determinism: two extraction
 * runs over the same artifact bytes must produce identical JSON.
 */
function sortedObject(counts: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of [...counts.keys()].sort()) {
    out[key] = counts.get(key)!;
  }
  return out;
}

/**
 * Shared stylometric text helpers.
 *
 * Platform-agnostic atoms used by both the Twitter and Reddit
 * stylometric extractors. The functions here operate on cleaned text
 * (with platform-specific syntax already stripped by the per-platform
 * cleaner) or, in the case of computeCharacterRatios, on raw text.
 *
 * Platform-specific concerns stay in the per-platform extractor files:
 *   - Artifact-shape dispatch (timeline parsing, listing envelopes)
 *   - Platform-specific syntax cleaning (RT prefix, @mentions, u/, r/,
 *     markdown, hashtags)
 *   - Platform-specific per-post aggregates (hashtag rate, mention rate,
 *     subreddit fingerprinting)
 *
 * Determinism: per the methodology paper §6.1, all functions in this
 * module are pure functions of their inputs. No randomness, no clock
 * access, no I/O.
 */

/**
 * Tokenize cleaned text into stylometric tokens. Keeps contractions
 * intact ("don't" stays as one token) so they match the function-word
 * list's contraction entries. Also captures bare clitics like 'n't,
 * 's, 've when they appear separated.
 *
 * Input is expected to already be lowercased by the platform's
 * cleaner (cleanForStylometry).
 */
export function tokenize(text: string): string[] {
  const matches = text.match(/[a-z]+(?:'[a-z]+)*|'[a-z]+/g);
  return matches ?? [];
}

/**
 * Split text into sentences on sentence-ending punctuation followed by
 * whitespace. Imperfect for short-form social media but a reasonable
 * approximation for both Twitter and Reddit content.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Compute character-bigram counts from cleaned text. Only alphabetic
 * characters and single spaces contribute; punctuation and digits are
 * skipped at the bigram-boundary level (a bigram is recorded only when
 * both of its characters are alphabetic or space).
 *
 * This matches the Burrows-style stylometric convention of treating
 * function-word and letter-shape signal as primary, with punctuation
 * and digits handled by separate character-ratio features.
 */
export function computeCharBigrams(text: string): Map<string, number> {
  const bigrams = new Map<string, number>();
  const normalized = text.replace(/\s+/g, ' ').toLowerCase();
  for (let i = 0; i < normalized.length - 1; i++) {
    const a = normalized[i];
    const b = normalized[i + 1];
    if (!isAlphaOrSpace(a) || !isAlphaOrSpace(b)) continue;
    const bg = a + b;
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  return bigrams;
}

function isAlphaOrSpace(c: string): boolean {
  return (c >= 'a' && c <= 'z') || c === ' ';
}

/**
 * Shannon entropy in base 2 over a sparse count map and its known
 * total. Returns 0 for the empty distribution.
 */
export function shannonEntropyFromMap(
  counts: Map<string, number>,
  total: number
): number {
  if (total === 0) return 0;
  let h = 0;
  for (const c of counts.values()) {
    if (c === 0) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * Compute uppercase, digit, and punctuation ratios from RAW text
 * (before the platform-specific cleaning step). These ratios are a
 * fingerprint of the writer's surface-level habits and are preserved
 * unmodified across platforms; running them on cleaned text would
 * defeat the purpose since cleaning strips URLs and platform syntax
 * that affect punctuation/digit counts in real-world content.
 *
 * uppercase ratio: capitals as a fraction of alphabetic characters.
 * digit ratio: digits as a fraction of all characters.
 * punctuation ratio: ASCII punctuation as a fraction of all characters.
 */
export function computeCharacterRatios(text: string): {
  uppercase: number;
  digit: number;
  punctuation: number;
} {
  let upper = 0;
  let lower = 0;
  let digit = 0;
  let punct = 0;
  let total = 0;
  for (const c of text) {
    total++;
    if (c >= 'A' && c <= 'Z') upper++;
    else if (c >= 'a' && c <= 'z') lower++;
    else if (c >= '0' && c <= '9') digit++;
    else if (/[!-/:-@\[-`{-~]/.test(c)) punct++;
  }
  const alpha = upper + lower;
  return {
    uppercase: alpha > 0 ? upper / alpha : 0,
    digit: total > 0 ? digit / total : 0,
    punctuation: total > 0 ? punct / total : 0,
  };
}

/**
 * Count regex matches in a string. Convenience wrapper that returns 0
 * for null matches instead of crashing.
 */
export function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

// ---------------------------------------------------------------------------
// URL extraction and normalization
// ---------------------------------------------------------------------------

/**
 * URL-matching regex tuned to avoid common trailing punctuation that
 * would corrupt URL parsing (closing brackets, quotes, etc.). Matches
 * http and https URLs.
 */
const URL_REGEX = /https?:\/\/[^\s<>"'`)\]}]+/gi;

/**
 * Query parameters known to be tracking-only. Stripped during URL
 * normalization so two accounts linking to the same target with
 * different tracking context still compare equal.
 */
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'igshid',
  'mc_eid',
  'mc_cid',
  'ref',
  'ref_src',
  'ref_url',
  'source',
]);

/**
 * Extract all URL-like substrings from the given text, normalize each
 * to canonical comparable form, and return the deduplicated set.
 *
 * Canonical form is host (lowercased, www. stripped) + path (trailing
 * slash removed) + sorted non-tracking query string. Protocol is
 * dropped so http and https variants of the same target compare equal.
 *
 * Determinism: pure string parsing. No randomness, no clock, no
 * network. Two accounts pointing at the same target via different
 * surface forms (case differences, www. prefix, tracking params,
 * protocol difference) will produce identical normalized strings;
 * SHORTENER REDIRECTS are NOT resolved here (would require network),
 * so t.co/abc and bit.ly/xyz remain distinct even when they point at
 * the same target. Resolution is a collection-layer responsibility.
 *
 * Returns null entries are filtered out; the returned set contains
 * only successfully parsed URLs.
 */
export function extractAndNormalizeUrls(text: string): Set<string> {
  const out = new Set<string>();
  for (const match of text.matchAll(URL_REGEX)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized) out.add(normalized);
  }
  return out;
}

/**
 * Normalize a single URL to canonical comparable form. Returns null
 * when parsing fails or the protocol is not http/https.
 */
export function normalizeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const host = parsed.host.toLowerCase().replace(/^www\./, '');
  if (host.length === 0) return null;

  const path = parsed.pathname.replace(/\/$/, '');

  const params: string[] = [];
  for (const [k, v] of parsed.searchParams.entries()) {
    if (!TRACKING_PARAMS.has(k.toLowerCase())) {
      params.push(`${k}=${v}`);
    }
  }
  params.sort();
  const query = params.length > 0 ? `?${params.join('&')}` : '';

  return `${host}${path}${query}`;
}

/**
 * Extract just the host portion of a normalized URL string. Returns
 * empty string if the URL is malformed beyond recognition.
 */
export function urlHost(normalizedUrl: string): string {
  const slashIdx = normalizedUrl.indexOf('/');
  const qIdx = normalizedUrl.indexOf('?');
  let end = normalizedUrl.length;
  if (slashIdx >= 0 && slashIdx < end) end = slashIdx;
  if (qIdx >= 0 && qIdx < end) end = qIdx;
  return normalizedUrl.slice(0, end);
}

/**
 * Median of an already-sorted numeric array. Returns 0 for empty
 * input (rather than NaN) so callers don't have to special-case it.
 */
export function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Bio-link-overlap pair extractor.
 *
 * Per the methodology paper §4.6.2, this extractor computes set
 * similarity between the URLs each account publishes in their bio
 * (and, for Twitter, the dedicated profile URL field). URLs are
 * normalized to canonical form before comparison so accounts that
 * link to the same target via different surface forms still match.
 *
 * URL normalization:
 *   - Parse via the URL constructor (rejects malformed inputs)
 *   - Lowercase host; strip leading "www." prefix
 *   - Drop the protocol (http and https treated equivalently)
 *   - Strip trailing slash from the path
 *   - Remove known tracking parameters (utm_*, fbclid, gclid, igshid,
 *     mc_eid, mc_cid, ref); keep other query params, sorted for
 *     canonical comparison
 *
 * Redirect resolution is NOT performed at the extractor layer because
 * it would require network requests (violates §6.1 determinism). If
 * the collection layer resolves shortened URLs and stores the resolved
 * form in the archive, the bio text fed to this extractor will reflect
 * the resolution; otherwise, two accounts linking to t.co/abc and
 * bit.ly/xyz pointing at the same target will not match here. This is
 * a known limitation; the methodology paper §6.2.6 acknowledges it.
 *
 * Algorithm:
 *   1. From each account's bio text, extract URLs via regex.
 *   2. For Twitter accounts, also include the dedicated `url` profile
 *      feature when present. Reddit doesn't expose a profile URL
 *      separate from bio, so this is a no-op for Reddit accounts.
 *   3. Normalize each URL; drop ones that fail to parse.
 *   4. Compute three views of overlap:
 *        - Full URL set Jaccard (strictest, requires identical
 *          target + path + non-tracking query params)
 *        - Host-only set Jaccard (catches "two accounts linking to
 *          different paths on the same site", e.g., a shared
 *          publication or organization)
 *        - Intersection lists (for inspection)
 *
 * Rarity weighting: the paper §6.2.6 mentions rarity weighting on
 * external link overlap. A faithful implementation requires a corpus-
 * level URL frequency prior that this layer does not have. The pair
 * extractor emits raw Jaccard; downstream reasoning can apply rarity
 * weighting if a frequency table is available.
 *
 * Features emitted:
 *   bio_link_count_a (numeric)
 *   bio_link_count_b (numeric)
 *   bio_link_overlap_count (numeric, full-URL intersection size)
 *   bio_link_jaccard (numeric, [0, 1], full-URL Jaccard)
 *   bio_link_host_overlap_count (numeric, host-only intersection size)
 *   bio_link_host_jaccard (numeric, [0, 1], host-only Jaccard)
 *   bio_link_shared_urls (json, sorted array of overlapping
 *     normalized URLs)
 *   bio_link_shared_hosts (json, sorted array of overlapping hosts)
 *
 * Determinism: pure string parsing, set arithmetic, and integer
 * counting. No randomness, no clock access, no network. Satisfies
 * §6.1.
 *
 * Edge cases:
 *   - Either account missing the bio feature: returns empty (the
 *     comparison is undefined when there is no bio to compare).
 *   - Both bios present but neither contains URLs: emits zero counts
 *     and zero Jaccard. This is informative as a null result.
 *   - Malformed URL syntax in bio (e.g., "https:// foo"): drops the
 *     malformed URL silently. Well-formed URLs in the same bio still
 *     contribute.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'bio_link_overlap_cross_platform';
const VERSION = '1.0.0';

const URL_REGEX = /https?:\/\/[^\s<>"'`)\]}]+/gi;

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

export class BioLinkOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'cross_platform' as const;
  readonly requiredAccountFeatures = ['bio'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const bioA = getText(featuresA, 'bio');
    const bioB = getText(featuresB, 'bio');
    if (bioA === null || bioB === null) return [];

    // Optionally include the dedicated profile URL feature (Twitter
    // emits this; Reddit does not). Treat as just another URL source
    // alongside whatever appears inline in the bio.
    const profileUrlA = getText(featuresA, 'url');
    const profileUrlB = getText(featuresB, 'url');

    const urlsA = collectNormalizedUrls(bioA, profileUrlA);
    const urlsB = collectNormalizedUrls(bioB, profileUrlB);

    const hostsA = new Set([...urlsA].map(extractHost).filter(nonEmpty));
    const hostsB = new Set([...urlsB].map(extractHost).filter(nonEmpty));

    const sharedUrls = intersect(urlsA, urlsB);
    const sharedHosts = intersect(hostsA, hostsB);

    const urlUnion = urlsA.size + urlsB.size - sharedUrls.size;
    const hostUnion = hostsA.size + hostsB.size - sharedHosts.size;

    const cat = 'cross_platform' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'bio_link_count_a',
        value: { kind: 'numeric', value: urlsA.size },
      },
      {
        category: cat,
        name: 'bio_link_count_b',
        value: { kind: 'numeric', value: urlsB.size },
      },
      {
        category: cat,
        name: 'bio_link_overlap_count',
        value: { kind: 'numeric', value: sharedUrls.size },
      },
      {
        category: cat,
        name: 'bio_link_jaccard',
        value: {
          kind: 'numeric',
          value: urlUnion > 0 ? sharedUrls.size / urlUnion : 0,
        },
      },
      {
        category: cat,
        name: 'bio_link_host_overlap_count',
        value: { kind: 'numeric', value: sharedHosts.size },
      },
      {
        category: cat,
        name: 'bio_link_host_jaccard',
        value: {
          kind: 'numeric',
          value: hostUnion > 0 ? sharedHosts.size / hostUnion : 0,
        },
      },
    ];

    // Include the actual overlap lists when non-empty for human review.
    // Both arrays are sorted for deterministic output.
    if (sharedUrls.size > 0) {
      features.push({
        category: cat,
        name: 'bio_link_shared_urls',
        value: { kind: 'json', value: [...sharedUrls].sort() },
      });
    }
    if (sharedHosts.size > 0) {
      features.push({
        category: cat,
        name: 'bio_link_shared_hosts',
        value: { kind: 'json', value: [...sharedHosts].sort() },
      });
    }

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getText(features: AccountFeatureMap, name: string): string | null {
  const v = features.get(name);
  if (!v || v.kind !== 'text') return null;
  if (typeof v.value !== 'string') return null;
  return v.value;
}

/**
 * Extract all URL-like substrings from the given text, normalize each,
 * and merge with the optionally provided profile URL. Returns a Set of
 * normalized URL strings. Malformed URLs are silently dropped.
 */
function collectNormalizedUrls(
  bioText: string,
  profileUrl: string | null
): Set<string> {
  const out = new Set<string>();

  for (const match of bioText.matchAll(URL_REGEX)) {
    const normalized = normalizeUrl(match[0]);
    if (normalized) out.add(normalized);
  }

  if (profileUrl) {
    // Twitter's `url` feature may be a bare host without scheme; prepend
    // https:// when the protocol is missing so URL parsing succeeds.
    const candidate = /^https?:\/\//i.test(profileUrl)
      ? profileUrl
      : `https://${profileUrl}`;
    const normalized = normalizeUrl(candidate);
    if (normalized) out.add(normalized);
  }

  return out;
}

/**
 * Normalize a URL to canonical comparable form. Returns null when
 * parsing fails. The canonical form is host (no scheme, no www) + path
 * (trailing slash stripped) + sorted non-tracking query string.
 */
function normalizeUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  // Only http(s) URLs are relevant for the link-overlap signal.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const host = parsed.host.toLowerCase().replace(/^www\./, '');
  if (host.length === 0) return null;

  const path = parsed.pathname.replace(/\/$/, '');

  // Filter and sort the remaining query parameters for canonical form.
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
 * Extract just the host portion of a normalized URL string (everything
 * before the first `/` or `?`). Returns empty string if extraction
 * fails.
 */
function extractHost(normalizedUrl: string): string {
  const slashIdx = normalizedUrl.indexOf('/');
  const qIdx = normalizedUrl.indexOf('?');
  let end = normalizedUrl.length;
  if (slashIdx >= 0 && slashIdx < end) end = slashIdx;
  if (qIdx >= 0 && qIdx < end) end = qIdx;
  return normalizedUrl.slice(0, end);
}

function nonEmpty(s: string): boolean {
  return s.length > 0;
}

function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<T>();
  for (const x of small) if (large.has(x)) out.add(x);
  return out;
}

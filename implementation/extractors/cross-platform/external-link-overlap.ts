/**
 * External-link corpus overlap pair extractor.
 *
 * Per the methodology paper §4.6.3, this extractor compares the set
 * of URLs each account has posted across their content. Operators
 * sharing links from the same source set across sockpuppets (the
 * same blog, news outlet, podcast, fundraiser, etc.) leave a
 * distinctive trail that this signal picks up.
 *
 * Distinct from bio-link-overlap (§4.6.2): bio-link compares
 * accounts' PROFILE URLs (low volume, deliberate self-presentation
 * signal); external-link compares accounts' POSTED URLs (high
 * volume, behavioral signal of what topics and sources the operator
 * engages with).
 *
 * Algorithm:
 *
 *   1. Read each account's posted_urls feature (a JSON array of
 *      normalized URL strings produced by the per-platform
 *      stylometric extractors).
 *   2. Compute Jaccard similarity on the URL sets.
 *   3. Compute Jaccard on the host sets (catches "two accounts
 *      heavily linking to the same site even via different paths,"
 *      e.g., two sockpuppets both signal-boosting a fundraiser hub).
 *   4. Compute total post-URL counts on each side for confidence
 *      weighting.
 *
 * Rarity weighting (paper §6.2.6) is NOT applied at this layer. A
 * faithful implementation requires a corpus-level URL or host
 * frequency prior that the extractor does not have access to. The
 * pair extractor emits raw Jaccard scores; downstream attribution
 * reasoning can apply rarity weighting if it has access to a
 * frequency table (e.g., "twitter.com" should weight less than a
 * personal-domain link).
 *
 * Features emitted per pair (always emitted when both accounts have
 * posted_urls, even when the lists are empty):
 *
 *   posted_url_count_a (numeric, size of A's normalized URL set)
 *   posted_url_count_b (numeric, size of B's normalized URL set)
 *   posted_url_overlap_count (numeric, intersection size)
 *   posted_url_jaccard (numeric, [0, 1], full-URL Jaccard)
 *   posted_url_host_overlap_count (numeric, host-set intersection)
 *   posted_url_host_jaccard (numeric, [0, 1], host-only Jaccard)
 *   posted_url_shared (json, sorted array of overlapping URLs;
 *     only when intersection is non-empty)
 *   posted_url_shared_hosts (json, sorted array of overlapping
 *     hosts; only when non-empty)
 *
 * Determinism: pure string-set arithmetic and Jaccard calculation.
 * No randomness, no clock, no network. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either account missing posted_urls: returns empty (the runner
 *     filter handles this; the guard is here too).
 *   - Both URL lists empty: emits zero counts and zero Jaccards.
 *     This is informative as a null-result data point. Two accounts
 *     that both post zero URLs is itself a (weak) similarity signal.
 *   - One list empty, one non-empty: Jaccard = 0 (no overlap).
 *   - URLs already normalized at emission time, so no normalization
 *     happens here. If the stylometric extractor normalization
 *     ever changes, the pair-level comparison automatically picks
 *     up the new canonical form.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'external_link_overlap_cross_platform';
const VERSION = '1.0.0';

export class ExternalLinkOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'cross_platform' as const;
  readonly requiredAccountFeatures = ['posted_urls'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const urlsA = parseUrlSet(featuresA);
    const urlsB = parseUrlSet(featuresB);
    if (!urlsA || !urlsB) return [];

    const hostsA = setMap(urlsA, urlHost);
    const hostsB = setMap(urlsB, urlHost);

    const sharedUrls = intersect(urlsA, urlsB);
    const sharedHosts = intersect(hostsA, hostsB);

    const urlUnion = urlsA.size + urlsB.size - sharedUrls.size;
    const hostUnion = hostsA.size + hostsB.size - sharedHosts.size;

    const cat = 'cross_platform' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'posted_url_count_a',
        value: { kind: 'numeric', value: urlsA.size },
      },
      {
        category: cat,
        name: 'posted_url_count_b',
        value: { kind: 'numeric', value: urlsB.size },
      },
      {
        category: cat,
        name: 'posted_url_overlap_count',
        value: { kind: 'numeric', value: sharedUrls.size },
      },
      {
        category: cat,
        name: 'posted_url_jaccard',
        value: {
          kind: 'numeric',
          value: urlUnion > 0 ? sharedUrls.size / urlUnion : 0,
        },
      },
      {
        category: cat,
        name: 'posted_url_host_overlap_count',
        value: { kind: 'numeric', value: sharedHosts.size },
      },
      {
        category: cat,
        name: 'posted_url_host_jaccard',
        value: {
          kind: 'numeric',
          value: hostUnion > 0 ? sharedHosts.size / hostUnion : 0,
        },
      },
    ];

    if (sharedUrls.size > 0) {
      features.push({
        category: cat,
        name: 'posted_url_shared',
        value: { kind: 'json', value: [...sharedUrls].sort() },
      });
    }
    if (sharedHosts.size > 0) {
      features.push({
        category: cat,
        name: 'posted_url_shared_hosts',
        value: { kind: 'json', value: [...sharedHosts].sort() },
      });
    }

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseUrlSet(features: AccountFeatureMap): Set<string> | null {
  const v = features.get('posted_urls');
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;

  const out = new Set<string>();
  for (const item of v.value) {
    if (typeof item === 'string' && item.length > 0) out.add(item);
  }
  return out;
}

/**
 * Extract the host portion of a normalized URL string. The
 * normalized form is host + path + (optional ?query), so the host
 * is everything before the first slash or question mark. Returns
 * empty string for malformed input.
 */
function urlHost(normalizedUrl: string): string {
  const slashIdx = normalizedUrl.indexOf('/');
  const qIdx = normalizedUrl.indexOf('?');
  let end = normalizedUrl.length;
  if (slashIdx >= 0 && slashIdx < end) end = slashIdx;
  if (qIdx >= 0 && qIdx < end) end = qIdx;
  return normalizedUrl.slice(0, end);
}

function setMap<T, U>(set: Set<T>, fn: (x: T) => U): Set<U> {
  const out = new Set<U>();
  for (const x of set) {
    const mapped = fn(x);
    if (mapped !== null && mapped !== undefined && mapped !== '') {
      out.add(mapped);
    }
  }
  return out;
}

function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<T>();
  for (const x of small) if (large.has(x)) out.add(x);
  return out;
}

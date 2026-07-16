/**
 * Bio-link-overlap pair extractor.
 *
 * Per the methodology paper §4.6.2 / §6.2.6, this extractor computes set
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
 *      feature when present.
 *   3. Normalize each URL; drop ones that fail to parse.
 *   4. Compute raw Jaccard on full URLs and hosts.
 *   5. When buildContext() has run, also emit rarity-weighted Jaccard
 *      using investigation-corpus document frequency (§6.2.6).
 *
 * Features emitted:
 *   bio_link_count_a / bio_link_count_b
 *   bio_link_overlap_count / bio_link_jaccard
 *   bio_link_host_overlap_count / bio_link_host_jaccard
 *   bio_link_rarity_weighted_jaccard (when context present)
 *   bio_link_host_rarity_weighted_jaccard (when context present)
 *   bio_link_shared_urls / bio_link_shared_hosts (when non-empty)
 *
 * Determinism: pure string parsing, set arithmetic, and integer
 * counting. No randomness, no clock access, no network. Satisfies
 * §6.1.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import { normalizeUrl } from '../stylometric/text-helpers';
import {
  buildDocumentFrequency,
  rarityWeightedJaccard,
} from './rarity';

const NAME = 'bio_link_overlap_cross_platform';
const VERSION = '1.1.0';

const URL_REGEX = /https?:\/\/[^\s<>"'`)\]}]+/gi;

interface BioLinkRarityContext {
  corpusSize: number;
  urlDf: Map<string, number>;
  hostDf: Map<string, number>;
}

export class BioLinkOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'cross_platform' as const;
  readonly requiredAccountFeatures = ['bio'] as const;

  buildContext(
    seedAccounts: ReadonlyArray<{ account: string; features: AccountFeatureMap }>
  ): PairContext {
    const urlSets: Set<string>[] = [];
    const hostSets: Set<string>[] = [];
    for (const { features } of seedAccounts) {
      const bio = getText(features, 'bio') ?? '';
      const profileUrl = getText(features, 'url');
      const urls = collectNormalizedUrls(bio, profileUrl);
      urlSets.push(urls);
      hostSets.push(new Set([...urls].map(extractHost).filter(nonEmpty)));
    }
    const urls = buildDocumentFrequency(urlSets);
    const hosts = buildDocumentFrequency(hostSets);
    const ctx: BioLinkRarityContext = {
      corpusSize: urls.corpusSize,
      urlDf: urls.documentFrequency,
      hostDf: hosts.documentFrequency,
    };
    return ctx;
  }

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    context?: PairContext
  ): ExtractedFeature[] {
    const bioA = getText(featuresA, 'bio');
    const bioB = getText(featuresB, 'bio');
    if (bioA === null || bioB === null) return [];

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

    const rarity = context as BioLinkRarityContext | undefined;
    if (rarity && rarity.corpusSize > 0) {
      features.push(
        {
          category: cat,
          name: 'bio_link_rarity_weighted_jaccard',
          value: {
            kind: 'numeric',
            value: rarityWeightedJaccard(
              urlsA,
              urlsB,
              rarity.urlDf,
              rarity.corpusSize
            ),
          },
        },
        {
          category: cat,
          name: 'bio_link_host_rarity_weighted_jaccard',
          value: {
            kind: 'numeric',
            value: rarityWeightedJaccard(
              hostsA,
              hostsB,
              rarity.hostDf,
              rarity.corpusSize
            ),
          },
        }
      );
    }

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

function getText(features: AccountFeatureMap, name: string): string | null {
  const v = features.get(name);
  if (!v || v.kind !== 'text') return null;
  if (typeof v.value !== 'string') return null;
  return v.value;
}

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
    const candidate = /^https?:\/\//i.test(profileUrl)
      ? profileUrl
      : `https://${profileUrl}`;
    const normalized = normalizeUrl(candidate);
    if (normalized) out.add(normalized);
  }

  return out;
}

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

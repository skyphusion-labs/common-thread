/**
 * External-link corpus overlap pair extractor.
 *
 * Per the methodology paper §4.6.3 / §6.2.6, this extractor compares the
 * set of URLs each account has posted across their content, with
 * investigation-corpus rarity weighting on shared URLs and hosts.
 *
 * Distinct from bio-link-overlap (§4.6.2): bio-link compares
 * accounts' PROFILE URLs; external-link compares accounts' POSTED URLs.
 *
 * Algorithm:
 *   1. Read each account's posted_urls feature (normalized URL strings).
 *   2. Compute raw Jaccard on URL and host sets.
 *   3. When buildContext() has run, emit rarity-weighted Jaccard using
 *      seed-set document frequency (§6.2.6).
 *
 * Features emitted:
 *   posted_url_count_a / posted_url_count_b
 *   posted_url_overlap_count / posted_url_jaccard
 *   posted_url_host_overlap_count / posted_url_host_jaccard
 *   posted_url_rarity_weighted_jaccard (when context present)
 *   posted_url_host_rarity_weighted_jaccard (when context present)
 *   posted_url_shared / posted_url_shared_hosts (when non-empty)
 *
 * Determinism: pure string-set arithmetic. Satisfies §6.1.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import {
  buildDocumentFrequency,
  rarityWeightedJaccard,
} from './rarity';

const NAME = 'external_link_overlap_cross_platform';
const VERSION = '1.1.0';

interface PostedUrlRarityContext {
  corpusSize: number;
  urlDf: Map<string, number>;
  hostDf: Map<string, number>;
}

export class ExternalLinkOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'cross_platform' as const;
  readonly requiredAccountFeatures = ['posted_urls'] as const;

  buildContext(
    seedAccounts: ReadonlyArray<{ account: string; features: AccountFeatureMap }>
  ): PairContext {
    const urlSets: Set<string>[] = [];
    const hostSets: Set<string>[] = [];
    for (const { features } of seedAccounts) {
      const urls = parseUrlSet(features) ?? new Set<string>();
      urlSets.push(urls);
      hostSets.push(setMap(urls, urlHost));
    }
    const urls = buildDocumentFrequency(urlSets);
    const hosts = buildDocumentFrequency(hostSets);
    const ctx: PostedUrlRarityContext = {
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

    const rarity = context as PostedUrlRarityContext | undefined;
    if (rarity && rarity.corpusSize > 0) {
      features.push(
        {
          category: cat,
          name: 'posted_url_rarity_weighted_jaccard',
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
          name: 'posted_url_host_rarity_weighted_jaccard',
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

/**
 * Subreddit overlap pair extractor (Reddit-native network signal).
 *
 * Compares subreddit_distribution features emitted by temporal_reddit.
 * Accounts that post in the same niche communities with similar
 * frequency patterns are more likely to share an operator than accounts
 * that only overlap on default/large subreddits.
 *
 * Algorithm mirrors client_app_overlap: key-set Jaccard plus JSD on
 * count distributions (log base 2, result in [0, 1]).
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import {
  dictJensenShannonDivergence,
  dictKeyJaccard,
} from '../metadata-leakage/distribution-jsd';

const NAME = 'subreddit_overlap_network';
const VERSION = '1.0.0';

export class SubredditOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'network' as const;
  readonly requiredAccountFeatures = ['subreddit_distribution'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const distA = parseDistribution(featuresA);
    const distB = parseDistribution(featuresB);
    if (!distA || !distB) return [];

    const jaccard = dictKeyJaccard(distA, distB);
    const jsd = dictJensenShannonDivergence(distA, distB);

    const cat = 'network' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'subreddit_jaccard',
        value: { kind: 'numeric', value: jaccard },
      },
      {
        category: cat,
        name: 'subreddit_jsd',
        value: { kind: 'numeric', value: jsd },
      },
      {
        category: cat,
        name: 'subreddit_similarity',
        value: { kind: 'numeric', value: 1 - jsd },
      },
    ];

    const shared = sharedKeys(distA, distB);
    if (shared.length > 0) {
      features.push({
        category: cat,
        name: 'subreddit_shared',
        value: { kind: 'json', value: shared },
      });
      features.push({
        category: cat,
        name: 'subreddit_overlap_count',
        value: { kind: 'numeric', value: shared.length },
      });
    }

    return features;
  }
}

function parseDistribution(features: AccountFeatureMap): Record<string, number> | null {
  const v = features.get('subreddit_distribution');
  if (!v || v.kind !== 'json') return null;
  if (!v.value || typeof v.value !== 'object' || Array.isArray(v.value)) return null;

  const dist: Record<string, number> = {};
  for (const [key, val] of Object.entries(v.value as Record<string, unknown>)) {
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      dist[key] = val;
    }
  }
  return Object.keys(dist).length > 0 ? dist : null;
}

function sharedKeys(
  a: Record<string, number>,
  b: Record<string, number>
): string[] {
  const keysA = new Set(Object.keys(a));
  const out: string[] = [];
  for (const k of Object.keys(b)) {
    if (keysA.has(k)) out.push(k);
  }
  return out.sort();
}

/**
 * Rarity-weighted bio text overlap (§6.2.6).
 *
 * Tokenizes bios into alphanumeric tokens (length ≥ 3), builds
 * investigation-corpus document frequency via buildContext(), and
 * emits raw Jaccard plus rarity-weighted Jaccard on the token sets.
 *
 * Platform-agnostic: works for Twitter, Mastodon, Bluesky, etc. as
 * long as account_metadata.bio is populated.
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
  tokenizeBio,
} from './rarity';

const NAME = 'bio_text_rarity_overlap_cross_platform';
const VERSION = '1.0.0';

interface BioTextRarityContext {
  corpusSize: number;
  tokenDf: Map<string, number>;
}

export class BioTextRarityOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'cross_platform' as const;
  readonly requiredAccountFeatures = ['bio'] as const;

  buildContext(
    seedAccounts: ReadonlyArray<{ account: string; features: AccountFeatureMap }>
  ): PairContext {
    const tokenSets: Set<string>[] = [];
    for (const { features } of seedAccounts) {
      const bio = getText(features, 'bio') ?? '';
      tokenSets.push(tokenizeBio(bio));
    }
    const built = buildDocumentFrequency(tokenSets);
    const ctx: BioTextRarityContext = {
      corpusSize: built.corpusSize,
      tokenDf: built.documentFrequency,
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

    const tokensA = tokenizeBio(bioA);
    const tokensB = tokenizeBio(bioB);

    const shared = intersect(tokensA, tokensB);
    const union = tokensA.size + tokensB.size - shared.size;

    const cat = 'cross_platform' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'bio_token_count_a',
        value: { kind: 'numeric', value: tokensA.size },
      },
      {
        category: cat,
        name: 'bio_token_count_b',
        value: { kind: 'numeric', value: tokensB.size },
      },
      {
        category: cat,
        name: 'bio_token_overlap_count',
        value: { kind: 'numeric', value: shared.size },
      },
      {
        category: cat,
        name: 'bio_token_jaccard',
        value: {
          kind: 'numeric',
          value: union > 0 ? shared.size / union : 0,
        },
      },
    ];

    const rarity = context as BioTextRarityContext | undefined;
    if (rarity && rarity.corpusSize > 0) {
      features.push({
        category: cat,
        name: 'bio_token_rarity_weighted_jaccard',
        value: {
          kind: 'numeric',
          value: rarityWeightedJaccard(
            tokensA,
            tokensB,
            rarity.tokenDf,
            rarity.corpusSize
          ),
        },
      });
    }

    if (shared.size > 0) {
      features.push({
        category: cat,
        name: 'bio_token_shared',
        value: { kind: 'json', value: [...shared].sort() },
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

function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<T>();
  for (const x of small) if (large.has(x)) out.add(x);
  return out;
}

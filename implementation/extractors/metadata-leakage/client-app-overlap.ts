/**
 * Client-app overlap pair extractor.
 *
 * Per the methodology paper §4.7, this extractor compares the
 * distribution of client applications two accounts use to post.
 * When platform metadata exposes the posting client (Twitter's
 * 'source' field, available on older API tiers and some scrapers),
 * the per-account distribution over apps is a high-leverage signal
 * for sockpuppet attribution: operators tend to post all their
 * sockpuppets from the same machine or session, producing identical
 * client signatures.
 *
 * Algorithm:
 *
 *   1. Read each account's client_app_distribution (a JSON object
 *      mapping app names to counts).
 *   2. Compute Jaccard over the key sets (which apps appear in both
 *      accounts' distributions).
 *   3. Compute Jensen-Shannon divergence over the count
 *      distributions, log base 2 so the result is in [0, 1].
 *   4. Compute similarity = 1 - JSD as a friendly "higher means
 *      more alike" companion to the raw divergence.
 *
 * Interpretation:
 *   - jaccard == 1 AND jsd small (~0): same apps in same proportions
 *     (strong same-operator signal)
 *   - jaccard == 1 AND jsd large: same apps but very different mix
 *     (weak signal; could reflect different usage patterns of the
 *     same operator on different sockpuppets, or just two
 *     unrelated accounts with overlapping app preferences)
 *   - jaccard == 0: completely disjoint apps (mild divergence
 *     signal, though small per-account sample sizes can produce
 *     this by chance)
 *
 * Features emitted per pair (all always emitted when both accounts
 * have client_app_distribution):
 *
 *   client_app_jaccard (numeric, [0, 1]; key-set Jaccard)
 *   client_app_jsd (numeric, [0, 1]; JSD on count distributions)
 *   client_app_similarity (numeric, [0, 1]; 1 - jsd)
 *   client_app_shared (json, sorted array of shared app names;
 *     only when intersection is non-empty)
 *
 * Determinism: pure JSON parsing and arithmetic. No randomness, no
 * clock, no I/O. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either distribution empty: jaccard = 0, jsd = 1 (treated as
 *     maximally divergent). This rarely happens in practice because
 *     the account extractor only emits the feature when at least one
 *     tweet carried a source field.
 *   - Both distributions identical: jaccard = 1, jsd = 0,
 *     similarity = 1.
 *   - Malformed JSON (shouldn't happen given the account extractor's
 *     output): caught and the pair returns empty.
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
} from './distribution-jsd';

const NAME = 'client_app_overlap_metadata_leakage';
const VERSION = '1.0.0';

export class ClientAppOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'metadata_leakage' as const;
  readonly requiredAccountFeatures = ['client_app_distribution'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const distA = parseDistribution(featuresA, 'client_app_distribution');
    const distB = parseDistribution(featuresB, 'client_app_distribution');
    if (!distA || !distB) return [];

    const jaccard = dictKeyJaccard(distA, distB);
    const jsd = dictJensenShannonDivergence(distA, distB);

    const cat = 'metadata_leakage' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'client_app_jaccard',
        value: { kind: 'numeric', value: jaccard },
      },
      {
        category: cat,
        name: 'client_app_jsd',
        value: { kind: 'numeric', value: jsd },
      },
      {
        category: cat,
        name: 'client_app_similarity',
        value: { kind: 'numeric', value: 1 - jsd },
      },
    ];

    // Surface shared apps for human review when present.
    const shared = sharedKeys(distA, distB);
    if (shared.length > 0) {
      features.push({
        category: cat,
        name: 'client_app_shared',
        value: { kind: 'json', value: shared },
      });
    }

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDistribution(
  features: AccountFeatureMap,
  name: string
): Record<string, number> | null {
  const v = features.get(name);
  if (!v || v.kind !== 'json') return null;
  if (!v.value || typeof v.value !== 'object' || Array.isArray(v.value)) return null;

  const dist: Record<string, number> = {};
  for (const [key, val] of Object.entries(v.value as Record<string, unknown>)) {
    if (typeof val === 'number' && Number.isFinite(val) && val > 0) {
      dist[key] = val;
    }
  }
  return dist;
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

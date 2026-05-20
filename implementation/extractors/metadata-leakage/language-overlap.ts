/**
 * Per-tweet language overlap pair extractor.
 *
 * Per the methodology paper §4.7, this extractor compares the
 * distribution of per-tweet auto-detected languages between two
 * accounts. This signal is distinct from the stylometric character-
 * bigram comparison (§4.3) because it's platform-supplied metadata
 * rather than content-derived inference: Twitter's lang field is
 * computed by Twitter, not by the methodology, so it's a separate
 * piece of evidence even when the underlying content correlation
 * is high.
 *
 * Practical interpretation: two accounts whose lang distributions
 * are very similar share either (a) the same operator posting in
 * the same languages, or (b) the same general topic/audience
 * (which produces overlapping lang automatic detection). The
 * signal alone is weak; combined with other signals (same client
 * app, overlapping followers, similar posting cadence), matching
 * lang distributions add corroboration.
 *
 * Algorithm: identical to client-app-overlap. Reads the per-account
 * tweet_language_distribution, computes Jaccard on the lang code
 * key set and JSD on the count distributions. See client-app-
 * overlap.ts for the full algorithm description.
 *
 * Features emitted per pair (always emitted when both accounts have
 * tweet_language_distribution):
 *
 *   tweet_language_jaccard (numeric, [0, 1])
 *   tweet_language_jsd (numeric, [0, 1])
 *   tweet_language_similarity (numeric, [0, 1]; 1 - jsd)
 *   tweet_language_shared (json, sorted array of shared lang codes;
 *     only when intersection is non-empty)
 *
 * Determinism: pure JSON parsing and arithmetic. No randomness, no
 * clock, no I/O. Satisfies §6.1.
 *
 * Edge cases: same as client-app-overlap.
 *
 * Notable behavior: Twitter's 'und' marker for undetected language
 * is treated as a distinct key, not dropped. Two accounts that both
 * tweet heavily in 'und' (e.g., short tweets, emoji-only, or
 * languages Twitter doesn't auto-detect well) will match on that
 * key, which is meaningful: it captures a real pattern in posting
 * behavior even though the underlying language is unknown.
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

const NAME = 'tweet_language_overlap_metadata_leakage';
const VERSION = '1.0.0';

export class TweetLanguageOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'metadata_leakage' as const;
  readonly requiredAccountFeatures = ['tweet_language_distribution'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const distA = parseDistribution(featuresA, 'tweet_language_distribution');
    const distB = parseDistribution(featuresB, 'tweet_language_distribution');
    if (!distA || !distB) return [];

    const jaccard = dictKeyJaccard(distA, distB);
    const jsd = dictJensenShannonDivergence(distA, distB);

    const cat = 'metadata_leakage' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'tweet_language_jaccard',
        value: { kind: 'numeric', value: jaccard },
      },
      {
        category: cat,
        name: 'tweet_language_jsd',
        value: { kind: 'numeric', value: jsd },
      },
      {
        category: cat,
        name: 'tweet_language_similarity',
        value: { kind: 'numeric', value: 1 - jsd },
      },
    ];

    const shared = sharedKeys(distA, distB);
    if (shared.length > 0) {
      features.push({
        category: cat,
        name: 'tweet_language_shared',
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

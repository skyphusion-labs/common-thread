/**
 * Mutual-follow pair extractor.
 *
 * Per the methodology paper §4.4.2, this extractor detects whether
 * two accounts in a pair follow each other. Mutual-follow is a one-bit
 * signal per pair, less information-rich than the §4.4.1 Jaccard but
 * sharply diagnostic when present: shared operators frequently mutual-
 * follow their own sockpuppets to seed organic-looking follower
 * graphs.
 *
 * Two independent evidence sources:
 *
 *   "A follows B" is attestable from either:
 *     (a) A's following_set contains B (active evidence: this is what
 *         A's account did)
 *     (b) B's follower_set contains A (passive evidence: this is what
 *         B's followers list shows)
 *
 * In a well-collected archive these two sources agree. Disagreement
 * indicates collection skew or a stale snapshot. The extractor
 * surfaces the agreement as a corroboration score so the attribution
 * reasoner can downweight pairs where the underlying data is shaky.
 *
 * Algorithm (no community baseline; mutual-follow is a pairwise
 * boolean, not a similarity score):
 *
 *   a_follows_b = (b appears in a.following_set) OR (a appears in b.follower_set)
 *   b_follows_a = (a appears in b.following_set) OR (b appears in a.follower_set)
 *   mutual = a_follows_b AND b_follows_a
 *
 *   For corroboration on each direction:
 *     0 = no evidence
 *     1 = one source attests (either following or follower set, but
 *         not both; either source is missing the other endpoint or
 *         the two sets disagree)
 *     2 = both sources attest (the canonical case)
 *
 * Features emitted per pair (always emitted when both accounts have
 * both follower_set and following_set):
 *
 *   a_follows_b (numeric, 0 or 1)
 *   b_follows_a (numeric, 0 or 1)
 *   mutual_follow (numeric, 0 or 1)
 *   a_follows_b_corroboration (numeric, 0, 1, or 2)
 *   b_follows_a_corroboration (numeric, 0, 1, or 2)
 *   mutual_follow_min_corroboration (numeric, 0, 1, or 2; the weaker
 *     of the two direction-level corroboration scores, useful as a
 *     single summary for ranking)
 *
 * Determinism: pure set membership checks. No randomness, no clock
 * access, no I/O. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either account missing follower_set or following_set: returns
 *     empty (the runner filter handles this; the guard is here too).
 *   - Username casing: both follower_set and following_set are
 *     lowercase per the account extractor's normalization. The pair
 *     extractor compares the canonical pair account identifiers
 *     verbatim, which the runner provides as the values stored in
 *     seed_accounts.account_identifier. If seed accounts are stored
 *     with mixed casing, set lookups will fail; this is an upstream
 *     concern.
 *   - Self-pair: the runner enforces account_a != account_b, so this
 *     case cannot reach extract().
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'mutual_follow_network';
const VERSION = '1.0.0';

export class MutualFollowExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'network' as const;
  readonly requiredAccountFeatures = ['follower_set', 'following_set'] as const;

  extract(
    accountA: string,
    accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const followingA = parseSet(featuresA, 'following_set');
    const followerA = parseSet(featuresA, 'follower_set');
    const followingB = parseSet(featuresB, 'following_set');
    const followerB = parseSet(featuresB, 'follower_set');
    if (!followingA || !followerA || !followingB || !followerB) return [];

    // Compare with lowercased account identifiers so the lookup
    // matches the lowercase normalization the account extractor
    // applies to set members.
    const aKey = accountA.toLowerCase();
    const bKey = accountB.toLowerCase();

    // Each direction has two possible attestations. Count how many
    // fire for each direction.
    const aToBSources = [followingA.has(bKey), followerB.has(aKey)];
    const bToASources = [followingB.has(aKey), followerA.has(bKey)];

    const aToBCorroboration = aToBSources.filter(Boolean).length;
    const bToACorroboration = bToASources.filter(Boolean).length;
    const aFollowsB = aToBCorroboration > 0 ? 1 : 0;
    const bFollowsA = bToACorroboration > 0 ? 1 : 0;
    const mutual = aFollowsB === 1 && bFollowsA === 1 ? 1 : 0;
    const minCorroboration = mutual === 1
      ? Math.min(aToBCorroboration, bToACorroboration)
      : 0;

    const cat = 'network' as const;
    return [
      {
        category: cat,
        name: 'a_follows_b',
        value: { kind: 'numeric', value: aFollowsB },
      },
      {
        category: cat,
        name: 'b_follows_a',
        value: { kind: 'numeric', value: bFollowsA },
      },
      {
        category: cat,
        name: 'mutual_follow',
        value: { kind: 'numeric', value: mutual },
      },
      {
        category: cat,
        name: 'a_follows_b_corroboration',
        value: { kind: 'numeric', value: aToBCorroboration },
      },
      {
        category: cat,
        name: 'b_follows_a_corroboration',
        value: { kind: 'numeric', value: bToACorroboration },
      },
      {
        category: cat,
        name: 'mutual_follow_min_corroboration',
        value: { kind: 'numeric', value: minCorroboration },
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSet(
  features: AccountFeatureMap,
  name: string
): Set<string> | null {
  const v = features.get(name);
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;
  const out = new Set<string>();
  for (const item of v.value) {
    if (typeof item === 'string' && item.length > 0) out.add(item);
  }
  return out;
}

/**
 * Handle-reuse pair extractor.
 *
 * Per the methodology paper §4.6.1, this extractor computes near-match
 * similarity between two accounts' handles (usernames). The signal is
 * a strong indicator of shared-operator status when the variant pattern
 * is recognizable (numeric suffix, year suffix, underscore/dot
 * insertion) and a weaker indicator at higher edit distances.
 *
 * Algorithm:
 *   1. Normalize each handle: lowercase, strip leading @, u/, r/,
 *      /u/, /r/ prefixes.
 *   2. Walk through a priority-ordered list of transformations. For
 *      each transformation, apply it to both handles and check for
 *      equality. The first transformation that yields equality wins.
 *   3. Fall back to Levenshtein edit distance on the normalized
 *      originals when no transformation matches.
 *
 * Variant priority (most-likely-same-operator first):
 *   - exact: identity (handles match after normalization)
 *   - year_suffix: trailing 19xx or 20xx year removed
 *   - numeric_suffix: any trailing digits removed
 *   - underscores_stripped: all underscores removed
 *   - dots_stripped: all dots removed
 *   - separators_stripped: underscores, dots, hyphens removed together
 *   - core_match: all separators AND digits removed
 *   - similar: fallback Levenshtein-based fuzzy match
 *   - no_match: edit distance too large to be informative
 *
 * Features emitted (always emitted when both handles are present):
 *   handle_a_normalized (text)
 *   handle_b_normalized (text)
 *   handle_match_variant (text, one of the labels above)
 *   handle_match_score (numeric, [0, 1], higher = more similar)
 *   handle_edit_distance (numeric, raw Levenshtein on normalized
 *     originals; useful for downstream reasoning regardless of which
 *     variant matched)
 *
 * Determinism: pure string operations and integer arithmetic. No
 * randomness, no clock access, no I/O. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either handle missing or empty after normalization: returns empty.
 *   - Single-character handles: exact match only meaningful; everything
 *     else falls to the similar/no_match fallback.
 *   - Mixed-script handles (Cyrillic vs Latin, etc.): the normalization
 *     preserves character codepoints, so a transliteration-based match
 *     will not score high. Levenshtein at character level still works.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'handle_reuse_cross_platform';
const VERSION = '1.0.0';

// Priority-ordered transformation list. Each transformation returns its
// label, the score awarded if the transformed handles match, and the
// transform function. The walker stops at the first match.
const TRANSFORMATIONS: ReadonlyArray<{
  label: string;
  score: number;
  transform: (h: string) => string;
}> = [
  { label: 'exact', score: 1.0, transform: h => h },
  {
    label: 'year_suffix',
    score: 0.95,
    transform: h => h.replace(/(?:19|20)\d{2}$/, ''),
  },
  {
    label: 'numeric_suffix',
    score: 0.90,
    transform: h => h.replace(/\d+$/, ''),
  },
  {
    label: 'underscores_stripped',
    score: 0.88,
    transform: h => h.replace(/_/g, ''),
  },
  {
    label: 'dots_stripped',
    score: 0.86,
    transform: h => h.replace(/\./g, ''),
  },
  {
    label: 'separators_stripped',
    score: 0.83,
    transform: h => h.replace(/[._\-]/g, ''),
  },
  {
    label: 'core_match',
    score: 0.78,
    transform: h => h.replace(/[._\-\d]/g, ''),
  },
];

// Levenshtein-based fallback score cap. The fallback variant cannot
// score higher than this; the explicit transformations always win on
// score ties so the variant label preserves semantic information.
const SIMILAR_SCORE_CAP = 0.75;
const SIMILAR_SCORE_FLOOR = 0.5;

export class HandleReuseExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'cross_platform' as const;
  readonly requiredAccountFeatures = ['username'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const rawA = getUsername(featuresA);
    const rawB = getUsername(featuresB);
    if (!rawA || !rawB) return [];

    const normA = normalizeHandle(rawA);
    const normB = normalizeHandle(rawB);
    if (normA.length === 0 || normB.length === 0) return [];

    const result = matchHandles(normA, normB);
    const editDistance = levenshtein(normA, normB);

    const cat = 'cross_platform' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'handle_a_normalized',
        value: { kind: 'text', value: normA },
      },
      {
        category: cat,
        name: 'handle_b_normalized',
        value: { kind: 'text', value: normB },
      },
      {
        category: cat,
        name: 'handle_match_variant',
        value: { kind: 'text', value: result.variant },
      },
      {
        category: cat,
        name: 'handle_match_score',
        value: { kind: 'numeric', value: result.score },
      },
      {
        category: cat,
        name: 'handle_edit_distance',
        value: { kind: 'numeric', value: editDistance },
      },
    ];

    return features;
  }
}

// ---------------------------------------------------------------------------
// Match algorithm
// ---------------------------------------------------------------------------

interface MatchResult {
  variant: string;
  score: number;
}

function matchHandles(normA: string, normB: string): MatchResult {
  // Walk transformations in priority order.
  for (const t of TRANSFORMATIONS) {
    const transformedA = t.transform(normA);
    const transformedB = t.transform(normB);
    if (transformedA.length === 0 || transformedB.length === 0) continue;
    if (transformedA === transformedB) {
      return { variant: t.label, score: t.score };
    }
  }

  // Fallback: Levenshtein-based fuzzy match on the normalized originals.
  const d = levenshtein(normA, normB);
  const maxLen = Math.max(normA.length, normB.length);
  const rawScore = maxLen > 0 ? 1 - d / maxLen : 0;
  const cappedScore = Math.min(rawScore, SIMILAR_SCORE_CAP);

  if (cappedScore >= SIMILAR_SCORE_FLOOR) {
    return { variant: 'similar', score: cappedScore };
  }
  return { variant: 'no_match', score: Math.max(cappedScore, 0) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUsername(features: AccountFeatureMap): string | null {
  const v = features.get('username');
  if (!v || v.kind !== 'text') return null;
  if (typeof v.value !== 'string' || v.value.length === 0) return null;
  return v.value;
}

/**
 * Normalize a handle for comparison. Lowercases, strips platform
 * prefixes (@, u/, r/, /u/, /r/), and trims whitespace.
 */
function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\/?[ur]\//, '')
    .replace(/^@/, '');
}

/**
 * Levenshtein edit distance between two strings, computed via the
 * standard two-row dynamic-programming algorithm. O(m*n) time, O(n)
 * space. Suitable for handle-length inputs (typically <= 50 chars).
 */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

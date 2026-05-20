/**
 * Profile language agreement pair extractor.
 *
 * Per the methodology paper §4.7 (metadata leakage), this extractor
 * compares the platform-supplied profile language setting between
 * two accounts. The 'lang' field on a Twitter user object is a user-
 * settable preference (e.g., 'en', 'fr', 'ja', 'tr'). Twitter removed
 * it from default API responses around 2019 but some archives and
 * scrapers still expose it.
 *
 * Signal characterization:
 *
 *   Profile-language agreement is a WEAK SIGNAL alone. The most
 *   common values ('en', 'es', 'pt', 'fr') agree by chance among
 *   millions of accounts. The signal becomes diagnostic when:
 *
 *     - The shared lang is uncommon globally (e.g., 'ja', 'tr', 'fa').
 *       Two accounts in a sockpuppet network both set to a small-
 *       population language is far less likely by chance.
 *     - The lang corroborates other signals: temporal cadence
 *       alignment plus shared rare lang plus same client app plus
 *       handle similarity is a network of weak signals that compound.
 *
 *   The pair extractor itself is intentionally simple: agreement/
 *   disagreement plus the raw values. The attribution reasoner
 *   downstream is responsible for weighting based on language
 *   prevalence and other available signals.
 *
 * Features emitted per pair (always when both accounts have
 * profile_lang; intentionally NOT emitted when either side is
 * missing, since the agreement question is unanswerable):
 *
 *   profile_lang_match (numeric, 0 or 1; 1 = identical after
 *     normalization)
 *   profile_lang_a (text, the normalized value for account A)
 *   profile_lang_b (text, the normalized value for account B)
 *
 * Normalization: lowercase, trim whitespace. Twitter normally emits
 * lowercase already but defensive normalization is cheap.
 *
 * Determinism: pure string comparison. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either side missing the feature: returns empty (the
 *     requiredAccountFeatures filter should handle this, but the
 *     extractor double-checks).
 *   - Empty strings after normalization: treated as missing; returns
 *     empty.
 *   - Cross-platform pair where one side is Reddit: Reddit doesn't
 *     emit profile_lang, so the requiredAccountFeatures filter
 *     excludes those pairs naturally.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'profile_lang_overlap_metadata_leakage';
const VERSION = '1.0.0';

export class ProfileLangOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'metadata_leakage' as const;
  readonly requiredAccountFeatures = ['profile_lang'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const langA = readNormalizedLang(featuresA);
    const langB = readNormalizedLang(featuresB);
    if (!langA || !langB) return [];

    const match = langA === langB;
    const cat = 'metadata_leakage' as const;

    return [
      {
        category: cat,
        name: 'profile_lang_match',
        value: { kind: 'numeric', value: match ? 1 : 0 },
      },
      {
        category: cat,
        name: 'profile_lang_a',
        value: { kind: 'text', value: langA },
      },
      {
        category: cat,
        name: 'profile_lang_b',
        value: { kind: 'text', value: langB },
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readNormalizedLang(features: AccountFeatureMap): string | null {
  const v = features.get('profile_lang');
  if (!v || v.kind !== 'text') return null;
  const normalized = v.value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Bio template matching pair extractor (§4.1.3).
 *
 * Parses bios into a coarse slot fingerprint (pipes, links, mentions,
 * hashtags, emoji density, word-count band) and compares fingerprints
 * across accounts. Identical fingerprints suggest template-bound bios.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'bio_template_overlap_account_metadata';
const VERSION = '1.0.0';

export class BioTemplateOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'account_metadata' as const;
  readonly requiredAccountFeatures = ['bio'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const bioA = readText(featuresA, 'bio');
    const bioB = readText(featuresB, 'bio');
    if (bioA === null || bioB === null) return [];

    const fpA = bioFingerprint(bioA);
    const fpB = bioFingerprint(bioB);
    const match = fpA === fpB;

    return [
      {
        category: 'account_metadata',
        name: 'bio_template_fingerprint_match',
        value: { kind: 'numeric', value: match ? 1 : 0 },
      },
      {
        category: 'account_metadata',
        name: 'bio_template_fingerprint_a',
        value: { kind: 'text', value: fpA },
      },
      {
        category: 'account_metadata',
        name: 'bio_template_fingerprint_b',
        value: { kind: 'text', value: fpB },
      },
    ];
  }
}

function readText(features: AccountFeatureMap, name: string): string | null {
  const v = features.get(name);
  if (!v || v.kind !== 'text') return null;
  return v.value;
}

function bioFingerprint(bio: string): string {
  const trimmed = bio.trim();
  const words = trimmed.length > 0 ? trimmed.split(/\s+/).length : 0;
  const wordBand =
    words === 0 ? 'w0' : words <= 5 ? 'w1-5' : words <= 15 ? 'w6-15' : 'w16+';

  const flags = [
    wordBand,
    trimmed.includes('|') ? 'pipe' : 'nopipe',
    /https?:\/\//i.test(trimmed) ? 'link' : 'nolink',
    /@[A-Za-z0-9_]{1,15}/.test(trimmed) ? 'mention' : 'noment',
    /#[\w\u00C0-\uFFFF]+/.test(trimmed) ? 'hash' : 'nohash',
    /\p{Extended_Pictographic}/u.test(trimmed) ? 'emoji' : 'noemoji',
    /[,;]/.test(trimmed) ? 'punct' : 'nopunct',
  ];

  return flags.join('|');
}

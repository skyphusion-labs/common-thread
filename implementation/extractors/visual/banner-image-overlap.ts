/**
 * Banner-image overlap pair extractor.
 *
 * Per the methodology paper §4.5.2, this extractor compares the
 * banner (header) images of two accounts. Algorithm and feature
 * structure are identical to ProfileImageOverlapExtractor; the only
 * differences are the required feature name and the emitted feature
 * names (all prefixed banner_image_ instead of profile_image_).
 *
 * Operational note: banner-image overlap is weaker evidence than
 * profile-image overlap because banners are more frequently set to
 * stock photos, default platform images, or generic scenery. The
 * attribution reasoner should weight banner overlap below profile
 * overlap unless the banner is an unusual or identifying image.
 *
 * Features emitted per pair (identical algorithm to profile, see
 * profile-image-overlap.ts for the full contract):
 *
 *   banner_image_byte_equality (numeric, 0 or 1)
 *   banner_image_hamming_distance (numeric, [0, 64]; conditional)
 *   banner_image_similarity (numeric, [0, 1]; conditional)
 *   banner_image_match_band (text; conditional)
 *
 * Determinism: same as profile-image-overlap. Satisfies §6.1.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import {
  dhashFromHex,
  hammingDistance,
  dhashSimilarity,
  dhashMatchBand,
} from './dhash';

const NAME = 'banner_image_overlap_visual';
const VERSION = '1.0.0';

export class BannerImageOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'visual' as const;
  readonly requiredAccountFeatures = ['banner_image_sha256'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const sha256A = getText(featuresA, 'banner_image_sha256');
    const sha256B = getText(featuresB, 'banner_image_sha256');
    if (!sha256A || !sha256B) return [];

    const features: ExtractedFeature[] = [
      {
        category: 'visual',
        name: 'banner_image_byte_equality',
        value: { kind: 'numeric', value: sha256A === sha256B ? 1 : 0 },
      },
    ];

    const dhashHexA = getText(featuresA, 'banner_image_dhash');
    const dhashHexB = getText(featuresB, 'banner_image_dhash');
    if (dhashHexA && dhashHexB) {
      try {
        const hashA = dhashFromHex(dhashHexA);
        const hashB = dhashFromHex(dhashHexB);
        const dist = hammingDistance(hashA, hashB);
        features.push(
          {
            category: 'visual',
            name: 'banner_image_hamming_distance',
            value: { kind: 'numeric', value: dist },
          },
          {
            category: 'visual',
            name: 'banner_image_similarity',
            value: { kind: 'numeric', value: dhashSimilarity(dist) },
          },
          {
            category: 'visual',
            name: 'banner_image_match_band',
            value: { kind: 'text', value: dhashMatchBand(dist) },
          }
        );
      } catch {
        // Malformed dhash hex; suppress perceptual comparison but
        // keep byte_equality.
      }
    }

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getText(features: AccountFeatureMap, name: string): string | null {
  const v = features.get(name);
  if (!v || v.kind !== 'text') return null;
  if (typeof v.value !== 'string' || v.value.length === 0) return null;
  return v.value;
}

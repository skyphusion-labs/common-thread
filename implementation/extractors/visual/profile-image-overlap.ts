/**
 * Profile-image overlap pair extractor.
 *
 * Per the methodology paper §4.5.1, this extractor compares the
 * profile images of two accounts via two independent signals:
 *
 *   1. SHA-256 byte equality (catches verbatim image reuse; binary
 *      0/1 signal). Always emitted because both account-level
 *      extractors emit profile_image_sha256.
 *
 *   2. dHash Hamming distance (catches near-duplicates, re-encodings,
 *      and resizes; continuous signal in [0, 64]). Emitted only when
 *      both accounts have a profile_image_dhash feature.
 *
 * Operationally these two signals are complementary: SHA-256 catches
 * the "operator copied the same file" case with perfect precision;
 * dHash catches the "operator re-uploaded the image at a different
 * size or after light editing" case where SHA-256 would miss the
 * connection.
 *
 * Algorithm:
 *   byte_equality = 1 if SHA-256 strings match, else 0
 *   hamming_distance = popcount(dhashA XOR dhashB)  (0..64)
 *   similarity = 1 - hamming_distance / 64          (0..1)
 *   match_band = 'near_identical' | 'similar' | 'distinct'
 *                (threshold table in dhash.ts)
 *
 * Features emitted per pair:
 *
 *   profile_image_byte_equality (numeric, 0 or 1; always emitted)
 *   profile_image_hamming_distance (numeric, [0, 64]; emitted only
 *     when both accounts have profile_image_dhash)
 *   profile_image_similarity (numeric, [0, 1]; emitted alongside
 *     hamming_distance)
 *   profile_image_match_band (text; emitted alongside hamming_distance)
 *
 * Determinism: pure string equality and integer bit operations. No
 * randomness, no clock, no I/O. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either account missing profile_image_sha256: returns empty.
 *     This is enforced by the runner via requiredAccountFeatures.
 *   - Both accounts have sha256 but neither has dhash: emit only
 *     byte_equality. This happens when the artifact was an encoded
 *     image (image/jpeg or image/png) that the v1.0.0 extractor
 *     could not decode.
 *   - One account has dhash but the other doesn't: emit only
 *     byte_equality. Asymmetric data isn't compared.
 *   - Malformed dhash hex (shouldn't happen given the account
 *     extractor's encoding, but be defensive): caught and ignored;
 *     byte_equality still emits.
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

const NAME = 'profile_image_overlap_visual';
const VERSION = '1.0.0';

export class ProfileImageOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'visual' as const;
  readonly requiredAccountFeatures = ['profile_image_sha256'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const sha256A = getText(featuresA, 'profile_image_sha256');
    const sha256B = getText(featuresB, 'profile_image_sha256');
    if (!sha256A || !sha256B) return [];

    const features: ExtractedFeature[] = [
      {
        category: 'visual',
        name: 'profile_image_byte_equality',
        value: { kind: 'numeric', value: sha256A === sha256B ? 1 : 0 },
      },
    ];

    // Perceptual hash comparison, if available on both sides.
    const dhashHexA = getText(featuresA, 'profile_image_dhash');
    const dhashHexB = getText(featuresB, 'profile_image_dhash');
    if (dhashHexA && dhashHexB) {
      try {
        const hashA = dhashFromHex(dhashHexA);
        const hashB = dhashFromHex(dhashHexB);
        const dist = hammingDistance(hashA, hashB);
        features.push(
          {
            category: 'visual',
            name: 'profile_image_hamming_distance',
            value: { kind: 'numeric', value: dist },
          },
          {
            category: 'visual',
            name: 'profile_image_similarity',
            value: { kind: 'numeric', value: dhashSimilarity(dist) },
          },
          {
            category: 'visual',
            name: 'profile_image_match_band',
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

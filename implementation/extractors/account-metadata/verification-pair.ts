/**
 * Verification status agreement pair extractor (§4.1.4).
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'verification_agreement_account_metadata';
const VERSION = '1.0.0';

export class VerificationAgreementExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'account_metadata' as const;
  readonly requiredAccountFeatures = ['verified', 'blue_verified'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const verifiedA = readBool(featuresA, 'verified');
    const verifiedB = readBool(featuresB, 'verified');
    const blueA = readBool(featuresA, 'blue_verified');
    const blueB = readBool(featuresB, 'blue_verified');

    if (
      verifiedA === null ||
      verifiedB === null ||
      blueA === null ||
      blueB === null
    ) {
      return [];
    }

    return [
      {
        category: 'account_metadata',
        name: 'verified_match',
        value: { kind: 'numeric', value: verifiedA === verifiedB ? 1 : 0 },
      },
      {
        category: 'account_metadata',
        name: 'blue_verified_match',
        value: { kind: 'numeric', value: blueA === blueB ? 1 : 0 },
      },
      {
        category: 'account_metadata',
        name: 'both_blue_verified',
        value: { kind: 'numeric', value: blueA && blueB ? 1 : 0 },
      },
      {
        category: 'account_metadata',
        name: 'verification_profile_match',
        value: {
          kind: 'numeric',
          value: verifiedA === verifiedB && blueA === blueB ? 1 : 0,
        },
      },
    ];
  }
}

function readBool(features: AccountFeatureMap, name: string): boolean | null {
  const v = features.get(name);
  if (!v || v.kind !== 'numeric') return null;
  return v.value === 1;
}

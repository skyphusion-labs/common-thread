/**
 * Profile customization agreement pair extractor (§4.1.5).
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'profile_customization_agreement_account_metadata';
const VERSION = '1.0.0';

export class ProfileCustomizationAgreementExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'account_metadata' as const;
  readonly requiredAccountFeatures = [
    'default_profile',
    'default_profile_image',
    'has_location',
    'has_url',
  ] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const fpA = customizationFingerprint(featuresA);
    const fpB = customizationFingerprint(featuresB);
    if (!fpA || !fpB) return [];

    const agreements = [
      fpA.defaultProfile === fpB.defaultProfile,
      fpA.defaultProfileImage === fpB.defaultProfileImage,
      fpA.hasLocation === fpB.hasLocation,
      fpA.hasUrl === fpB.hasUrl,
    ];
    const agreementCount = agreements.filter(Boolean).length;

    return [
      {
        category: 'account_metadata',
        name: 'profile_customization_fingerprint_match',
        value: { kind: 'numeric', value: fpA.key === fpB.key ? 1 : 0 },
      },
      {
        category: 'account_metadata',
        name: 'profile_customization_agreement_count',
        value: { kind: 'numeric', value: agreementCount },
      },
      {
        category: 'account_metadata',
        name: 'default_profile_both',
        value: {
          kind: 'numeric',
          value: fpA.defaultProfile && fpB.defaultProfile ? 1 : 0,
        },
      },
      {
        category: 'account_metadata',
        name: 'default_profile_image_both',
        value: {
          kind: 'numeric',
          value: fpA.defaultProfileImage && fpB.defaultProfileImage ? 1 : 0,
        },
      },
    ];
  }
}

function customizationFingerprint(features: AccountFeatureMap): {
  key: string;
  defaultProfile: boolean;
  defaultProfileImage: boolean;
  hasLocation: boolean;
  hasUrl: boolean;
} | null {
  const defaultProfile = readBool(features, 'default_profile');
  const defaultProfileImage = readBool(features, 'default_profile_image');
  const hasLocation = readBool(features, 'has_location');
  const hasUrl = readBool(features, 'has_url');
  if (
    defaultProfile === null ||
    defaultProfileImage === null ||
    hasLocation === null ||
    hasUrl === null
  ) {
    return null;
  }

  const key = [
    defaultProfile ? 'defprof' : 'custprof',
    defaultProfileImage ? 'defava' : 'custava',
    hasLocation ? 'loc' : 'noloc',
    hasUrl ? 'url' : 'nourl',
  ].join('|');

  return { key, defaultProfile, defaultProfileImage, hasLocation, hasUrl };
}

function readBool(features: AccountFeatureMap, name: string): boolean | null {
  const v = features.get(name);
  if (!v || v.kind !== 'numeric') return null;
  return v.value === 1;
}

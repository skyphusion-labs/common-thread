/**
 * Account-metadata extractor registry.
 */

import { TwitterAccountMetadataExtractor } from './twitter';
import { RedditAccountMetadataExtractor } from './reddit';
import { CreationDateClusterExtractor } from './creation-date-pair';
import { DisplayNameBioSimilarityExtractor } from './display-name-bio-pair';
import { BioTemplateOverlapExtractor } from './bio-template-pair';
import { VerificationAgreementExtractor } from './verification-pair';
import { ProfileCustomizationAgreementExtractor } from './profile-customization-pair';
import { LocationSimilarityExtractor } from './location-pair';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const ACCOUNT_METADATA_EXTRACTORS: AccountFeatureExtractor[] = [
  new TwitterAccountMetadataExtractor(),
  new RedditAccountMetadataExtractor(),
];

/** Pair extractors for §4.1 account metadata signals. */
export const ACCOUNT_METADATA_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new CreationDateClusterExtractor(),
  new DisplayNameBioSimilarityExtractor(),
  new BioTemplateOverlapExtractor(),
  new VerificationAgreementExtractor(),
  new ProfileCustomizationAgreementExtractor(),
  new LocationSimilarityExtractor(),
];

export { TwitterAccountMetadataExtractor } from './twitter';
export { RedditAccountMetadataExtractor } from './reddit';
export { CreationDateClusterExtractor } from './creation-date-pair';
export { DisplayNameBioSimilarityExtractor } from './display-name-bio-pair';
export { BioTemplateOverlapExtractor } from './bio-template-pair';
export { VerificationAgreementExtractor } from './verification-pair';
export { ProfileCustomizationAgreementExtractor } from './profile-customization-pair';
export { LocationSimilarityExtractor } from './location-pair';

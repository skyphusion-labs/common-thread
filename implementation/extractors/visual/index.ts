/**
 * Visual extractor registry.
 *
 * Paper §4.5 signal coverage in this directory:
 *
 *   §4.5.1 Profile image overlap
 *     - account-level: ImageHashExtractor (when dispatched to profile)
 *     - pair-level: ProfileImageOverlapExtractor
 *
 *   §4.5.2 Banner (header) image overlap
 *     - account-level: ImageHashExtractor (when dispatched to banner)
 *     - pair-level: BannerImageOverlapExtractor
 *
 *   §4.5.3 Posted-image perceptual hash overlap
 *     - account-level: PostedImageCorpusExtractor (consumes a per-
 *       account image-hash corpus artifact aggregated by the
 *       collection layer; necessary because per-image artifacts can't
 *       be aggregated under the account_features schema's most-
 *       recent-wins semantics)
 *     - pair-level: PostedImageOverlapExtractor (greedy bipartite
 *       fuzzy matching with Hamming-distance threshold)
 *
 *   §4.5.4 Color-palette comparison: NOT YET IMPLEMENTED. Requires
 *     a palette-extraction algorithm (k-means or median-cut) on
 *     decoded pixels. Would use the same corpus-artifact pattern as
 *     §4.5.3 with palette signatures instead of dHashes.
 *
 *   §4.5.5 EXIF metadata leakage: NOT YET IMPLEMENTED. Requires
 *     EXIF parsing on encoded image bytes. Would consume an EXIF-
 *     corpus artifact (collection layer aggregates per-account EXIF
 *     metadata) using the same corpus pattern as §4.5.3. Pure-TS
 *     EXIF parser is within scope of a follow-on pass.
 *
 * Collection-layer prerequisites:
 *
 *   For §4.5.1 / §4.5.2: pre-decoded RGBA artifacts (mimeType
 *     'application/x-rgba8' with width/height in platformMetadata).
 *     The collection layer downloads the original image, decodes it,
 *     and writes the derived form.
 *
 *   For §4.5.3: a single per-account 'application/x-image-hash-corpus'
 *     artifact aggregating the dHashes of all posted images. The
 *     collection layer computes each dHash via the dhash() function
 *     exported from this directory, ensuring consistency with the
 *     pair extractor. Corpus shape is documented in
 *     posted-image-corpus-extractor.ts.
 *
 * Platform parity: all visual extractors are platform-agnostic. Any
 * platform whose collection layer emits the expected derived artifacts
 * will produce features.
 */

import { ImageHashExtractor } from './image-hash-extractor';
import { PostedImageCorpusExtractor } from './posted-image-corpus-extractor';
import { ProfileImageOverlapExtractor } from './profile-image-overlap';
import { BannerImageOverlapExtractor } from './banner-image-overlap';
import { PostedImageOverlapExtractor } from './posted-image-overlap';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const VISUAL_EXTRACTORS: AccountFeatureExtractor[] = [
  new ImageHashExtractor(),
  new PostedImageCorpusExtractor(),
];

export const VISUAL_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new ProfileImageOverlapExtractor(), // §4.5.1
  new BannerImageOverlapExtractor(),  // §4.5.2
  new PostedImageOverlapExtractor(),  // §4.5.3
  // Future:
  // new ColorPaletteOverlapExtractor(),   // §4.5.4
  // new ExifLeakageExtractor(),           // §4.5.5
];

export { ImageHashExtractor } from './image-hash-extractor';
export { PostedImageCorpusExtractor } from './posted-image-corpus-extractor';
export { ProfileImageOverlapExtractor } from './profile-image-overlap';
export { BannerImageOverlapExtractor } from './banner-image-overlap';
export { PostedImageOverlapExtractor } from './posted-image-overlap';
export {
  dhash,
  dhashFromHex,
  dhashToHex,
  hammingDistance,
  dhashSimilarity,
  dhashMatchBand,
} from './dhash';

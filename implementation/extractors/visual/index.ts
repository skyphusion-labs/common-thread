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
 *   §4.5.3 Posted-image perceptual hash overlap: NOT YET IMPLEMENTED.
 *     The dhash algorithm in this directory is reusable for posted
 *     images; what's needed is an account-level extractor that
 *     iterates posted-image artifacts (rather than the single
 *     profile/banner image per account) and emits a feature like
 *     posted_image_dhashes (json array). The pair extractor would
 *     compute set-level overlap with Hamming-distance-aware fuzzy
 *     matching (more involved than the exact-set Jaccards used for
 *     network signals). Queued.
 *
 *   §4.5.4 Color-palette comparison: NOT YET IMPLEMENTED. Requires
 *     a palette-extraction algorithm (k-means or median-cut) on
 *     decoded pixels. Reasonable next pass once §4.5.3 lands.
 *
 *   §4.5.5 EXIF metadata leakage: NOT YET IMPLEMENTED. Requires
 *     EXIF parsing on encoded image bytes (the application/x-rgba8
 *     derived format has no EXIF). This extractor would consume
 *     the encoded image artifacts directly; EXIF parsing is pure
 *     TS and well within scope of a follow-on pass.
 *
 * Collection-layer prerequisite: the account-level extractor in this
 * directory consumes pre-decoded RGBA artifacts (mimeType
 * 'application/x-rgba8' with width/height in platformMetadata). The
 * collection layer is responsible for downloading the original image,
 * decoding it, and writing this derived form. Encoded image artifacts
 * (image/png, image/jpeg) still produce SHA-256 byte-equality
 * features but not perceptual hashes in v1.0.0; a wasm-decoder
 * augmentation is queued.
 *
 * Platform parity: the account-level extractor is platform-agnostic.
 * Any platform whose collection layer emits the expected derived
 * artifacts will produce features. Twitter and Reddit both have
 * profile images; only Twitter has banner images. The extractor
 * handles whichever images are present.
 */

import { ImageHashExtractor } from './image-hash-extractor';
import { ProfileImageOverlapExtractor } from './profile-image-overlap';
import { BannerImageOverlapExtractor } from './banner-image-overlap';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const VISUAL_EXTRACTORS: AccountFeatureExtractor[] = [
  new ImageHashExtractor(),
];

export const VISUAL_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new ProfileImageOverlapExtractor(), // §4.5.1
  new BannerImageOverlapExtractor(),  // §4.5.2
  // Future:
  // new PostedImageOverlapExtractor(),    // §4.5.3
  // new ColorPaletteOverlapExtractor(),   // §4.5.4
  // new ExifLeakageExtractor(),           // §4.5.5
];

export { ImageHashExtractor } from './image-hash-extractor';
export { ProfileImageOverlapExtractor } from './profile-image-overlap';
export { BannerImageOverlapExtractor } from './banner-image-overlap';
export {
  dhash,
  dhashFromHex,
  dhashToHex,
  hammingDistance,
  dhashSimilarity,
  dhashMatchBand,
} from './dhash';

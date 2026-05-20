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
 *       collection layer)
 *     - pair-level: PostedImageOverlapExtractor (greedy bipartite
 *       fuzzy matching with Hamming-distance threshold)
 *
 *   §4.5.4 Color-palette comparison: NOT YET IMPLEMENTED. Would use
 *     the same corpus-artifact pattern with palette signatures
 *     instead of dHashes.
 *
 *   §4.5.5 EXIF metadata leakage
 *     - parser: parseJpegExif() in exif-parser.ts (pure-TS, reusable
 *       by the collection layer to produce the EXIF corpus artifact)
 *     - account-level: ExifCorpusExtractor (consumes an EXIF corpus
 *       artifact; emits metadata_leakage category features)
 *     - pair-level: ExifOverlapExtractor (registered under
 *       metadata_leakage; lives in this directory because the code
 *       is tightly coupled to the parser and corpus shape)
 *
 * Category vs directory: EXIF code lives in visual/ because it's
 * about image metadata, but the FEATURE category is
 * 'metadata_leakage' per the paper's signal taxonomy. The pair
 * extractor registers under METADATA_LEAKAGE_PAIR_EXTRACTORS even
 * though its source file is here. The account extractor and parser
 * are exported from this directory for collection-layer use.
 *
 * Collection-layer prerequisites:
 *
 *   For §4.5.1 / §4.5.2: pre-decoded RGBA artifacts (mimeType
 *     'application/x-rgba8' with width/height in platformMetadata).
 *
 *   For §4.5.3: a single per-account 'application/x-image-hash-corpus'
 *     artifact aggregating the dHashes of all posted images. The
 *     collection layer computes each dHash via the dhash() function
 *     exported here.
 *
 *   For §4.5.5: a single per-account 'application/x-exif-corpus'
 *     artifact containing parsed EXIF metadata for each image. The
 *     collection layer calls parseJpegExif() (exported here) on each
 *     image and packs the results.
 *
 * Platform parity: all visual extractors are platform-agnostic. Any
 * platform whose collection layer emits the expected derived
 * artifacts will produce features.
 */

import { ImageHashExtractor } from './image-hash-extractor';
import { PostedImageCorpusExtractor } from './posted-image-corpus-extractor';
import { ExifCorpusExtractor } from './exif-corpus-extractor';
import { ProfileImageOverlapExtractor } from './profile-image-overlap';
import { BannerImageOverlapExtractor } from './banner-image-overlap';
import { PostedImageOverlapExtractor } from './posted-image-overlap';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const VISUAL_EXTRACTORS: AccountFeatureExtractor[] = [
  new ImageHashExtractor(),
  new PostedImageCorpusExtractor(),
  new ExifCorpusExtractor(),
];

export const VISUAL_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new ProfileImageOverlapExtractor(), // §4.5.1
  new BannerImageOverlapExtractor(),  // §4.5.2
  new PostedImageOverlapExtractor(),  // §4.5.3
  // §4.5.5 (ExifOverlapExtractor) is registered under
  // METADATA_LEAKAGE_PAIR_EXTRACTORS since the emitted features
  // are in that category.
  // Future:
  // new ColorPaletteOverlapExtractor(),   // §4.5.4
];

export { ImageHashExtractor } from './image-hash-extractor';
export { PostedImageCorpusExtractor } from './posted-image-corpus-extractor';
export { ExifCorpusExtractor } from './exif-corpus-extractor';
export { ExifOverlapExtractor } from './exif-overlap';
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
export { parseJpegExif } from './exif-parser';
export type { ParsedExif, ParsedExifGps } from './exif-parser';

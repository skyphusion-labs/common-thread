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
 *   §4.5.4 Color palette overlap
 *     - account-level: ColorPaletteCorpusExtractor (consumes a per-
 *       account color-palette corpus aggregated by the collection
 *       layer using computeHistogram())
 *     - pair-level: ColorPaletteOverlapExtractor (JSD on aligned
 *       histograms plus cosine and top-K Jaccard)
 *     - v1: extractors registered; dormant until the collection layer
 *       builds color-palette corpus artifacts (paper §6.4.6).
 *
 *   §4.5.5 EXIF metadata leakage
 *     - parser: parseJpegExif() in exif-parser.ts (pure-TS, reusable
 *       by the collection layer)
 *     - account-level: ExifCorpusExtractor (consumes an EXIF corpus
 *       artifact; emits metadata_leakage category features)
 *     - pair-level: ExifOverlapExtractor (registered under
 *       metadata_leakage; source in this directory)
 *
 * Collection-layer prerequisites:
 *
 *   For §4.5.1 / §4.5.2: pre-decoded RGBA artifacts (mimeType
 *     'application/x-rgba8' with width/height in platformMetadata).
 *
 *   For §4.5.3: a single per-account 'application/x-image-hash-corpus'
 *     artifact aggregating the dHashes of all posted images. Use
 *     the dhash() function exported here for consistency.
 *
 *   For §4.5.4: a single per-account 'application/x-color-palette-
 *     corpus' artifact aggregating quantized RGB histograms. Use
 *     the computeHistogram() function exported here.
 *
 *   For §4.5.5: a single per-account 'application/x-exif-corpus'
 *     artifact containing parsed EXIF metadata per image. Use the
 *     parseJpegExif() function exported here.
 *
 * Each prerequisite follows the same architectural pattern: the
 * collection layer aggregates per-account using helpers from THIS
 * directory, ensuring the collection-time aggregation and extraction-
 * time deserialization stay in lockstep across version changes.
 *
 * Platform parity: all visual extractors are platform-agnostic.
 */

import { ImageHashExtractor } from './image-hash-extractor';
import { PostedImageCorpusExtractor } from './posted-image-corpus-extractor';
import { ExifCorpusExtractor } from './exif-corpus-extractor';
import { ColorPaletteCorpusExtractor } from './color-palette-corpus-extractor';
import { ProfileImageOverlapExtractor } from './profile-image-overlap';
import { BannerImageOverlapExtractor } from './banner-image-overlap';
import { PostedImageOverlapExtractor } from './posted-image-overlap';
import { ColorPaletteOverlapExtractor } from './color-palette-overlap';
import type { AccountFeatureExtractor } from '../types';
import type { PairFeatureExtractor } from '../pair-types';

export const VISUAL_EXTRACTORS: AccountFeatureExtractor[] = [
  new ImageHashExtractor(),
  new PostedImageCorpusExtractor(),
  new ExifCorpusExtractor(),
  new ColorPaletteCorpusExtractor(),
];

export const VISUAL_PAIR_EXTRACTORS: PairFeatureExtractor[] = [
  new ProfileImageOverlapExtractor(),    // §4.5.1
  new BannerImageOverlapExtractor(),     // §4.5.2
  new PostedImageOverlapExtractor(),     // §4.5.3
  new ColorPaletteOverlapExtractor(),    // §4.5.6 (dormant v1: no palette corpus)
  // §4.5.5 (ExifOverlapExtractor) is registered under
  // METADATA_LEAKAGE_PAIR_EXTRACTORS since the emitted features
  // are in that category.
];

export { ImageHashExtractor } from './image-hash-extractor';
export { PostedImageCorpusExtractor } from './posted-image-corpus-extractor';
export { ExifCorpusExtractor } from './exif-corpus-extractor';
export { ExifOverlapExtractor } from './exif-overlap';
export { ColorPaletteCorpusExtractor } from './color-palette-corpus-extractor';
export { ColorPaletteOverlapExtractor } from './color-palette-overlap';
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
export {
  rgbToBin,
  binToRgb,
  binToHex,
  computeHistogram,
  mergeHistograms,
  topK,
  histogramTotal,
  PALETTE_BIN_COUNT,
  TOP_K_COLORS,
  ALPHA_THRESHOLD,
} from './color-palette';

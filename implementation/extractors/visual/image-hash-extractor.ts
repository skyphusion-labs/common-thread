/**
 * Image-hash account extractor.
 *
 * Reads image artifacts from the archive and emits visual hash
 * features for use by §4.5 visual pair extractors.
 *
 * Architecture: this extractor stays synchronous and deterministic
 * per §6.1. Image decoding (encoded PNG/JPEG bytes -> RGBA pixels)
 * is a collection-layer concern, NOT an extraction-layer concern.
 * The collection layer is expected to:
 *
 *   1. Download the image referenced by a profile/banner URL.
 *   2. Decode it to RGBA via whatever pipeline is convenient
 *      (wasm decoder, native sharp/jimp on a build server, etc.).
 *   3. Write the decoded RGBA byte buffer as a derived artifact
 *      with:
 *        - mimeType = 'application/x-rgba8'
 *        - platformMetadata.width  = pixel width
 *        - platformMetadata.height = pixel height
 *        - platformMetadata.imageType = 'profile' | 'banner' (the
 *          dispatch key this extractor uses)
 *        - platformMetadata.originalMimeType = 'image/jpeg' etc.
 *          (optional, for forensic record-keeping)
 *
 * This extractor handles ONLY the application/x-rgba8 derived format
 * in v1.0.0. Encoded image artifacts (image/png, image/jpeg) are
 * recognized via filterEntry for completeness but produce only the
 * SHA-256 byte-equality feature (no perceptual hash) because no wasm
 * decoder is wired in at this layer. Adding a wasm decoder is a
 * documented follow-on; the algorithm in dhash.ts is decoder-
 * independent.
 *
 * SHA-256 byte equality is emitted regardless of decode status,
 * because the manifest entry already carries the SHA-256 (computed
 * at collection time). Two accounts using a byte-identical image
 * file will have matching SHA-256 values; this catches verbatim
 * image reuse without requiring any decoding.
 *
 * Image type dispatch (in priority order):
 *
 *   1. entry.platformMetadata.imageType == 'profile' | 'banner'
 *      (explicit, the cleanest signal)
 *   2. entry.collectionMethod.tool contains 'profile_image' or
 *      'banner' or 'avatar' or 'header'
 *   3. entry.source URL contains '/profile_images/', '/banners/',
 *      '/avatars/', '/header/', etc.
 *
 * If no image type can be determined, the artifact is skipped. The
 * collection layer should set platformMetadata.imageType explicitly
 * to avoid ambiguity.
 *
 * Features emitted (per image type, where '$type' is 'profile' or
 * 'banner'):
 *
 *   ${type}_image_sha256 (text, hex)
 *   ${type}_image_dhash  (text, hex 16-char; emitted only when the
 *                         artifact is application/x-rgba8 with
 *                         dimensions sufficient to compute a
 *                         meaningful hash)
 *   ${type}_image_width  (numeric)
 *   ${type}_image_height (numeric)
 *
 * Determinism: pure pixel arithmetic from the dhash module; no
 * randomness, no clock, no I/O beyond reading the artifact bytes.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import { dhash, dhashToHex } from './dhash';

const NAME = 'image_hash';
const VERSION = '1.0.0';

const RGBA_MIME = 'application/x-rgba8';

type ImageType = 'profile' | 'banner';

export class ImageHashExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    // Recognize either pre-decoded RGBA artifacts or raw encoded
    // image artifacts. Even when we can't decode encoded images,
    // we still emit SHA-256 byte equality.
    const mime = (entry.mimeType ?? '').toLowerCase();
    if (mime === RGBA_MIME) return true;
    if (mime.startsWith('image/')) return true;

    // Fallback: check the tool/source for image-collection hints in
    // case mimeType isn't set.
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();
    if (
      tool.includes('image') ||
      tool.includes('avatar') ||
      tool.includes('banner') ||
      tool.includes('profile_image') ||
      tool.includes('header')
    ) {
      return true;
    }
    if (/\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(source)) return true;

    return false;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const imageType = detectImageType(input.entry);
    if (!imageType) return [];

    const features: ExtractedFeature[] = [];
    const mime = (input.entry.mimeType ?? '').toLowerCase();

    // SHA-256 byte equality (free; computed at collection time).
    features.push({
      category: 'visual',
      name: `${imageType}_image_sha256`,
      value: { kind: 'text', value: input.entry.hash },
    });

    if (mime === RGBA_MIME) {
      // Pre-decoded RGBA path: perceptual hashing is possible.
      const dims = readDimensions(input.entry);
      if (!dims) return features;
      const { width, height } = dims;

      if (input.bytes.length !== width * height * 4) {
        // Manifest dimensions don't match byte count; bail out
        // rather than emit a hash from misaligned data.
        return features;
      }

      features.push(
        {
          category: 'visual',
          name: `${imageType}_image_width`,
          value: { kind: 'numeric', value: width },
        },
        {
          category: 'visual',
          name: `${imageType}_image_height`,
          value: { kind: 'numeric', value: height },
        }
      );

      // Skip dHash for images smaller than 9x8; the hash is still
      // computable but its discriminative power collapses below
      // the resize target.
      if (width >= 9 && height >= 8) {
        try {
          const hash = dhash(input.bytes, width, height);
          features.push({
            category: 'visual',
            name: `${imageType}_image_dhash`,
            value: { kind: 'text', value: dhashToHex(hash) },
          });
        } catch {
          // Hashing failed (shouldn't happen given the guards above,
          // but be defensive). Suppress the dhash feature; sha256
          // and dimensions still emit.
        }
      }
    }
    // For encoded image MIME types, sha256 is the only feature
    // emitted in v1.0.0. A future decoder-augmented pass will add
    // dhash for these.

    return features;
  }
}

// ---------------------------------------------------------------------------
// Image type detection
// ---------------------------------------------------------------------------

function detectImageType(entry: ManifestEntry): ImageType | null {
  // 1. Explicit platformMetadata.imageType.
  const pm = entry.platformMetadata;
  if (pm && typeof pm === 'object') {
    const explicit = (pm as Record<string, unknown>).imageType;
    if (explicit === 'profile' || explicit === 'banner') return explicit;
  }

  // 2. Tool name hints.
  const tool = entry.collectionMethod.tool.toLowerCase();
  if (tool.includes('profile_image') || tool.includes('avatar')) return 'profile';
  if (tool.includes('banner') || tool.includes('header_image')) return 'banner';

  // 3. Source URL hints. Twitter and similar platforms expose CDN
  // paths that distinguish image types.
  const source = entry.source.toLowerCase();
  if (
    source.includes('/profile_images/') ||
    source.includes('/avatars/') ||
    source.includes('profile_image')
  ) {
    return 'profile';
  }
  if (
    source.includes('/banners/') ||
    source.includes('/profile_banners/') ||
    source.includes('/header/') ||
    source.includes('banner_image')
  ) {
    return 'banner';
  }

  return null;
}

// ---------------------------------------------------------------------------
// Dimension reading
// ---------------------------------------------------------------------------

function readDimensions(entry: ManifestEntry): { width: number; height: number } | null {
  const pm = entry.platformMetadata;
  if (!pm || typeof pm !== 'object') return null;
  const obj = pm as Record<string, unknown>;
  const w = obj.width;
  const h = obj.height;
  if (typeof w !== 'number' || typeof h !== 'number') return null;
  if (!Number.isInteger(w) || !Number.isInteger(h)) return null;
  if (w <= 0 || h <= 0) return null;
  return { width: w, height: h };
}

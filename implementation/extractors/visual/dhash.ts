/**
 * dHash perceptual hash for visual fingerprinting.
 *
 * dHash (difference hash) is a 64-bit perceptual hash robust to
 * resize, mild color-space changes, and recompression. It's the
 * standard low-cost choice for image-similarity comparison in
 * forensic and OSINT contexts.
 *
 * Algorithm:
 *   1. Downsample the source image to 9x8 grayscale.
 *   2. For each of 8 rows, compare 8 pairs of horizontally adjacent
 *      pixels. Each comparison yields one bit (1 if left > right,
 *      0 otherwise). 8 rows * 8 bits = 64 bits.
 *   3. The resulting 64-bit integer is the dHash.
 *
 * Two images with the same dHash are perceptually identical at the
 * 9x8 resolution; small numbers of bit differences correspond to
 * minor visual differences. Comparison is via Hamming distance.
 *
 * Standard interpretation thresholds:
 *   distance 0-5:  near-identical (likely re-encoded copy of the
 *                  same source image)
 *   distance 6-15: similar (same scene, different framing or
 *                  significant color/quality change)
 *   distance 16+:  distinct
 *
 * Determinism: pure integer arithmetic and bit operations. No
 * randomness, no clock access, no I/O. Satisfies §6.1.
 */

const DHASH_WIDTH = 9;
const DHASH_HEIGHT = 8;

/**
 * Compute dHash of an RGBA pixel buffer.
 *
 * Input is a Uint8Array of length width*height*4, in row-major order,
 * RGBA bytes per pixel (alpha is ignored for hashing purposes).
 *
 * Returns a 64-bit hash as a bigint. Use dhashToHex() to serialize
 * for storage in a text feature.
 *
 * Throws on dimension mismatch or invalid input. The caller is
 * responsible for handling images smaller than 9x8 (they will still
 * hash, but the result is less meaningful).
 */
export function dhash(rgba: Uint8Array, width: number, height: number): bigint {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`dhash: invalid dimensions ${width}x${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `dhash: RGBA byte count ${rgba.length} does not match dimensions ${width}x${height}*4`
    );
  }

  // Downsample to 9x8 grayscale using box-style nearest-neighbor.
  // For each output pixel, take the source pixel at the center of
  // the corresponding region. This is deterministic and adequate
  // for hashing; bilinear would smooth more but adds complexity for
  // no observable accuracy gain at this resolution.
  const gray = new Uint8Array(DHASH_WIDTH * DHASH_HEIGHT);
  for (let y = 0; y < DHASH_HEIGHT; y++) {
    // Use Math.floor on the half-region center for unambiguous mapping.
    const srcY = Math.min(
      height - 1,
      Math.floor(((y + 0.5) * height) / DHASH_HEIGHT)
    );
    for (let x = 0; x < DHASH_WIDTH; x++) {
      const srcX = Math.min(
        width - 1,
        Math.floor(((x + 0.5) * width) / DHASH_WIDTH)
      );
      const off = (srcY * width + srcX) * 4;
      const r = rgba[off];
      const g = rgba[off + 1];
      const b = rgba[off + 2];
      // rec601 luminance.
      gray[y * DHASH_WIDTH + x] = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }

  // Compute 64 bits via row-wise adjacent-pixel comparison.
  let hash = 0n;
  for (let y = 0; y < DHASH_HEIGHT; y++) {
    for (let x = 0; x < DHASH_WIDTH - 1; x++) {
      const left = gray[y * DHASH_WIDTH + x];
      const right = gray[y * DHASH_WIDTH + x + 1];
      hash = (hash << 1n) | (left > right ? 1n : 0n);
    }
  }
  return hash;
}

/**
 * Encode a 64-bit hash as a 16-char lowercase hex string. The hex
 * encoding is the canonical storage form (numeric features would lose
 * precision for unsigned 64-bit values; bigint serialization to JSON
 * is also awkward, so text is the right column).
 */
export function dhashToHex(hash: bigint): string {
  // BigInt.toString(16) drops leading zeros; pad to 16 chars.
  return hash.toString(16).padStart(16, '0');
}

/**
 * Decode a 16-char hex hash back to bigint. Throws on malformed input.
 */
export function dhashFromHex(hex: string): bigint {
  if (typeof hex !== 'string' || !/^[0-9a-f]{16}$/i.test(hex)) {
    throw new Error(`dhash: invalid hex string ${JSON.stringify(hex)}`);
  }
  return BigInt('0x' + hex);
}

/**
 * Compute Hamming distance (number of differing bits) between two
 * 64-bit hashes. Result is in [0, 64].
 */
export function hammingDistance(a: bigint, b: bigint): number {
  // XOR sets bits where a and b differ; count those bits via the
  // Brian Kernighan trick (each iteration clears the lowest set bit).
  let x = a ^ b;
  let count = 0;
  while (x !== 0n) {
    count++;
    x = x & (x - 1n);
  }
  return count;
}

/**
 * Map a Hamming distance to a coarse interpretation band. The bands
 * are documented in the file header. Returning a text label makes
 * downstream reasoning resilient to threshold tuning: the label
 * carries the semantic content, the numeric distance carries the
 * precise value.
 */
export function dhashMatchBand(
  hammingDist: number
): 'near_identical' | 'similar' | 'distinct' {
  if (hammingDist <= 5) return 'near_identical';
  if (hammingDist <= 15) return 'similar';
  return 'distinct';
}

/**
 * Convert a Hamming distance to a similarity score in [0, 1]. Score
 * is 1.0 for identical hashes (distance 0) and approaches 0 as the
 * hashes diverge.
 */
export function dhashSimilarity(hammingDist: number): number {
  const clamped = Math.max(0, Math.min(64, hammingDist));
  return 1 - clamped / 64;
}

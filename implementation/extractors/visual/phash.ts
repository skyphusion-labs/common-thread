/**
 * pHash perceptual hash for visual fingerprinting (§6.2.5).
 *
 * pHash (DCT-based perceptual hash) is a 64-bit hash complementary to
 * dHash: an edit that defeats one family may not defeat the other.
 *
 * Algorithm (classic pHash):
 *   1. Downsample to 32x32 grayscale.
 *   2. Compute a 2D DCT-II.
 *   3. Take the low-frequency 8x8 block (including DC).
 *   4. Compute the median of the 63 AC coefficients (DC excluded).
 *   5. Emit one bit per coefficient: 1 if > median, else 0.
 *
 * Serialization and Hamming helpers match the dHash API so pair
 * extractors can reuse dhashFromHex / hammingDistance / match bands.
 *
 * Determinism: pure arithmetic. Satisfies §6.1.
 */

const PHASH_SIZE = 32;
const PHASH_LOW = 8;

/**
 * Compute pHash of an RGBA pixel buffer.
 * Returns a 64-bit hash as bigint. Use phashToHex() for storage.
 */
export function phash(rgba: Uint8Array, width: number, height: number): bigint {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`phash: invalid dimensions ${width}x${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `phash: RGBA byte count ${rgba.length} does not match dimensions ${width}x${height}*4`
    );
  }

  const gray = new Float64Array(PHASH_SIZE * PHASH_SIZE);
  for (let y = 0; y < PHASH_SIZE; y++) {
    const srcY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / PHASH_SIZE));
    for (let x = 0; x < PHASH_SIZE; x++) {
      const srcX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / PHASH_SIZE));
      const off = (srcY * width + srcX) * 4;
      const r = rgba[off] ?? 0;
      const g = rgba[off + 1] ?? 0;
      const b = rgba[off + 2] ?? 0;
      gray[y * PHASH_SIZE + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }

  const dct = dct2d(gray, PHASH_SIZE);

  const low: number[] = [];
  for (let y = 0; y < PHASH_LOW; y++) {
    for (let x = 0; x < PHASH_LOW; x++) {
      low.push(dct[y * PHASH_SIZE + x] ?? 0);
    }
  }

  // Exclude DC from the median (classic pHash): the DC term dominates
  // and would otherwise flip many AC bits on near-uniform images.
  const ac = low.slice(1);
  const sorted = [...ac].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);

  let hash = 0n;
  for (const v of low) {
    hash = (hash << 1n) | (v > median ? 1n : 0n);
  }
  return hash;
}

export function phashToHex(hash: bigint): string {
  return hash.toString(16).padStart(16, '0');
}

export function phashFromHex(hex: string): bigint {
  if (typeof hex !== 'string' || !/^[0-9a-f]{16}$/i.test(hex)) {
    throw new Error(`phash: invalid hex string ${JSON.stringify(hex)}`);
  }
  return BigInt('0x' + hex);
}

/** Same bands as dHash for operator-facing labels. */
export function phashMatchBand(
  hammingDist: number
): 'near_identical' | 'similar' | 'distinct' {
  if (hammingDist <= 5) return 'near_identical';
  if (hammingDist <= 15) return 'similar';
  return 'distinct';
}

export function phashSimilarity(hammingDist: number): number {
  const clamped = Math.max(0, Math.min(64, hammingDist));
  return 1 - clamped / 64;
}

/**
 * Separable 2D DCT-II. Output is size x size in row-major order.
 */
function dct2d(input: Float64Array, size: number): Float64Array {
  const temp = new Float64Array(size * size);
  const out = new Float64Array(size * size);
  const cos = buildCosTable(size);

  // Rows
  for (let y = 0; y < size; y++) {
    for (let u = 0; u < size; u++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        sum += (input[y * size + x] ?? 0) * (cos[u * size + x] ?? 0);
      }
      const au = u === 0 ? Math.SQRT1_2 : 1;
      temp[y * size + u] = au * sum;
    }
  }

  // Columns
  for (let x = 0; x < size; x++) {
    for (let v = 0; v < size; v++) {
      let sum = 0;
      for (let y = 0; y < size; y++) {
        sum += (temp[y * size + x] ?? 0) * (cos[v * size + y] ?? 0);
      }
      const av = v === 0 ? Math.SQRT1_2 : 1;
      out[v * size + x] = av * sum;
    }
  }

  return out;
}

function buildCosTable(size: number): Float64Array {
  const table = new Float64Array(size * size);
  const scale = Math.PI / (2 * size);
  for (let k = 0; k < size; k++) {
    for (let n = 0; n < size; n++) {
      table[k * size + n] = Math.cos((2 * n + 1) * k * scale);
    }
  }
  return table;
}

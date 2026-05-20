/**
 * Color palette quantization helpers.
 *
 * Reduces continuous RGB color to a 9-bit quantized index space
 * (3 bits per channel = 8 levels per channel = 512 distinct colors).
 * The reduction is coarse enough that minor compression artifacts and
 * filter variations don't change the bin, but fine enough to
 * distinguish broad palettes (warm vs cool, saturated vs muted, light
 * vs dark, etc.).
 *
 * Reusability: this module is purposely written for use by both the
 * extractor and the collection layer. The collection layer decodes
 * each image to RGBA, calls computeHistogram() to produce a per-image
 * sparse histogram, aggregates across all an account's images, and
 * writes the per-account histogram as a corpus artifact. The
 * extractor consumes the corpus and emits features. Sharing the
 * quantization function ensures the extraction-time bin indices
 * match what the collection layer wrote.
 *
 * Determinism: pure integer arithmetic. No randomness, no clock, no
 * I/O. Satisfies §6.1.
 *
 * Format:
 *   bin index = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
 *               where r, g, b are 0..255
 *   bin index is in [0, 511]
 *
 * Reverse mapping: each bin represents a 32x32x32 sub-cube of RGB
 * space. We map back to the center of that cube (offset 16) when
 * generating a hex representation, which gives a visually
 * representative color for the bin.
 */

export const PALETTE_BIN_COUNT = 512;
export const TOP_K_COLORS = 16;
export const ALPHA_THRESHOLD = 32;

/**
 * Quantize an RGB triple to a 9-bit bin index. r, g, b must be in
 * [0, 255]; values outside this range are clamped.
 */
export function rgbToBin(r: number, g: number, b: number): number {
  const rr = clamp255(r);
  const gg = clamp255(g);
  const bb = clamp255(b);
  return ((rr >> 5) << 6) | ((gg >> 5) << 3) | (bb >> 5);
}

/**
 * Map a bin index back to the center-of-cube RGB representation.
 * Used to generate human-readable hex color strings for the top-K
 * palette feature.
 */
export function binToRgb(bin: number): { r: number; g: number; b: number } {
  const rIdx = (bin >> 6) & 7;
  const gIdx = (bin >> 3) & 7;
  const bIdx = bin & 7;
  return {
    r: (rIdx << 5) | 16,
    g: (gIdx << 5) | 16,
    b: (bIdx << 5) | 16,
  };
}

/**
 * Encode a bin as a CSS-style hex color string '#RRGGBB' using the
 * center-of-cube representation.
 */
export function binToHex(bin: number): string {
  const { r, g, b } = binToRgb(bin);
  return '#' + toHex2(r) + toHex2(g) + toHex2(b);
}

/**
 * Compute a sparse color histogram from an RGBA pixel buffer.
 *
 * Input: a Uint8Array of length width*height*4 in row-major RGBA
 * order (4 bytes per pixel: R, G, B, A).
 *
 * Output: a Map from bin index (number) to pixel count (number).
 * Only bins with at least one contributing pixel are present.
 *
 * Behavior:
 *   - Fully transparent pixels (alpha < ALPHA_THRESHOLD) are excluded
 *     because they would otherwise bias the palette toward the
 *     background-fill color used when decoding transparent PNGs.
 *   - Every counted pixel contributes 1 unit. The collection layer
 *     can scale or normalize at aggregate time if it cares; the
 *     extractor treats whatever counts arrive as the canonical
 *     histogram.
 *
 * Determinism: pure integer arithmetic. Same RGBA bytes always
 * produce the same map.
 *
 * Throws on dimension mismatch.
 */
export function computeHistogram(
  rgba: Uint8Array,
  width: number,
  height: number
): Map<number, number> {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error(`computeHistogram: invalid dimensions ${width}x${height}`);
  }
  if (rgba.length !== width * height * 4) {
    throw new Error(
      `computeHistogram: byte count ${rgba.length} does not match ${width}x${height}*4`
    );
  }

  const hist = new Map<number, number>();
  const pixelCount = width * height;
  for (let i = 0; i < pixelCount; i++) {
    const off = i * 4;
    if (rgba[off + 3] < ALPHA_THRESHOLD) continue;
    const bin = rgbToBin(rgba[off], rgba[off + 1], rgba[off + 2]);
    hist.set(bin, (hist.get(bin) ?? 0) + 1);
  }
  return hist;
}

/**
 * Aggregate two histograms by adding counts per bin. Returns a new
 * map; inputs are not modified. Used by the collection layer to
 * fold per-image histograms into a per-account histogram.
 */
export function mergeHistograms(
  a: Map<number, number>,
  b: Map<number, number>
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [bin, count] of a) out.set(bin, count);
  for (const [bin, count] of b) {
    out.set(bin, (out.get(bin) ?? 0) + count);
  }
  return out;
}

/**
 * Extract the top-K bins from a histogram, sorted by count descending
 * (ties broken by ascending bin index for determinism). Returns an
 * array of { bin, hex, weight } tuples where weight is the bin's
 * count as a fraction of the total counts in the histogram.
 */
export function topK(
  hist: Map<number, number>,
  k: number
): Array<{ bin: number; hex: string; weight: number }> {
  const total = histogramTotal(hist);
  if (total === 0) return [];

  // Sort by descending count, ties broken by ascending bin index.
  const entries = [...hist.entries()].sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0] - b[0];
  });

  return entries.slice(0, k).map(([bin, count]) => ({
    bin,
    hex: binToHex(bin),
    weight: count / total,
  }));
}

/**
 * Sum of counts across all bins.
 */
export function histogramTotal(hist: Map<number, number>): number {
  let total = 0;
  for (const c of hist.values()) total += c;
  return total;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp255(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v | 0;
}

function toHex2(v: number): string {
  const h = v.toString(16);
  return h.length === 1 ? '0' + h : h;
}

import { describe, expect, it } from 'vitest';
import {
  phash,
  phashToHex,
  phashFromHex,
  phashMatchBand,
  phashSimilarity,
} from '../../implementation/extractors/visual/phash';
import { hammingDistance } from '../../implementation/extractors/visual/dhash';

function solidRgba(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number
): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = 255;
  }
  return out;
}

describe('phash (§6.2.5)', () => {
  it('is deterministic for identical buffers', () => {
    const rgba = solidRgba(64, 64, 40, 80, 120);
    const a = phash(rgba, 64, 64);
    const b = phash(rgba, 64, 64);
    expect(a).toBe(b);
    expect(phashToHex(a)).toHaveLength(16);
  });

  it('round-trips hex serialization', () => {
    const hash = phash(solidRgba(32, 32, 200, 10, 10), 32, 32);
    const hex = phashToHex(hash);
    expect(phashFromHex(hex)).toBe(hash);
    expect(phashFromHex(hex.toUpperCase())).toBe(hash);
  });

  it('keeps near-identical patterned images in a low Hamming band', () => {
    const width = 48;
    const height = 48;
    const base = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4;
        const v = ((x * 3 + y * 5) % 256);
        base[o] = v;
        base[o + 1] = (v + 40) % 256;
        base[o + 2] = (v + 80) % 256;
        base[o + 3] = 255;
      }
    }
    const tweaked = new Uint8Array(base);
    tweaked[0] = Math.min(255, (tweaked[0] ?? 0) + 8);
    tweaked[1] = Math.min(255, (tweaked[1] ?? 0) + 8);
    tweaked[2] = Math.min(255, (tweaked[2] ?? 0) + 8);

    const dist = hammingDistance(phash(base, width, height), phash(tweaked, width, height));
    expect(dist).toBeLessThanOrEqual(5);
    expect(phashMatchBand(dist)).toBe('near_identical');
    expect(phashSimilarity(dist)).toBeGreaterThan(0.9);
  });

  it('separates visually distinct solids', () => {
    const dark = phash(solidRgba(40, 40, 0, 0, 0), 40, 40);
    const bright = phash(solidRgba(40, 40, 255, 255, 255), 40, 40);
    // Uniform fields collapse to low-frequency energy; still expect some distance.
    expect(dark).not.toBe(bright);
  });
});

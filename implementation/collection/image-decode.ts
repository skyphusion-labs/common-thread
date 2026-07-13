/**
 * Image decode helpers for the collection layer.
 *
 * Uses Web APIs available in the Workers runtime (createImageBitmap,
 * OffscreenCanvas) to produce RGBA buffers for dHash computation.
 */

import { sha256 } from '../archive/hash';
import { parseJpegExif, type ParsedExif } from '../extractors/visual/exif-parser';
import { computeHistogram } from '../extractors/visual/color-palette';
import { dhash, dhashToHex } from '../extractors/visual/dhash';

export interface FetchedImageFeatures {
  dhash: string | null;
  sha256: string | null;
  exif: ParsedExif | null;
  paletteHist: Map<number, number> | null;
}

type WorkersCanvas = {
  width: number;
  height: number;
  getContext(type: '2d'): {
    drawImage(image: { width: number; height: number }, dx: number, dy: number): void;
    getImageData(sx: number, sy: number, sw: number, sh: number): { data: Uint8ClampedArray };
  } | null;
};

type WorkersImageBitmap = {
  width: number;
  height: number;
  close(): void;
};

const workersGlobal = globalThis as unknown as {
  Blob?: new (parts: Uint8Array[]) => { readonly size: number };
  createImageBitmap?: (source: { readonly size: number }) => Promise<WorkersImageBitmap>;
  OffscreenCanvas?: new (width: number, height: number) => WorkersCanvas;
};

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export interface DecodedImage {
  rgba: Uint8Array;
  width: number;
  height: number;
}

/**
 * Decode image bytes to an RGBA buffer via createImageBitmap.
 */
export async function decodeImageBytesToRgba(bytes: Uint8Array): Promise<DecodedImage> {
  if (bytes.length === 0) {
    throw new Error('decodeImageBytesToRgba: empty input');
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`decodeImageBytesToRgba: image exceeds ${MAX_IMAGE_BYTES} bytes`);
  }

  if (!workersGlobal.createImageBitmap || !workersGlobal.OffscreenCanvas || !workersGlobal.Blob) {
    throw new Error('decodeImageBytesToRgba: image APIs unavailable in this runtime');
  }

  const blob = new workersGlobal.Blob([new Uint8Array(bytes)]);

  const bitmap = await workersGlobal.createImageBitmap(blob);
  try {
    const width = bitmap.width;
    const height = bitmap.height;
    if (width <= 0 || height <= 0) {
      throw new Error('decodeImageBytesToRgba: invalid dimensions');
    }

    const canvas = new workersGlobal.OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('decodeImageBytesToRgba: 2d context unavailable');
    }
    ctx.drawImage(bitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    return {
      rgba: new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.byteLength),
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}

/**
 * Fetch a remote image URL and return perceptual hash, content SHA-256,
 * and parsed JPEG EXIF when available. Returns null on hard failure.
 */
export async function fetchUrlImageFeatures(url: string): Promise<FetchedImageFeatures | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'image/*' },
    });
    clearTimeout(timer);
    if (!response.ok) return null;

    const buf = new Uint8Array(await response.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return null;

    const contentHash = await sha256(buf);
    const exif = parseJpegExif(buf);

    try {
      const { rgba, width, height } = await decodeImageBytesToRgba(buf);
      let paletteHist: Map<number, number> | null = null;
      try {
        paletteHist = computeHistogram(rgba, width, height);
      } catch {
        paletteHist = null;
      }
      return {
        dhash: dhashToHex(dhash(rgba, width, height)),
        sha256: contentHash,
        exif,
        paletteHist,
      };
    } catch {
      return {
        dhash: null,
        sha256: contentHash,
        exif,
        paletteHist: null,
      };
    }
  } catch {
    return null;
  }
}

/**
 * Fetch a remote image URL and return its dHash hex string, or null
 * on any failure (network, decode, unsupported format).
 */
export async function fetchUrlDhash(url: string): Promise<string | null> {
  const features = await fetchUrlImageFeatures(url);
  return features?.dhash ?? null;
}

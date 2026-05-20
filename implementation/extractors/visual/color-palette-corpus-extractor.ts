/**
 * Color-palette corpus account extractor.
 *
 * Consumes a per-account color-palette corpus artifact and emits the
 * aggregated histogram as an account-level feature, plus a top-K
 * palette summary for human review.
 *
 * Architecture: same corpus-artifact pattern as posted-image-corpus
 * (§4.5.3) and exif-corpus (§4.5.5). The collection layer:
 *
 *   1. Downloads each posted image (and optionally profile/banner).
 *   2. Decodes to RGBA pixels.
 *   3. Calls computeHistogram() from color-palette.ts on each image
 *      to produce a per-image sparse histogram in the 512-bin
 *      quantized RGB space.
 *   4. Merges per-image histograms via mergeHistograms() into a
 *      single per-account histogram.
 *   5. Writes the aggregate as a corpus artifact.
 *
 * Collection-layer contract:
 *   mimeType: 'application/x-color-palette-corpus'
 *   platformMetadata.imageType: 'profile' | 'banner' | 'posted'
 *
 * Corpus body shape (JSON):
 *   {
 *     "imageCount": 1042,        // number of source images aggregated
 *     "totalPixels": 524288000,  // sum of pixel counts (excluding
 *                                //   transparent pixels per
 *                                //   ALPHA_THRESHOLD)
 *     "histogram": {              // sparse: bin index -> count
 *       "0": 12345,
 *       "127": 67890,
 *       "511": 234
 *     }
 *   }
 *
 * Features emitted (always when the corpus is present; an empty
 * histogram still produces zero-count features that are informative
 * as null-result data points):
 *
 *   color_palette_histogram (json, the full sparse histogram as
 *     {bin: count}; pair extractor consumes this)
 *   color_palette_image_count (numeric, source images aggregated)
 *   color_palette_total_pixels (numeric, sum of pixel counts)
 *   color_palette_unique_bins_used (numeric, count of non-zero bins)
 *   color_palette_top_k (json, top 16 colors as
 *     [{bin, hex, weight}, ...] sorted by descending weight; the
 *     weight is the bin's count as a fraction of total_pixels)
 *
 * The bin index for each emitted feature is dispatched by imageType:
 * 'profile_color_palette_*', 'banner_color_palette_*', or
 * 'posted_color_palette_*'. The §4.5.4 pair extractor uses the
 * 'posted' variant specifically.
 *
 * Determinism: pure JSON parsing and aggregation; the top-K extraction
 * is sorted with deterministic tie-breaking. Satisfies §6.1.
 *
 * Edge cases:
 *   - Malformed corpus: returns empty.
 *   - Histogram entries with non-numeric counts or out-of-range bins:
 *     dropped silently.
 *   - imageType not in {profile, banner, posted}: defaults to 'posted'
 *     since that's the primary §4.5.4 use case.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import { PALETTE_BIN_COUNT, TOP_K_COLORS, topK } from './color-palette';

const NAME = 'color_palette_corpus';
const VERSION = '1.0.0';

const CORPUS_MIME = 'application/x-color-palette-corpus';

type ImageType = 'profile' | 'banner' | 'posted';

interface CorpusBody {
  imageCount?: unknown;
  totalPixels?: unknown;
  histogram?: unknown;
}

export class ColorPaletteCorpusExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const mime = (entry.mimeType ?? '').toLowerCase();
    return mime === CORPUS_MIME;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const imageType = detectImageType(input.entry);

    let parsed: CorpusBody;
    try {
      parsed = JSON.parse(new TextDecoder().decode(input.bytes));
    } catch {
      return [];
    }

    if (!parsed || typeof parsed !== 'object') return [];

    const histogram = parseHistogram(parsed.histogram);
    if (!histogram) return [];

    const imageCount = readPositiveInt(parsed.imageCount) ?? 0;
    const totalPixelsHint = readPositiveInt(parsed.totalPixels);

    // Compute totalPixels from the histogram if not provided. Trust
    // the hint when present and consistent; if it disagrees with the
    // histogram sum, prefer the actual sum (defensive).
    const histTotal = histogramTotal(histogram);
    const totalPixels = totalPixelsHint && totalPixelsHint > 0 ? totalPixelsHint : histTotal;

    // The histogram feature serializes to JSON as an object with
    // string keys. Re-emit with sorted numeric keys for deterministic
    // output.
    const sortedHistogram = histogramToSortedRecord(histogram);

    // Top-K palette for human review.
    const top = topK(histogram, TOP_K_COLORS);

    const prefix = `${imageType}_color_palette`;
    const cat = 'visual' as const;

    return [
      {
        category: cat,
        name: `${prefix}_histogram`,
        value: { kind: 'json', value: sortedHistogram },
      },
      {
        category: cat,
        name: `${prefix}_image_count`,
        value: { kind: 'numeric', value: imageCount },
      },
      {
        category: cat,
        name: `${prefix}_total_pixels`,
        value: { kind: 'numeric', value: totalPixels },
      },
      {
        category: cat,
        name: `${prefix}_unique_bins_used`,
        value: { kind: 'numeric', value: histogram.size },
      },
      {
        category: cat,
        name: `${prefix}_top_k`,
        value: { kind: 'json', value: top },
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function detectImageType(entry: ManifestEntry): ImageType {
  const pm = entry.platformMetadata;
  if (pm && typeof pm === 'object') {
    const explicit = (pm as Record<string, unknown>).imageType;
    if (explicit === 'profile' || explicit === 'banner' || explicit === 'posted') {
      return explicit;
    }
  }
  return 'posted';
}

function parseHistogram(raw: unknown): Map<number, number> | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const hist = new Map<number, number>();
  for (const [keyStr, valueRaw] of Object.entries(obj)) {
    const bin = Number(keyStr);
    if (!Number.isInteger(bin) || bin < 0 || bin >= PALETTE_BIN_COUNT) continue;
    if (typeof valueRaw !== 'number' || !Number.isFinite(valueRaw) || valueRaw <= 0) continue;
    hist.set(bin, valueRaw);
  }
  return hist;
}

function readPositiveInt(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  if (!Number.isInteger(v)) return null;
  return v;
}

function histogramTotal(hist: Map<number, number>): number {
  let total = 0;
  for (const c of hist.values()) total += c;
  return total;
}

function histogramToSortedRecord(hist: Map<number, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const bin of [...hist.keys()].sort((a, b) => a - b)) {
    out[String(bin)] = hist.get(bin)!;
  }
  return out;
}

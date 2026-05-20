/**
 * EXIF corpus account extractor.
 *
 * Consumes a per-account EXIF corpus artifact and emits aggregated
 * field sets across all images in the corpus.
 *
 * Architecture: same corpus-artifact pattern as the posted-image dHash
 * extractor (§4.5.3). Each image is its own artifact at collection
 * time, but the account_features schema doesn't support per-artifact
 * aggregation (most-recent-wins on duplicate feature names). The
 * collection layer is responsible for:
 *
 *   1. Downloading each posted image (and optionally profile/banner).
 *   2. Calling parseJpegExif() from exif-parser.ts on the bytes.
 *   3. Writing a single derived artifact per account containing the
 *      parsed EXIF for every image.
 *
 * Sharing the parser between collection and extraction ensures the
 * field naming and value normalization are consistent.
 *
 * Collection-layer contract:
 *   mimeType: 'application/x-exif-corpus'
 *
 * Corpus body shape (JSON):
 *   {
 *     "images": [
 *       {
 *         "url": "https://...",       // optional, for record-keeping
 *         "exif": {                    // null/missing if no EXIF
 *           "make": "Canon",
 *           "model": "Canon EOS 5D Mark IV",
 *           "software": "Adobe Lightroom 11.0",
 *           "dateTime": "2024:01:15 14:30:00",
 *           "dateTimeOriginal": "2024:01:15 14:30:00",
 *           "lensMake": "Canon",
 *           "lensModel": "EF 24-70mm f/2.8L II USM",
 *           "gps": { "latitude": 40.7128, "longitude": -74.0060 }
 *         }
 *       }
 *     ]
 *   }
 *
 * Features emitted (always when the corpus artifact is present, even
 * when no images have EXIF data; the empty case is informative as a
 * "no EXIF survived" signal):
 *
 *   exif_image_count (numeric, total images in corpus)
 *   exif_with_exif_count (numeric, images that had at least one
 *     non-empty EXIF field; useful for confidence weighting in the
 *     pair extractor)
 *   exif_with_gps_count (numeric, images that had GPS coordinates)
 *   exif_make_set (json, sorted unique list of camera makes)
 *   exif_model_set (json, sorted unique list of camera models)
 *   exif_software_set (json, sorted unique list of editing/upload
 *     software signatures)
 *   exif_lens_make_set (json, sorted unique list of lens makes)
 *   exif_lens_model_set (json, sorted unique list of lens models)
 *   exif_camera_fingerprint_set (json, sorted unique list of
 *     joint (make|model|lens_model) tuples; this is the SAME-
 *     PHYSICAL-DEVICE signal, more diagnostic than any single field)
 *   exif_gps_points (json, array of {lat, lon} objects; not
 *     deduplicated since two photos in the same location is
 *     informative)
 *
 * Determinism: pure JSON parsing and set arithmetic. The output
 * arrays are sorted lexicographically (set features) or preserve
 * input order (GPS points, which are positional). No randomness, no
 * clock, no I/O.
 *
 * Edge cases:
 *   - Corpus missing or malformed: returns empty.
 *   - Image with exif missing/null: counted in exif_image_count but
 *     not in exif_with_exif_count.
 *   - Empty strings in fields: silently dropped (treated as missing).
 *   - GPS out-of-range: the parser already filtered these; the
 *     extractor trusts the corpus.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';

const NAME = 'exif_corpus';
const VERSION = '1.0.0';

const CORPUS_MIME = 'application/x-exif-corpus';

interface CorpusBody {
  images?: CorpusImage[];
}

interface CorpusImage {
  url?: unknown;
  exif?: CorpusExifFields | null;
}

interface CorpusExifFields {
  make?: unknown;
  model?: unknown;
  software?: unknown;
  dateTime?: unknown;
  dateTimeOriginal?: unknown;
  dateTimeDigitized?: unknown;
  lensMake?: unknown;
  lensModel?: unknown;
  gps?: { latitude?: unknown; longitude?: unknown; altitude?: unknown } | null;
}

export class ExifCorpusExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const mime = (entry.mimeType ?? '').toLowerCase();
    return mime === CORPUS_MIME;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    let parsed: CorpusBody;
    try {
      parsed = JSON.parse(new TextDecoder().decode(input.bytes));
    } catch {
      return [];
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.images)) {
      return [];
    }

    const makes = new Set<string>();
    const models = new Set<string>();
    const softwares = new Set<string>();
    const lensMakes = new Set<string>();
    const lensModels = new Set<string>();
    const cameraFingerprints = new Set<string>();
    const gpsPoints: Array<{ lat: number; lon: number }> = [];

    let imagesWithExif = 0;
    let imagesWithGps = 0;
    const totalImages = parsed.images.length;

    for (const image of parsed.images) {
      if (!image || typeof image !== 'object') continue;
      const exif = image.exif;
      if (!exif || typeof exif !== 'object') continue;

      const make = readString(exif.make);
      const model = readString(exif.model);
      const software = readString(exif.software);
      const lensMake = readString(exif.lensMake);
      const lensModel = readString(exif.lensModel);
      const gpsPoint = readGpsPoint(exif.gps);

      let hasAnyField = false;
      if (make) {
        makes.add(make);
        hasAnyField = true;
      }
      if (model) {
        models.add(model);
        hasAnyField = true;
      }
      if (software) {
        softwares.add(software);
        hasAnyField = true;
      }
      if (lensMake) {
        lensMakes.add(lensMake);
        hasAnyField = true;
      }
      if (lensModel) {
        lensModels.add(lensModel);
        hasAnyField = true;
      }
      if (gpsPoint) {
        gpsPoints.push(gpsPoint);
        imagesWithGps++;
        hasAnyField = true;
      }

      // Camera fingerprint = (make | model | lensModel). Built only
      // when at least make AND model are present, since the tuple
      // semantics require both. lensModel is optional.
      if (make && model) {
        const fingerprint = `${make}|${model}|${lensModel ?? ''}`;
        cameraFingerprints.add(fingerprint);
      }

      if (hasAnyField) imagesWithExif++;
    }

    const cat = 'metadata_leakage' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'exif_image_count',
        value: { kind: 'numeric', value: totalImages },
      },
      {
        category: cat,
        name: 'exif_with_exif_count',
        value: { kind: 'numeric', value: imagesWithExif },
      },
      {
        category: cat,
        name: 'exif_with_gps_count',
        value: { kind: 'numeric', value: imagesWithGps },
      },
      {
        category: cat,
        name: 'exif_make_set',
        value: { kind: 'json', value: [...makes].sort() },
      },
      {
        category: cat,
        name: 'exif_model_set',
        value: { kind: 'json', value: [...models].sort() },
      },
      {
        category: cat,
        name: 'exif_software_set',
        value: { kind: 'json', value: [...softwares].sort() },
      },
      {
        category: cat,
        name: 'exif_lens_make_set',
        value: { kind: 'json', value: [...lensMakes].sort() },
      },
      {
        category: cat,
        name: 'exif_lens_model_set',
        value: { kind: 'json', value: [...lensModels].sort() },
      },
      {
        category: cat,
        name: 'exif_camera_fingerprint_set',
        value: { kind: 'json', value: [...cameraFingerprints].sort() },
      },
      {
        category: cat,
        name: 'exif_gps_points',
        value: { kind: 'json', value: gpsPoints },
      },
    ];

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readGpsPoint(
  gps: { latitude?: unknown; longitude?: unknown } | null | undefined
): { lat: number; lon: number } | null {
  if (!gps || typeof gps !== 'object') return null;
  const lat = gps.latitude;
  const lon = gps.longitude;
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null;
  if (typeof lon !== 'number' || !Number.isFinite(lon)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lon < -180 || lon > 180) return null;
  return { lat, lon };
}

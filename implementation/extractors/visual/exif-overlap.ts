/**
 * EXIF overlap pair extractor.
 *
 * Per the methodology paper §4.5.5, this extractor compares EXIF
 * metadata sets between two accounts. EXIF is platform-supplied
 * metadata embedded in image files (camera, lens, software, GPS,
 * timestamps); when it survives platform sanitization, it's
 * uniquely diagnostic of physical devices and locations.
 *
 * Signal strength varies by field:
 *
 *   - Camera fingerprint (make|model|lens_model) match: the SAME
 *     physical kit is producing photos for both accounts. Very
 *     strong same-operator signal.
 *
 *   - Software match (e.g., specific Adobe Lightroom version): same
 *     editing/upload pipeline. Moderate signal; many people use the
 *     same software but the combination of make+model+software is
 *     more diagnostic than any one.
 *
 *   - GPS proximity: two accounts photographing the same location
 *     (within a few hundred meters) on different days is mild
 *     coincidence; within minutes of each other is highly diagnostic
 *     (the EXIF timestamps would confirm). This extractor reports
 *     the minimum spatial distance; temporal alignment is left to
 *     downstream reasoning since EXIF datetimes have their own
 *     timezone-and-format problems.
 *
 *   - Individual make/model/lens matches: weaker than the joint
 *     camera fingerprint but still informative when the device is
 *     uncommon.
 *
 * Algorithm:
 *
 *   1. Read each account's exif_make_set, exif_model_set,
 *      exif_software_set, exif_lens_make_set, exif_lens_model_set,
 *      exif_camera_fingerprint_set, exif_gps_points.
 *   2. For each set-valued field, compute Jaccard.
 *   3. For GPS, compute minimum haversine distance between any
 *      A-point and any B-point. Optionally also count "close
 *      proximity" pairs (within 1 km) as a discrete signal.
 *
 * Features emitted (always when both accounts have at least the
 * camera-fingerprint set; the empty case is informative):
 *
 *   exif_make_jaccard, exif_make_overlap_count
 *   exif_model_jaccard, exif_model_overlap_count
 *   exif_software_jaccard, exif_software_overlap_count
 *   exif_lens_model_jaccard, exif_lens_model_overlap_count
 *   exif_camera_fingerprint_jaccard,
 *     exif_camera_fingerprint_overlap_count (the headline §4.5.5
 *     signal: same physical kit detected across accounts)
 *
 *   exif_camera_fingerprint_shared (json, sorted array of shared
 *     fingerprint tuples; only when non-empty)
 *
 *   exif_gps_point_count_a, exif_gps_point_count_b (numeric)
 *   exif_gps_min_distance_km (numeric, only when both have GPS)
 *   exif_gps_close_pair_count (numeric, count of (A-point, B-point)
 *     pairs within 1 km; only when both have GPS)
 *
 * Determinism: pure set arithmetic plus haversine math. No
 * randomness, no clock, no I/O. Satisfies §6.1.
 *
 * Edge cases:
 *   - Either account missing exif_camera_fingerprint_set: returns
 *     empty (the runner filter handles this).
 *   - Either account has empty camera fingerprint set: emit zero
 *     overlaps and zero Jaccards. The pair extractor still emits
 *     these to provide a null-result data point.
 *   - One account has GPS, the other doesn't: emit
 *     exif_gps_point_count_{a,b} but not min_distance/close_pair.
 *   - Both have GPS but no point is within 1 km of any other: emit
 *     exif_gps_close_pair_count = 0 alongside the min distance.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'exif_overlap_metadata_leakage';
const VERSION = '1.0.0';

/** Haversine close-proximity threshold in km. */
const GPS_CLOSE_KM = 1.0;

export class ExifOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'metadata_leakage' as const;
  readonly requiredAccountFeatures = ['exif_camera_fingerprint_set'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const fingerprintA = parseStringSet(featuresA, 'exif_camera_fingerprint_set');
    const fingerprintB = parseStringSet(featuresB, 'exif_camera_fingerprint_set');
    if (fingerprintA === null || fingerprintB === null) return [];

    const makeA = parseStringSet(featuresA, 'exif_make_set') ?? new Set();
    const makeB = parseStringSet(featuresB, 'exif_make_set') ?? new Set();
    const modelA = parseStringSet(featuresA, 'exif_model_set') ?? new Set();
    const modelB = parseStringSet(featuresB, 'exif_model_set') ?? new Set();
    const softwareA = parseStringSet(featuresA, 'exif_software_set') ?? new Set();
    const softwareB = parseStringSet(featuresB, 'exif_software_set') ?? new Set();
    const lensModelA = parseStringSet(featuresA, 'exif_lens_model_set') ?? new Set();
    const lensModelB = parseStringSet(featuresB, 'exif_lens_model_set') ?? new Set();

    const gpsA = parseGpsPoints(featuresA);
    const gpsB = parseGpsPoints(featuresB);

    const cat = 'metadata_leakage' as const;
    const features: ExtractedFeature[] = [];

    pushJaccardFeatures(features, cat, 'exif_make', makeA, makeB);
    pushJaccardFeatures(features, cat, 'exif_model', modelA, modelB);
    pushJaccardFeatures(features, cat, 'exif_software', softwareA, softwareB);
    pushJaccardFeatures(features, cat, 'exif_lens_model', lensModelA, lensModelB);
    pushJaccardFeatures(features, cat, 'exif_camera_fingerprint', fingerprintA, fingerprintB);

    // Surface the shared camera fingerprints when present; this is
    // the most legally-relevant detail for human review of the
    // attribution evidence.
    const sharedFingerprints = intersect(fingerprintA, fingerprintB);
    if (sharedFingerprints.size > 0) {
      features.push({
        category: cat,
        name: 'exif_camera_fingerprint_shared',
        value: { kind: 'json', value: [...sharedFingerprints].sort() },
      });
    }

    // GPS comparison.
    features.push(
      {
        category: cat,
        name: 'exif_gps_point_count_a',
        value: { kind: 'numeric', value: gpsA.length },
      },
      {
        category: cat,
        name: 'exif_gps_point_count_b',
        value: { kind: 'numeric', value: gpsB.length },
      }
    );

    if (gpsA.length > 0 && gpsB.length > 0) {
      let minDistance = Number.POSITIVE_INFINITY;
      let closePairs = 0;
      for (const pa of gpsA) {
        for (const pb of gpsB) {
          const d = haversineKm(pa.lat, pa.lon, pb.lat, pb.lon);
          if (d < minDistance) minDistance = d;
          if (d <= GPS_CLOSE_KM) closePairs++;
        }
      }
      features.push(
        {
          category: cat,
          name: 'exif_gps_min_distance_km',
          value: { kind: 'numeric', value: minDistance },
        },
        {
          category: cat,
          name: 'exif_gps_close_pair_count',
          value: { kind: 'numeric', value: closePairs },
        }
      );
    }

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseStringSet(features: AccountFeatureMap, name: string): Set<string> | null {
  const v = features.get(name);
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;
  const out = new Set<string>();
  for (const item of v.value) {
    if (typeof item === 'string' && item.length > 0) out.add(item);
  }
  return out;
}

function parseGpsPoints(
  features: AccountFeatureMap
): Array<{ lat: number; lon: number }> {
  const v = features.get('exif_gps_points');
  if (!v || v.kind !== 'json' || !Array.isArray(v.value)) return [];
  const out: Array<{ lat: number; lon: number }> = [];
  for (const item of v.value) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const lat = obj.lat;
    const lon = obj.lon;
    if (
      typeof lat === 'number' &&
      typeof lon === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
    ) {
      out.push({ lat, lon });
    }
  }
  return out;
}

function pushJaccardFeatures(
  features: ExtractedFeature[],
  category: 'metadata_leakage',
  prefix: string,
  setA: Set<string>,
  setB: Set<string>
): void {
  const inter = intersect(setA, setB);
  const union = setA.size + setB.size - inter.size;
  const jaccard = union > 0 ? inter.size / union : 0;
  features.push(
    {
      category,
      name: `${prefix}_overlap_count`,
      value: { kind: 'numeric', value: inter.size },
    },
    {
      category,
      name: `${prefix}_jaccard`,
      value: { kind: 'numeric', value: jaccard },
    }
  );
}

function intersect<T>(a: Set<T>, b: Set<T>): Set<T> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<T>();
  for (const x of small) if (large.has(x)) out.add(x);
  return out;
}

/**
 * Great-circle distance between two lat/lon points, in kilometers.
 * Uses the haversine formula with Earth radius 6371 km. Accurate to
 * roughly 0.5% for typical pair distances; more than enough for the
 * "are these the same place" signal.
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const rLat1 = toRad(lat1);
  const rLat2 = toRad(lat2);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

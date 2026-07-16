/**
 * Stated location similarity pair extractor (§4.1.6).
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import { levenshtein, normalizeForCompare, normalizedSimilarity } from './text-similarity';
import { haversineKm } from './geocode';

const NAME = 'location_similarity_account_metadata';
const VERSION = '1.1.0';
const NEAR_MATCH_KM = 50;

export class LocationSimilarityExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'account_metadata' as const;
  readonly requiredAccountFeatures = ['location', 'has_location'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const hasLocA = readBool(featuresA, 'has_location');
    const hasLocB = readBool(featuresB, 'has_location');
    if (hasLocA === null || hasLocB === null) return [];

    const locA = readText(featuresA, 'location') ?? '';
    const locB = readText(featuresB, 'location') ?? '';
    const normA = normalizeForCompare(locA);
    const normB = normalizeForCompare(locB);

    const out: ExtractedFeature[] = [
      {
        category: 'account_metadata',
        name: 'location_both_set',
        value: { kind: 'numeric', value: hasLocA && hasLocB ? 1 : 0 },
      },
      {
        category: 'account_metadata',
        name: 'location_both_empty',
        value: { kind: 'numeric', value: !hasLocA && !hasLocB ? 1 : 0 },
      },
      {
        category: 'account_metadata',
        name: 'location_exact_match',
        value: {
          kind: 'numeric',
          value: hasLocA && hasLocB && normA === normB && normA.length > 0 ? 1 : 0,
        },
      },
      {
        category: 'account_metadata',
        name: 'location_edit_distance',
        value: {
          kind: 'numeric',
          value: hasLocA && hasLocB ? levenshtein(normA, normB) : -1,
        },
      },
      {
        category: 'account_metadata',
        name: 'location_similarity',
        value: {
          kind: 'numeric',
          value: hasLocA && hasLocB ? normalizedSimilarity(normA, normB) : 0,
        },
      },
    ];

    const geoA = readGeocode(featuresA);
    const geoB = readGeocode(featuresB);
    if (geoA && geoB) {
      const distanceKm = haversineKm(geoA.lat, geoA.lon, geoB.lat, geoB.lon);
      out.push(
        {
          category: 'account_metadata',
          name: 'location_geo_distance_km',
          value: { kind: 'numeric', value: distanceKm },
        },
        {
          category: 'account_metadata',
          name: 'location_geo_near_match',
          value: { kind: 'numeric', value: distanceKm <= NEAR_MATCH_KM ? 1 : 0 },
        }
      );
    }

    return out;
  }
}

function readText(features: AccountFeatureMap, name: string): string | null {
  const v = features.get(name);
  if (!v || v.kind !== 'text') return null;
  return v.value;
}

function readBool(features: AccountFeatureMap, name: string): boolean | null {
  const v = features.get(name);
  if (!v || v.kind !== 'numeric') return null;
  return v.value === 1;
}

function readNumeric(features: AccountFeatureMap, name: string): number | null {
  const v = features.get(name);
  if (!v || v.kind !== 'numeric') return null;
  return Number.isFinite(v.value) ? v.value : null;
}

function readGeocode(features: AccountFeatureMap): { lat: number; lon: number } | null {
  if (readBool(features, 'location_geocoded') !== true) return null;
  const lat = readNumeric(features, 'location_lat');
  const lon = readNumeric(features, 'location_lon');
  if (lat === null || lon === null) return null;
  return { lat, lon };
}

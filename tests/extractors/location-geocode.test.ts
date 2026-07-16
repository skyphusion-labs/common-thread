/**
 * Unit tests for offline profile location geocoding (§4.1.6).
 */

import { describe, expect, it } from 'vitest';
import {
  geocodeLocationString,
  haversineKm,
} from '../../implementation/extractors/account-metadata/geocode';
import { TwitterAccountMetadataExtractor } from '../../implementation/extractors/account-metadata/twitter';
import { LocationSimilarityExtractor } from '../../implementation/extractors/account-metadata/location-pair';
import type { AccountFeatureMap } from '../../implementation/extractors/pair-types';
import type { FeatureValue } from '../../implementation/schema/db-types';

function mapOf(entries: Record<string, FeatureValue>): AccountFeatureMap {
  return new Map(Object.entries(entries));
}

describe('geocodeLocationString', () => {
  it('exact-matches city names and common aliases', () => {
    expect(geocodeLocationString('San Francisco, CA')).toMatchObject({
      label: 'San Francisco',
      lat: 37.7749,
      lon: -122.4194,
      confidence: 1,
    });
    expect(geocodeLocationString('NYC')).toMatchObject({
      label: 'New York',
      confidence: 1,
    });
    expect(geocodeLocationString('London, UK')).toMatchObject({
      label: 'London',
      confidence: 1,
    });
    expect(geocodeLocationString('東京')).toBeNull();
    expect(geocodeLocationString('Tokyo')).toMatchObject({ label: 'Tokyo' });
  });

  it('returns null for unrecognizable locations', () => {
    expect(geocodeLocationString('')).toBeNull();
    expect(geocodeLocationString('Earth')).toBeNull();
    expect(geocodeLocationString('somewhere in the cloud')).toBeNull();
  });
});

describe('haversineKm', () => {
  it('computes distance between known cities', () => {
    const nyc = geocodeLocationString('New York')!;
    const la = geocodeLocationString('Los Angeles')!;
    const km = haversineKm(nyc.lat, nyc.lon, la.lat, la.lon);
    expect(km).toBeGreaterThan(3900);
    expect(km).toBeLessThan(4000);
  });
});

describe('TwitterAccountMetadataExtractor geocode features', () => {
  it('emits geocode fields when location matches', () => {
    const ext = new TwitterAccountMetadataExtractor();
    const profile = {
      username: 'alice',
      name: 'Alice',
      location: 'Seattle, WA',
      followersCount: 10,
      friendsCount: 5,
      statusesCount: 1,
    };
    const features = ext.extract({
      bytes: new TextEncoder().encode(JSON.stringify(profile)),
      manifestEntry: {
        source: 'https://twitter.com/alice',
        investigationId: 'inv',
        account: 'alice',
        collectionMethod: { tool: 'twitter-scraper', version: '1.0.0' },
        mimeType: 'application/json',
        collectedAt: '2026-01-01T00:00:00.000Z',
        sha256: 'abc',
        sizeBytes: 100,
      },
    });
    const byName = Object.fromEntries(features.map(f => [f.name, f.value]));
    expect(byName.location_geocoded).toEqual({ kind: 'numeric', value: 1 });
    expect(byName.location_lat).toEqual({ kind: 'numeric', value: 47.6062 });
    expect(byName.location_lon).toEqual({ kind: 'numeric', value: -122.3321 });
    expect(byName.location_geocode_label).toEqual({ kind: 'text', value: 'Seattle' });
    expect(byName.location_geocode_confidence).toEqual({ kind: 'numeric', value: 1 });
  });

  it('omits geocode fields when location does not match', () => {
    const ext = new TwitterAccountMetadataExtractor();
    const profile = {
      username: 'bob',
      name: 'Bob',
      location: 'Earth',
      followersCount: 10,
      friendsCount: 5,
      statusesCount: 1,
    };
    const features = ext.extract({
      bytes: new TextEncoder().encode(JSON.stringify(profile)),
      manifestEntry: {
        source: 'https://twitter.com/bob',
        investigationId: 'inv',
        account: 'bob',
        collectionMethod: { tool: 'twitter-scraper', version: '1.0.0' },
        mimeType: 'application/json',
        collectedAt: '2026-01-01T00:00:00.000Z',
        sha256: 'def',
        sizeBytes: 100,
      },
    });
    const names = features.map(f => f.name);
    expect(names).not.toContain('location_geocoded');
    expect(names).not.toContain('location_lat');
  });
});

describe('LocationSimilarityExtractor geo pair features', () => {
  it('emits geo distance and near-match when both accounts geocoded', () => {
    const ext = new LocationSimilarityExtractor();
    const seattle = {
      location: { kind: 'text' as const, value: 'Seattle' },
      has_location: { kind: 'numeric' as const, value: 1 },
      location_geocoded: { kind: 'numeric' as const, value: 1 },
      location_lat: { kind: 'numeric' as const, value: 47.6062 },
      location_lon: { kind: 'numeric' as const, value: -122.3321 },
    };
    const portland = {
      location: { kind: 'text' as const, value: 'Portland, OR' },
      has_location: { kind: 'numeric' as const, value: 1 },
      location_geocoded: { kind: 'numeric' as const, value: 1 },
      location_lat: { kind: 'numeric' as const, value: 45.5152 },
      location_lon: { kind: 'numeric' as const, value: -122.6784 },
    };
    const features = ext.extract('a', 'b', mapOf(seattle), mapOf(portland));
    const distance = features.find(f => f.name === 'location_geo_distance_km');
    const near = features.find(f => f.name === 'location_geo_near_match');
    expect(distance?.value).toEqual({ kind: 'numeric', value: expect.any(Number) });
    if (distance?.value.kind === 'numeric') {
      expect(distance.value.value).toBeGreaterThan(200);
      expect(distance.value.value).toBeLessThan(300);
    }
    expect(near?.value).toEqual({ kind: 'numeric', value: 0 });
  });

  it('flags near match within 50 km', () => {
    const ext = new LocationSimilarityExtractor();
    const sf = {
      location: { kind: 'text' as const, value: 'San Francisco' },
      has_location: { kind: 'numeric' as const, value: 1 },
      location_geocoded: { kind: 'numeric' as const, value: 1 },
      location_lat: { kind: 'numeric' as const, value: 37.7749 },
      location_lon: { kind: 'numeric' as const, value: -122.4194 },
    };
    const oakland = {
      location: { kind: 'text' as const, value: 'Oakland, CA' },
      has_location: { kind: 'numeric' as const, value: 1 },
      location_geocoded: { kind: 'numeric' as const, value: 1 },
      location_lat: { kind: 'numeric' as const, value: 37.8044 },
      location_lon: { kind: 'numeric' as const, value: -122.2712 },
    };
    const features = ext.extract('a', 'b', mapOf(sf), mapOf(oakland));
    const near = features.find(f => f.name === 'location_geo_near_match');
    expect(near?.value).toEqual({ kind: 'numeric', value: 1 });
  });

  it('omits geo features when either account is not geocoded', () => {
    const ext = new LocationSimilarityExtractor();
    const geocoded = {
      location: { kind: 'text' as const, value: 'Boston' },
      has_location: { kind: 'numeric' as const, value: 1 },
      location_geocoded: { kind: 'numeric' as const, value: 1 },
      location_lat: { kind: 'numeric' as const, value: 42.3601 },
      location_lon: { kind: 'numeric' as const, value: -71.0589 },
    };
    const notGeocoded = {
      location: { kind: 'text' as const, value: 'Earth' },
      has_location: { kind: 'numeric' as const, value: 1 },
    };
    const features = ext.extract('a', 'b', mapOf(geocoded), mapOf(notGeocoded));
    const names = features.map(f => f.name);
    expect(names).not.toContain('location_geo_distance_km');
    expect(names).not.toContain('location_geo_near_match');
  });
});

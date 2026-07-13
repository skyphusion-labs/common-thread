/**
 * Unit tests for metadata-leakage pair extractors (§4.7).
 */

import { describe, expect, it } from 'vitest';
import { ClientAppOverlapExtractor } from '../../implementation/extractors/metadata-leakage/client-app-overlap';
import { ProfileLangOverlapExtractor } from '../../implementation/extractors/metadata-leakage/profile-lang-overlap';
import { TweetLanguageOverlapExtractor } from '../../implementation/extractors/metadata-leakage/language-overlap';
import { ExifOverlapExtractor } from '../../implementation/extractors/visual/exif-overlap';
import type { AccountFeatureMap } from '../../implementation/extractors/pair-types';
import type { FeatureValue } from '../../implementation/schema/db-types';

function mapOf(entries: Record<string, FeatureValue>): AccountFeatureMap {
  return new Map(Object.entries(entries));
}

describe('ClientAppOverlapExtractor', () => {
  const extractor = new ClientAppOverlapExtractor();

  it('reports identical client-app distributions as maximally similar', () => {
    const dist = { 'Twitter Web App': 40, 'Twitter for iPhone': 10 };
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ client_app_distribution: { kind: 'json', value: dist } }),
      mapOf({ client_app_distribution: { kind: 'json', value: dist } })
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.client_app_jaccard.value).toEqual({ kind: 'numeric', value: 1 });
    expect(byName.client_app_jsd.value).toEqual({ kind: 'numeric', value: 0 });
    expect(byName.client_app_similarity.value).toEqual({ kind: 'numeric', value: 1 });
    expect(byName.client_app_shared?.value).toEqual({
      kind: 'json',
      value: ['Twitter Web App', 'Twitter for iPhone'],
    });
  });
});

describe('ProfileLangOverlapExtractor', () => {
  const extractor = new ProfileLangOverlapExtractor();

  it('flags matching profile languages after normalization', () => {
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ profile_lang: { kind: 'text', value: ' EN ' } }),
      mapOf({ profile_lang: { kind: 'text', value: 'en' } })
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.profile_lang_match.value).toEqual({ kind: 'numeric', value: 1 });
    expect(byName.profile_lang_a.value).toEqual({ kind: 'text', value: 'en' });
  });

  it('reports disagreement when languages differ', () => {
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ profile_lang: { kind: 'text', value: 'ja' } }),
      mapOf({ profile_lang: { kind: 'text', value: 'en' } })
    );
    expect(features.find((f) => f.name === 'profile_lang_match')?.value).toEqual({
      kind: 'numeric',
      value: 0,
    });
  });
});

describe('TweetLanguageOverlapExtractor', () => {
  const extractor = new TweetLanguageOverlapExtractor();

  it('computes Jaccard and JSD on tweet language distributions', () => {
    const distA = { en: 50, es: 5 };
    const distB = { en: 40, fr: 2 };
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ tweet_language_distribution: { kind: 'json', value: distA } }),
      mapOf({ tweet_language_distribution: { kind: 'json', value: distB } })
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.tweet_language_jaccard.value).toEqual({ kind: 'numeric', value: 1 / 3 });
    expect(byName.tweet_language_shared?.value).toEqual({ kind: 'json', value: ['en'] });
    expect(byName.tweet_language_similarity.value.kind).toBe('numeric');
  });
});

describe('ExifOverlapExtractor', () => {
  const extractor = new ExifOverlapExtractor();

  it('surfaces shared camera fingerprints and GPS proximity', () => {
    const fingerprint = 'Canon|EOS R5|RF24-70';
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({
        exif_camera_fingerprint_set: { kind: 'json', value: [fingerprint, 'Nikon|Z6'] },
        exif_make_set: { kind: 'json', value: ['Canon'] },
        exif_model_set: { kind: 'json', value: ['EOS R5'] },
        exif_gps_points: {
          kind: 'json',
          value: [{ lat: 42.3314, lon: -83.0458 }],
        },
      }),
      mapOf({
        exif_camera_fingerprint_set: { kind: 'json', value: [fingerprint] },
        exif_make_set: { kind: 'json', value: ['Canon'] },
        exif_model_set: { kind: 'json', value: ['EOS R5'] },
        exif_gps_points: {
          kind: 'json',
          value: [{ lat: 42.3315, lon: -83.0459 }],
        },
      })
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.exif_camera_fingerprint_jaccard.value).toEqual({
      kind: 'numeric',
      value: 1 / 2,
    });
    expect(byName.exif_camera_fingerprint_shared?.value).toEqual({
      kind: 'json',
      value: [fingerprint],
    });
    expect(byName.exif_gps_close_pair_count.value).toEqual({ kind: 'numeric', value: 1 });
    expect((byName.exif_gps_min_distance_km.value as { value: number }).value).toBeLessThan(0.02);
  });
});

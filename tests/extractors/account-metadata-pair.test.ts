import { describe, expect, it } from 'vitest';
import {
  bigramJaccard,
  levenshtein,
  normalizedSimilarity,
} from '../../implementation/extractors/account-metadata/text-similarity';
import { CreationDateClusterExtractor } from '../../implementation/extractors/account-metadata/creation-date-pair';
import { DisplayNameBioSimilarityExtractor } from '../../implementation/extractors/account-metadata/display-name-bio-pair';
import { BioTemplateOverlapExtractor } from '../../implementation/extractors/account-metadata/bio-template-pair';
import type { AccountFeatureMap } from '../../implementation/extractors/pair-types';
import type { FeatureValue } from '../../implementation/schema/db-types';

function mapOf(entries: Record<string, FeatureValue>): AccountFeatureMap {
  return new Map(Object.entries(entries));
}

describe('account-metadata pair extractors', () => {
  it('computes levenshtein and similarity helpers', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(normalizedSimilarity('alice', 'alice')).toBe(1);
    expect(bigramJaccard('hello', 'hello')).toBe(1);
  });

  it('emits creation date deltas', () => {
    const ext = new CreationDateClusterExtractor();
    const features = ext.extract(
      'a',
      'b',
      mapOf({
        creation_date: { kind: 'text', value: '2020-01-01T00:00:00.000Z' },
      }),
      mapOf({
        creation_date: { kind: 'text', value: '2020-01-08T00:00:00.000Z' },
      })
    );
    expect(features.find(f => f.name === 'creation_date_delta_days')?.value).toEqual({
      kind: 'numeric',
      value: 7,
    });
    expect(features.find(f => f.name === 'creation_date_within_7_days')?.value).toEqual({
      kind: 'numeric',
      value: 1,
    });
  });

  it('emits display name and bio similarity', () => {
    const ext = new DisplayNameBioSimilarityExtractor();
    const base = {
      display_name: { kind: 'text' as const, value: 'Alice Example' },
      username: { kind: 'text' as const, value: 'alice' },
      bio: { kind: 'text' as const, value: 'writer | NYC' },
    };
    const features = ext.extract('a', 'b', mapOf(base), mapOf(base));
    expect(features.find(f => f.name === 'display_name_similarity')?.value).toEqual({
      kind: 'numeric',
      value: 1,
    });
  });

  it('matches bio template fingerprints', () => {
    const ext = new BioTemplateOverlapExtractor();
    const bio = { kind: 'text' as const, value: 'NYC | writer https://example.com' };
    const features = ext.extract('a', 'b', mapOf({ bio }), mapOf({ bio }));
    expect(features.find(f => f.name === 'bio_template_fingerprint_match')?.value).toEqual({
      kind: 'numeric',
      value: 1,
    });
  });
});

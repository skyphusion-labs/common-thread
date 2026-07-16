/**
 * Unit tests for image source_class (§4.5.4).
 */

import { describe, expect, it } from 'vitest';
import { ImageHashExtractor } from '../../implementation/extractors/visual/image-hash-extractor';
import { ImageSourceClassOverlapExtractor } from '../../implementation/extractors/visual/source-class-overlap';
import {
  normalizeSourceClass,
  withManifestSourceClass,
} from '../../implementation/extractors/visual/source-class';
import type { ManifestEntry } from '../../implementation/archive/types';
import type { AccountFeatureMap } from '../../implementation/extractors/pair-types';
import type { FeatureValue } from '../../implementation/schema/db-types';

function mapOf(entries: Record<string, FeatureValue>): AccountFeatureMap {
  return new Map(Object.entries(entries));
}

function baseEntry(overrides: Partial<ManifestEntry> = {}): ManifestEntry {
  return {
    hash: 'a'.repeat(64),
    source: 'https://pbs.twimg.com/profile_images/1/photo.jpg',
    collectedAt: '2026-07-16T00:00:00Z',
    collectionMethod: { tool: 'test', version: '1.0.0' },
    investigationId: 'inv_test',
    account: 'alice',
    status: 'present',
    mimeType: 'image/jpeg',
    platformMetadata: { imageType: 'profile' },
    ...overrides,
  };
}

describe('normalizeSourceClass', () => {
  it('accepts paper classes and aliases', () => {
    expect(normalizeSourceClass('stock')).toBe('stock');
    expect(normalizeSourceClass('AI-generated')).toBe('AI-generated');
    expect(normalizeSourceClass('ai_generated')).toBe('AI-generated');
    expect(normalizeSourceClass('screenshot')).toBe('scraped');
    expect(normalizeSourceClass('meme template')).toBe('scraped');
  });

  it('rejects unknown labels', () => {
    expect(normalizeSourceClass('unknown')).toBeNull();
    expect(normalizeSourceClass('')).toBeNull();
  });
});

describe('ImageHashExtractor source_class', () => {
  const extractor = new ImageHashExtractor();

  it('emits profile_image_source_class from manifest metadata', () => {
    const entry = withManifestSourceClass(baseEntry(), 'celebrity');
    const features = extractor.extract({
      bytes: new Uint8Array([1, 2, 3]),
      entry,
    });
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.profile_image_source_class?.value).toEqual({
      kind: 'text',
      value: 'celebrity',
    });
    expect(byName.profile_image_sha256?.value).toEqual({
      kind: 'text',
      value: 'a'.repeat(64),
    });
  });

  it('omits source_class when not labeled', () => {
    const features = extractor.extract({
      bytes: new Uint8Array([1, 2, 3]),
      entry: baseEntry(),
    });
    expect(features.find((f) => f.name === 'profile_image_source_class')).toBeUndefined();
  });
});

describe('ImageSourceClassOverlapExtractor', () => {
  const extractor = new ImageSourceClassOverlapExtractor();

  it('matches identical profile source classes', () => {
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ profile_image_source_class: { kind: 'text', value: 'stock' } }),
      mapOf({ profile_image_source_class: { kind: 'text', value: 'stock' } })
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.profile_image_source_class_match?.value).toEqual({
      kind: 'numeric',
      value: 1,
    });
  });

  it('reports disagreement', () => {
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ profile_image_source_class: { kind: 'text', value: 'stock' } }),
      mapOf({ profile_image_source_class: { kind: 'text', value: 'original' } })
    );
    expect(
      features.find((f) => f.name === 'profile_image_source_class_match')?.value
    ).toEqual({ kind: 'numeric', value: 0 });
  });

  it('returns empty when neither side is labeled', () => {
    expect(extractor.extract('a', 'b', mapOf({}), mapOf({}))).toEqual([]);
  });
});

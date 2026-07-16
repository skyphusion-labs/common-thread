/**
 * Unit tests for link shortener fingerprints (§4.7.4).
 */

import { describe, expect, it } from 'vitest';
import {
  classifyShortenerUrl,
  shortenerAccountFeatures,
  summarizeShorteners,
} from '../../implementation/extractors/metadata-leakage/shortener';
import { ShortenerFingerprintOverlapExtractor } from '../../implementation/extractors/metadata-leakage/shortener-fingerprint-overlap';
import type { AccountFeatureMap } from '../../implementation/extractors/pair-types';
import type { FeatureValue } from '../../implementation/schema/db-types';

function mapOf(entries: Record<string, FeatureValue>): AccountFeatureMap {
  return new Map(Object.entries(entries));
}

describe('classifyShortenerUrl', () => {
  it('classifies commercial shorteners', () => {
    const hit = classifyShortenerUrl('https://bit.ly/abc123');
    expect(hit).toMatchObject({
      host: 'bit.ly',
      kind: 'commercial',
      path_token: 'abc123',
      fingerprint: 'commercial:bit.ly',
    });
  });

  it('classifies platform shorteners', () => {
    expect(classifyShortenerUrl('https://t.co/XyZ')).toMatchObject({
      host: 't.co',
      kind: 'platform',
      fingerprint: 'platform:t.co',
    });
  });

  it('classifies self-hosted shortener heuristics', () => {
    const hit = classifyShortenerUrl('https://go.example.com/x7k9');
    expect(hit).toMatchObject({
      host: 'go.example.com',
      kind: 'self_hosted',
      fingerprint: 'self_hosted:go.example.com',
    });
  });

  it('ignores ordinary content URLs', () => {
    expect(classifyShortenerUrl('https://news.example.com/long/path/article')).toBeNull();
    expect(classifyShortenerUrl('https://github.com/skyphusion-labs/common-thread')).toBeNull();
  });

  it('accepts normalizeUrl-style host/path strings', () => {
    expect(classifyShortenerUrl('bit.ly/zz99')).toMatchObject({
      host: 'bit.ly',
      kind: 'commercial',
    });
  });
});

describe('shortenerAccountFeatures', () => {
  it('emits distributions and counts from posted URLs', () => {
    const urls = new Set([
      'bit.ly/a1',
      'bit.ly/b2',
      't.co/xx',
      'go.ops.example/ab12',
      'news.example.com/story',
    ]);
    const features = shortenerAccountFeatures(urls);
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.shortener_link_count.value).toEqual({ kind: 'numeric', value: 4 });
    expect(byName.shortener_commercial_count.value).toEqual({ kind: 'numeric', value: 2 });
    expect(byName.shortener_self_hosted_count.value).toEqual({ kind: 'numeric', value: 1 });
    expect(byName.shortener_domain_distribution.value).toEqual({
      kind: 'json',
      value: { 'bit.ly': 2, 't.co': 1, 'go.ops.example': 1 },
    });
  });

  it('emits empty distributions when no shorteners present', () => {
    const features = shortenerAccountFeatures(new Set(['https://example.com/a']));
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.shortener_link_count.value).toEqual({ kind: 'numeric', value: 0 });
    expect(byName.shortener_domain_distribution.value).toEqual({ kind: 'json', value: {} });
  });
});

describe('ShortenerFingerprintOverlapExtractor', () => {
  const extractor = new ShortenerFingerprintOverlapExtractor();

  it('reports shared commercial shortener hosts as high overlap', () => {
    const dist = { 'bit.ly': 3, 't.co': 1 };
    const fps = ['commercial:bit.ly', 'platform:t.co'];
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({
        shortener_domain_distribution: { kind: 'json', value: dist },
        shortener_fingerprint_set: { kind: 'json', value: fps },
        shortener_path_tokens: { kind: 'json', value: ['bit.ly|abc'] },
      }),
      mapOf({
        shortener_domain_distribution: { kind: 'json', value: { 'bit.ly': 2 } },
        shortener_fingerprint_set: { kind: 'json', value: ['commercial:bit.ly'] },
        shortener_path_tokens: { kind: 'json', value: ['bit.ly|abc', 'bit.ly|zzz'] },
      })
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.shortener_shared_hosts?.value).toEqual({
      kind: 'json',
      value: ['bit.ly'],
    });
    expect(byName.shortener_shared_fingerprints?.value).toEqual({
      kind: 'json',
      value: ['commercial:bit.ly'],
    });
    expect(byName.shortener_shared_path_tokens?.value).toEqual({
      kind: 'json',
      value: ['bit.ly|abc'],
    });
    expect((byName.shortener_domain_jaccard.value as { value: number }).value).toBeGreaterThan(0);
  });

  it('returns empty when distribution feature missing', () => {
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({}),
      mapOf({ shortener_domain_distribution: { kind: 'json', value: {} } })
    );
    expect(features).toEqual([]);
  });
});

describe('summarizeShorteners determinism', () => {
  it('sorts fingerprint sets stably', () => {
    const a = summarizeShorteners(['t.co/a', 'bit.ly/x']);
    const b = summarizeShorteners(['bit.ly/x', 't.co/a']);
    expect(a.fingerprint_set).toEqual(b.fingerprint_set);
  });
});

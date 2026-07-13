/**
 * Unit tests for cross-platform pair extractors (§4.6).
 */

import { describe, expect, it } from 'vitest';
import { HandleReuseExtractor } from '../../implementation/extractors/cross-platform/handle-reuse';
import { BioLinkOverlapExtractor } from '../../implementation/extractors/cross-platform/bio-link-overlap';
import { ExternalLinkOverlapExtractor } from '../../implementation/extractors/cross-platform/external-link-overlap';
import type { AccountFeatureMap } from '../../implementation/extractors/pair-types';
import type { FeatureValue } from '../../implementation/schema/db-types';

function mapOf(entries: Record<string, FeatureValue>): AccountFeatureMap {
  return new Map(Object.entries(entries));
}

describe('HandleReuseExtractor', () => {
  const extractor = new HandleReuseExtractor();

  it('detects year-suffix handle variants', () => {
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ username: { kind: 'text', value: 'operator2024' } }),
      mapOf({ username: { kind: 'text', value: 'operator2025' } })
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.handle_match_variant.value).toEqual({ kind: 'text', value: 'year_suffix' });
    expect(byName.handle_match_score.value).toEqual({ kind: 'numeric', value: 0.95 });
  });

  it('normalizes @ and u/ prefixes before comparison', () => {
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ username: { kind: 'text', value: '@SameHandle' } }),
      mapOf({ username: { kind: 'text', value: 'u/SameHandle' } })
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.handle_match_variant.value).toEqual({ kind: 'text', value: 'exact' });
    expect(byName.handle_a_normalized.value).toEqual({ kind: 'text', value: 'samehandle' });
  });

  it('returns empty when either username is missing', () => {
    expect(
      extractor.extract(
        'alice',
        'bob',
        mapOf({ username: { kind: 'text', value: 'alice' } }),
        mapOf({})
      )
    ).toEqual([]);
  });
});

describe('BioLinkOverlapExtractor', () => {
  const extractor = new BioLinkOverlapExtractor();

  it('computes full-URL and host Jaccard on bio links', () => {
    const shared = 'https://example.org/blog?utm_source=twitter';
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({
        bio: { kind: 'text', value: `Writer. ${shared}` },
      }),
      mapOf({
        bio: { kind: 'text', value: `Also at ${shared}` },
      })
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.bio_link_overlap_count.value).toEqual({ kind: 'numeric', value: 1 });
    expect(byName.bio_link_jaccard.value).toEqual({ kind: 'numeric', value: 1 });
    expect(byName.bio_link_host_jaccard.value).toEqual({ kind: 'numeric', value: 1 });
    expect(byName.bio_link_shared_urls?.value).toEqual({
      kind: 'json',
      value: ['example.org/blog'],
    });
  });

  it('emits zero overlap when neither bio contains URLs', () => {
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ bio: { kind: 'text', value: 'No links here.' } }),
      mapOf({ bio: { kind: 'text', value: 'Also link-free.' } })
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.bio_link_jaccard.value).toEqual({ kind: 'numeric', value: 0 });
    expect(byName.bio_link_count_a.value).toEqual({ kind: 'numeric', value: 0 });
  });
});

describe('ExternalLinkOverlapExtractor', () => {
  const extractor = new ExternalLinkOverlapExtractor();

  it('computes posted URL overlap from normalized sets', () => {
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({
        posted_urls: {
          kind: 'json',
          value: ['news.site/a', 'news.site/b', 'other.site/x'],
        },
      }),
      mapOf({
        posted_urls: {
          kind: 'json',
          value: ['news.site/b', 'news.site/c'],
        },
      })
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.posted_url_overlap_count.value).toEqual({ kind: 'numeric', value: 1 });
    expect(byName.posted_url_jaccard.value).toEqual({ kind: 'numeric', value: 1 / 4 });
    expect(byName.posted_url_shared?.value).toEqual({
      kind: 'json',
      value: ['news.site/b'],
    });
    expect(byName.posted_url_shared_hosts?.value).toEqual({
      kind: 'json',
      value: ['news.site'],
    });
  });
});

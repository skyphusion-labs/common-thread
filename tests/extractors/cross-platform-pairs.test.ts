/**
 * Unit tests for cross-platform pair extractors (§4.6).
 */

import { describe, expect, it } from 'vitest';
import { HandleReuseExtractor } from '../../implementation/extractors/cross-platform/handle-reuse';
import { BioLinkOverlapExtractor } from '../../implementation/extractors/cross-platform/bio-link-overlap';
import { BioTextRarityOverlapExtractor } from '../../implementation/extractors/cross-platform/bio-text-rarity-overlap';
import { ExternalLinkOverlapExtractor } from '../../implementation/extractors/cross-platform/external-link-overlap';
import {
  idfWeight,
  rarityWeightedJaccard,
} from '../../implementation/extractors/cross-platform/rarity';
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

  it('emits rarity-weighted bio-link features from seed corpus (§6.2.6)', () => {
    const seed = [
      {
        account: 'alice',
        features: mapOf({
          bio: {
            kind: 'text',
            value: 'https://rare.example/op https://twitter.com/alice',
          },
        }),
      },
      {
        account: 'bob',
        features: mapOf({
          bio: {
            kind: 'text',
            value: 'https://rare.example/op https://twitter.com/bob',
          },
        }),
      },
      {
        account: 'carol',
        features: mapOf({
          bio: { kind: 'text', value: 'https://twitter.com/carol' },
        }),
      },
      {
        account: 'dave',
        features: mapOf({
          bio: { kind: 'text', value: 'https://twitter.com/dave' },
        }),
      },
    ];
    const ctx = extractor.buildContext!(seed);
    const features = extractor.extract(
      'alice',
      'bob',
      seed[0].features,
      seed[1].features,
      ctx
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.bio_link_rarity_weighted_jaccard.value.kind).toBe('numeric');
    expect(byName.bio_link_host_rarity_weighted_jaccard.value.kind).toBe('numeric');
    expect(idfWeight(2, 4)).toBeGreaterThan(idfWeight(4, 4));
  });
});

describe('BioTextRarityOverlapExtractor', () => {
  const extractor = new BioTextRarityOverlapExtractor();

  it('weights rare shared bio tokens across Mastodon/Bluesky-style bios', () => {
    // Fixture-style profiles: Mastodon note + Bluesky description sharing
    // an unusual motto while also sharing a common filler word.
    const mastodon = mapOf({
      bio: {
        kind: 'text',
        value: 'Journalist. Motto: xerophyte. Links welcome.',
      },
    });
    const bluesky = mapOf({
      bio: {
        kind: 'text',
        value: 'Reporter on Bluesky. Motto xerophyte forever.',
      },
    });
    const fillerA = mapOf({
      bio: { kind: 'text', value: 'Just a journalist posting links.' },
    });
    const fillerB = mapOf({
      bio: { kind: 'text', value: 'Another journalist on the timeline.' },
    });

    const ctx = extractor.buildContext!([
      { account: 'masto_alice', features: mastodon },
      { account: 'bsky_bob', features: bluesky },
      { account: 'masto_carol', features: fillerA },
      { account: 'bsky_dave', features: fillerB },
    ]);

    const features = extractor.extract(
      'masto_alice',
      'bsky_bob',
      mastodon,
      bluesky,
      ctx
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.bio_token_shared?.value).toEqual({
      kind: 'json',
      value: expect.arrayContaining(['xerophyte', 'motto']),
    });
    expect(
      (byName.bio_token_rarity_weighted_jaccard.value as { value: number }).value
    ).toBeGreaterThan(
      (byName.bio_token_jaccard.value as { value: number }).value * 0.5
    );
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

  it('emits rarity-weighted posted URL overlap from seed corpus', () => {
    const seed = [
      {
        account: 'alice',
        features: mapOf({
          posted_urls: {
            kind: 'json',
            value: ['rare.blog/essay', 't.co/aaa'],
          },
        }),
      },
      {
        account: 'bob',
        features: mapOf({
          posted_urls: {
            kind: 'json',
            value: ['rare.blog/essay', 't.co/bbb'],
          },
        }),
      },
      {
        account: 'carol',
        features: mapOf({
          posted_urls: { kind: 'json', value: ['t.co/ccc'] },
        }),
      },
      {
        account: 'dave',
        features: mapOf({
          posted_urls: { kind: 'json', value: ['t.co/ddd'] },
        }),
      },
    ];
    const ctx = extractor.buildContext!(seed);
    const features = extractor.extract(
      'alice',
      'bob',
      seed[0].features,
      seed[1].features,
      ctx
    );
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.posted_url_rarity_weighted_jaccard.value.kind).toBe('numeric');
    expect(byName.posted_url_host_rarity_weighted_jaccard.value.kind).toBe(
      'numeric'
    );

    // Pure helper: sharing a rare item scores higher than sharing a common one
    // at equal set geometry.
    const df = new Map([
      ['rare.blog/essay', 2],
      ['t.co/aaa', 1],
      ['t.co/bbb', 1],
      ['common.site/x', 4],
      ['t.co/ccc', 1],
      ['t.co/ddd', 1],
    ]);
    const rareShare = rarityWeightedJaccard(
      new Set(['rare.blog/essay', 't.co/aaa']),
      new Set(['rare.blog/essay', 't.co/bbb']),
      df,
      4
    );
    const commonShare = rarityWeightedJaccard(
      new Set(['common.site/x', 't.co/ccc']),
      new Set(['common.site/x', 't.co/ddd']),
      df,
      4
    );
    expect(rareShare).toBeGreaterThan(commonShare);
  });
});

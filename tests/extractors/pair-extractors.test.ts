/**
 * Unit tests for high-signal pair extractors (direct extract() calls).
 *
 * Full runner integration (MySQL + R2 manifest) lives in runner.test.ts
 * (hybrid suite; see vitest.config.mts).
 */

import { describe, expect, it } from 'vitest';
import { BurrowsDeltaExtractor } from '../../implementation/extractors/stylometric/burrows-delta';
import { CadenceJsdExtractor } from '../../implementation/extractors/temporal/cadence-jsd';
import { FollowerOverlapExtractor } from '../../implementation/extractors/network/follower-overlap';
import { SubredditOverlapExtractor } from '../../implementation/extractors/network/subreddit-overlap';
import type { AccountFeatureMap } from '../../implementation/extractors/pair-types';
import type { FeatureValue } from '../../implementation/schema/db-types';
import { FUNCTION_WORD_VECTOR_LENGTH } from '../../implementation/extractors/stylometric/function-words';

function mapOf(entries: Record<string, FeatureValue>): AccountFeatureMap {
  return new Map(Object.entries(entries));
}

function fwVector(overrides: Record<number, number>): number[] {
  const base = 1 / (FUNCTION_WORD_VECTOR_LENGTH * 10);
  const vec = Array.from({ length: FUNCTION_WORD_VECTOR_LENGTH }, () => base);
  for (const [idx, val] of Object.entries(overrides)) {
    vec[Number(idx)] = val;
  }
  return vec;
}

function hourDowDistribution(hour: number, dow: number, count = 10): number[] {
  const bins = new Array(168).fill(0);
  bins[dow * 24 + hour] = count;
  return bins;
}

describe('BurrowsDeltaExtractor', () => {
  it('returns zero delta for identical function-word vectors', () => {
    const fwAlice = fwVector({ 0: 0.5, 1: 0.1 });
    const fwBob = fwVector({ 0: 0.5, 1: 0.1 });
    const fwCharlie = fwVector({ 0: 0.2, 1: 0.3 });
    const extractor = new BurrowsDeltaExtractor();
    const context = extractor.buildContext!([
      { account: 'alice', features: mapOf({ function_word_frequencies: { kind: 'json', value: fwAlice } }) },
      { account: 'bob', features: mapOf({ function_word_frequencies: { kind: 'json', value: fwBob } }) },
      {
        account: 'charlie',
        features: mapOf({ function_word_frequencies: { kind: 'json', value: fwCharlie } }),
      },
    ]);

    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ function_word_frequencies: { kind: 'json', value: fwAlice } }),
      mapOf({ function_word_frequencies: { kind: 'json', value: fwBob } }),
      context
    );

    expect(features.find(f => f.name === 'burrows_delta')?.value).toEqual({
      kind: 'numeric',
      value: 0,
    });
  });
});

describe('CadenceJsdExtractor', () => {
  it('returns zero JSD for identical hour-dow distributions', () => {
    const dist = hourDowDistribution(9, 1);
    const extractor = new CadenceJsdExtractor();
    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ posting_hour_dow_distribution: { kind: 'json', value: dist } }),
      mapOf({ posting_hour_dow_distribution: { kind: 'json', value: dist } })
    );

    expect(features.find(f => f.name === 'cadence_jsd')?.value).toEqual({
      kind: 'numeric',
      value: 0,
    });
  });
});

describe('FollowerOverlapExtractor', () => {
  it('computes Jaccard on overlapping follower sets', () => {
    const extractor = new FollowerOverlapExtractor();
    const context = extractor.buildContext!([
      {
        account: 'alice',
        features: mapOf({ follower_set: { kind: 'json', value: ['fan_one', 'fan_two', 'fan_three'] } }),
      },
      {
        account: 'bob',
        features: mapOf({ follower_set: { kind: 'json', value: ['fan_two', 'fan_three', 'fan_four'] } }),
      },
    ]);

    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ follower_set: { kind: 'json', value: ['fan_one', 'fan_two', 'fan_three'] } }),
      mapOf({ follower_set: { kind: 'json', value: ['fan_two', 'fan_three', 'fan_four'] } }),
      context
    );

    expect(features.find(f => f.name === 'follower_overlap_jaccard')?.value).toEqual({
      kind: 'numeric',
      value: 0.5,
    });
    expect(features.find(f => f.name === 'follower_overlap_count')?.value).toEqual({
      kind: 'numeric',
      value: 2,
    });
  });
});

describe('SubredditOverlapExtractor', () => {
  it('surfaces shared subreddits and similarity metrics', () => {
    const extractor = new SubredditOverlapExtractor();
    const distA = { programming: 10, linux: 5, askreddit: 1 };
    const distB = { programming: 8, linux: 4, worldnews: 2 };

    const features = extractor.extract(
      'alice',
      'bob',
      mapOf({ subreddit_distribution: { kind: 'json', value: distA } }),
      mapOf({ subreddit_distribution: { kind: 'json', value: distB } })
    );

    expect(features.find(f => f.name === 'subreddit_shared')?.value).toEqual({
      kind: 'json',
      value: ['linux', 'programming'],
    });
    expect(features.find(f => f.name === 'subreddit_overlap_count')?.value).toEqual({
      kind: 'numeric',
      value: 2,
    });
    expect(features.find(f => f.name === 'subreddit_jaccard')?.value.kind).toBe('numeric');
    expect(features.find(f => f.name === 'subreddit_jsd')?.value.kind).toBe('numeric');
  });
});

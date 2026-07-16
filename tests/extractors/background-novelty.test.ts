/**
 * Unit tests for §4.3.2–3 background TF-IDF / novelty n-grams.
 */

import { describe, expect, it } from 'vitest';
import {
  BackgroundCorpusExtractor,
  parseBackgroundDocuments,
} from '../../implementation/extractors/stylometric/background-corpus';
import { TwitterAccountTermTfExtractor } from '../../implementation/extractors/stylometric/account-term-tf';
import {
  BackgroundNoveltyPairExtractor,
  topWeighted,
} from '../../implementation/extractors/stylometric/background-novelty-pair';
import type { AccountFeatureMap } from '../../implementation/extractors/pair-types';
import type { FeatureValue } from '../../implementation/schema/db-types';

function featureMap(entries: Record<string, FeatureValue>): AccountFeatureMap {
  return new Map(Object.entries(entries));
}

describe('parseBackgroundDocuments', () => {
  it('accepts documents / texts / bare array shapes', () => {
    expect(
      parseBackgroundDocuments(
        new TextEncoder().encode(JSON.stringify({ documents: ['a', 'b'] }))
      )
    ).toEqual(['a', 'b']);
    expect(
      parseBackgroundDocuments(
        new TextEncoder().encode(JSON.stringify({ texts: ['x'] }))
      )
    ).toEqual(['x']);
    expect(
      parseBackgroundDocuments(new TextEncoder().encode(JSON.stringify(['y', 'z'])))
    ).toEqual(['y', 'z']);
  });
});

describe('BackgroundCorpusExtractor', () => {
  it('emits DF maps from a background corpus artifact', () => {
    const docs = {
      documents: [
        'the cat sat on the mat in the community forum today',
        'another community post about the weather and cats',
        'rare jargon alpha beta appears once here only',
      ],
    };
    const extractor = new BackgroundCorpusExtractor();
    const features = extractor.extract({
      bytes: new TextEncoder().encode(JSON.stringify(docs)),
      entry: {
        hash: 'b'.repeat(64),
        source: 'practitioner://background',
        collectedAt: '2026-01-01T00:00:00.000Z',
        collectionMethod: { tool: 'background-corpus', version: '1' },
        investigationId: 'inv',
        account: 'control',
        mimeType: 'application/x-background-corpus',
        status: 'present',
      },
    });
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.background_doc_count.value).toEqual({
      kind: 'numeric',
      value: 3,
    });
    expect(byName.background_term_df.value.kind).toBe('json');
  });
});

describe('TwitterAccountTermTfExtractor', () => {
  it('emits term and n-gram TF maps from a timeline', () => {
    const posts = [
      {
        text: 'unique phrase alpha beta gamma shows up here',
        lang: 'en',
        created_at: '2025-01-01T00:00:00.000Z',
      },
      {
        text: 'unique phrase alpha beta gamma again for frequency',
        lang: 'en',
        created_at: '2025-01-02T00:00:00.000Z',
      },
    ];
    const extractor = new TwitterAccountTermTfExtractor();
    const features = extractor.extract({
      bytes: new TextEncoder().encode(JSON.stringify(posts)),
      entry: {
        hash: 'a'.repeat(64),
        source: 'https://twitter.com/alice/timeline',
        collectedAt: '2026-01-01T00:00:00.000Z',
        collectionMethod: { tool: 'apify-twitter-timeline', version: '1' },
        investigationId: 'inv',
        account: 'alice',
        mimeType: 'application/json',
        status: 'present',
      },
    });
    const byName = Object.fromEntries(features.map((f) => [f.name, f]));
    expect(byName.account_term_tf.value.kind).toBe('json');
    expect(byName.account_ngram_tf.value.kind).toBe('json');
  });
});

describe('topWeighted + BackgroundNoveltyPairExtractor', () => {
  it('prefers terms rare in the background', () => {
    const weighted = topWeighted(
      { common: 3, rareword: 3 },
      { common: 80, rareword: 1 },
      100,
      10
    );
    const entries = [...weighted.entries()];
    expect(entries[0][0]).toBe('rareword');
  });

  it('emits higher novelty overlap for accounts sharing rare phrases', () => {
    const pair = new BackgroundNoveltyPairExtractor();
    const background = featureMap({
      background_doc_count: { kind: 'numeric', value: 100 },
      background_term_df: {
        kind: 'json',
        value: { the: 90, cat: 40, rareword: 1, other: 20 },
      },
      background_ngram_df: {
        kind: 'json',
        value: { 'rareword shows up': 1, 'the cat sat': 30 },
      },
    });
    const alice = featureMap({
      account_term_tf: {
        kind: 'json',
        value: { rareword: 5, the: 3, cat: 2 },
      },
      account_ngram_tf: {
        kind: 'json',
        value: { 'rareword shows up': 3, 'the cat sat': 1 },
      },
    });
    const bob = featureMap({
      account_term_tf: {
        kind: 'json',
        value: { rareword: 4, the: 2, other: 1 },
      },
      account_ngram_tf: {
        kind: 'json',
        value: { 'rareword shows up': 2, 'something else here': 2 },
      },
    });
    const carol = featureMap({
      account_term_tf: {
        kind: 'json',
        value: { the: 8, cat: 6, other: 5 },
      },
      account_ngram_tf: {
        kind: 'json',
        value: { 'unrelated phrase stack': 4 },
      },
    });

    const ctx = pair.buildContext([
      { account: 'control', features: background, isControl: true },
      { account: 'alice', features: alice, isControl: false },
      { account: 'bob', features: bob, isControl: false },
      { account: 'carol', features: carol, isControl: false },
    ]);

    const similar = Object.fromEntries(
      pair.extract('alice', 'bob', alice, bob, ctx).map((f) => [f.name, f])
    );
    const dissimilar = Object.fromEntries(
      pair.extract('alice', 'carol', alice, carol, ctx).map((f) => [f.name, f])
    );

    expect(
      (similar.novelty_ngram_overlap_count.value as { value: number }).value
    ).toBeGreaterThan(
      (dissimilar.novelty_ngram_overlap_count?.value as { value: number } | undefined)
        ?.value ?? 0
    );
    expect(similar.shared_novelty_ngrams).toBeDefined();

    // Control pairs emit nothing
    expect(pair.extract('alice', 'control', alice, background, ctx)).toEqual([]);
  });
});

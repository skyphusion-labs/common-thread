/**
 * Unit tests for §6.2.3 pairwise JSD on sentence/punctuation/capitalization.
 */

import { describe, expect, it } from 'vitest';
import { TwitterStylometricExtractor } from '../../implementation/extractors/stylometric/twitter';
import {
  JsdSentenceLengthExtractor,
  JsdPunctuationExtractor,
  JsdCapitalizationExtractor,
} from '../../implementation/extractors/stylometric/jsd-distributions';
import {
  binSentenceLengths,
  countMajorPunctuation,
  countNonInitialCapitalization,
  SENTENCE_LENGTH_BIN_COUNT,
} from '../../implementation/extractors/stylometric/text-helpers';
import type { AccountFeatureMap } from '../../implementation/extractors/pair-types';
import type { FeatureValue } from '../../implementation/schema/db-types';

function featureMap(
  entries: Record<string, FeatureValue>
): AccountFeatureMap {
  return new Map(Object.entries(entries));
}

function timelineFromTexts(texts: string[]) {
  return texts.map((text, i) => ({
    created_at: new Date(2025, 0, i + 1).toISOString(),
    lang: 'en',
    text,
  }));
}

function extractAccount(texts: string[]) {
  const extractor = new TwitterStylometricExtractor();
  const bytes = new TextEncoder().encode(JSON.stringify(timelineFromTexts(texts)));
  const features = extractor.extract({
    bytes,
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
  return Object.fromEntries(features.map((f) => [f.name, f]));
}

describe('§6.2.3 distribution helpers', () => {
  it('bins sentence lengths into a fixed 20-bin vector', () => {
    const bins = binSentenceLengths([1, 5, 20, 25, 5]);
    expect(bins).toHaveLength(SENTENCE_LENGTH_BIN_COUNT);
    expect(bins[0]).toBe(1); // length 1
    expect(bins[4]).toBe(2); // length 5
    expect(bins[19]).toBe(2); // 20 and 25
  });

  it('counts major punctuation marks', () => {
    expect(countMajorPunctuation('Hi, there! Really?')).toEqual({
      ',': 1,
      '!': 1,
      '?': 1,
    });
  });

  it('skips sentence-initial words for capitalization counts', () => {
    // "Hello" is sentence-initial; "World" is not.
    expect(countNonInitialCapitalization('Hello World. Next Word.')).toEqual({
      lower: 0,
      capitalized: 2, // World, Word
    });
    expect(countNonInitialCapitalization('hello world again')).toEqual({
      lower: 2, // world, again
      capitalized: 0,
    });
  });
});

describe('Twitter account distributions', () => {
  it('emits sentence/punctuation/capitalization distributions', () => {
    const byName = extractAccount([
      'The quick brown fox jumps over the lazy dog.',
      'Another short line! Really?',
      'yet another post with commas, and more.',
    ]);
    expect(byName.sentence_length_distribution.value.kind).toBe('json');
    expect(
      (byName.sentence_length_distribution.value as { value: number[] }).value
    ).toHaveLength(SENTENCE_LENGTH_BIN_COUNT);
    expect(byName.punctuation_distribution.value.kind).toBe('json');
    expect(byName.capitalization_distribution.value.kind).toBe('json');
  });
});

describe('pair JSD extractors', () => {
  const sent = new JsdSentenceLengthExtractor();
  const punct = new JsdPunctuationExtractor();
  const caps = new JsdCapitalizationExtractor();

  it('returns ~0 JSD for identical distributions', () => {
    const dist = binSentenceLengths([3, 3, 3, 5, 5]);
    const punctDist = { '.': 4, ',': 2, '!': 1 };
    const capsDist = { lower: 10, capitalized: 2 };
    const a = featureMap({
      sentence_length_distribution: { kind: 'json', value: dist },
      punctuation_distribution: { kind: 'json', value: punctDist },
      capitalization_distribution: { kind: 'json', value: capsDist },
    });
    const b = featureMap({
      sentence_length_distribution: { kind: 'json', value: [...dist] },
      punctuation_distribution: { kind: 'json', value: { ...punctDist } },
      capitalization_distribution: { kind: 'json', value: { ...capsDist } },
    });

    expect(sent.extract('a', 'b', a, b)[0].value).toEqual({
      kind: 'numeric',
      value: 0,
    });
    expect(punct.extract('a', 'b', a, b)[0].value).toEqual({
      kind: 'numeric',
      value: 0,
    });
    expect(caps.extract('a', 'b', a, b)[0].value).toEqual({
      kind: 'numeric',
      value: 0,
    });
  });

  it('returns higher JSD for dissimilar than similar pairs', () => {
    const similarA = featureMap({
      sentence_length_distribution: {
        kind: 'json',
        value: binSentenceLengths([4, 5, 5, 6, 4]),
      },
      punctuation_distribution: {
        kind: 'json',
        value: { '.': 10, ',': 4, '!': 1 },
      },
      capitalization_distribution: {
        kind: 'json',
        value: { lower: 20, capitalized: 2 },
      },
    });
    const similarB = featureMap({
      sentence_length_distribution: {
        kind: 'json',
        value: binSentenceLengths([5, 5, 4, 6, 5]),
      },
      punctuation_distribution: {
        kind: 'json',
        value: { '.': 9, ',': 5, '!': 1 },
      },
      capitalization_distribution: {
        kind: 'json',
        value: { lower: 18, capitalized: 3 },
      },
    });
    const dissimilar = featureMap({
      sentence_length_distribution: {
        kind: 'json',
        value: binSentenceLengths([1, 1, 2, 20, 25, 30]),
      },
      punctuation_distribution: {
        kind: 'json',
        value: { '?': 20, '!': 15, ';': 8 },
      },
      capitalization_distribution: {
        kind: 'json',
        value: { lower: 2, capitalized: 25 },
      },
    });

    const simSent = (
      sent.extract('a', 'b', similarA, similarB)[0].value as {
        kind: 'numeric';
        value: number;
      }
    ).value;
    const disSent = (
      sent.extract('a', 'c', similarA, dissimilar)[0].value as {
        kind: 'numeric';
        value: number;
      }
    ).value;
    expect(disSent).toBeGreaterThan(simSent);

    const simPunct = (
      punct.extract('a', 'b', similarA, similarB)[0].value as {
        kind: 'numeric';
        value: number;
      }
    ).value;
    const disPunct = (
      punct.extract('a', 'c', similarA, dissimilar)[0].value as {
        kind: 'numeric';
        value: number;
      }
    ).value;
    expect(disPunct).toBeGreaterThan(simPunct);

    const simCaps = (
      caps.extract('a', 'b', similarA, similarB)[0].value as {
        kind: 'numeric';
        value: number;
      }
    ).value;
    const disCaps = (
      caps.extract('a', 'c', similarA, dissimilar)[0].value as {
        kind: 'numeric';
        value: number;
      }
    ).value;
    expect(disCaps).toBeGreaterThan(simCaps);
  });

  it('returns empty when a required distribution is missing', () => {
    const a = featureMap({
      sentence_length_distribution: {
        kind: 'json',
        value: binSentenceLengths([3, 4]),
      },
    });
    const b = featureMap({});
    expect(sent.extract('a', 'b', a, b)).toEqual([]);
    expect(punct.extract('a', 'b', a, b)).toEqual([]);
  });
});

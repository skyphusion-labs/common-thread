/**
 * Unit tests for §4.3.5 typo / error-pattern extractors.
 */

import { describe, expect, it } from 'vitest';
import { scanTypos } from '../../implementation/extractors/stylometric/typo-patterns';
import { TwitterTypoErrorExtractor } from '../../implementation/extractors/stylometric/typo-error';
import { TypoErrorPairExtractor } from '../../implementation/extractors/stylometric/typo-error-pair';
import type { AccountFeatureMap } from '../../implementation/extractors/pair-types';
import type { FeatureValue } from '../../implementation/schema/db-types';

function featureMap(entries: Record<string, FeatureValue>): AccountFeatureMap {
  return new Map(Object.entries(entries));
}

describe('scanTypos', () => {
  it('flags missing apostrophes and common misspellings', () => {
    const scan = scanTypos("I dont think teh recieve window is open");
    expect(scan.hardErrors.missing_apostrophe).toBeGreaterThan(0);
    expect(scan.hardErrors.common_misspelling).toBeGreaterThan(0);
  });

  it('tracks confusion-form fingerprints without calling them errors', () => {
    const scan = scanTypos('Their plan is there and then rather than later');
    expect(scan.confusionForms.their).toBe(1);
    expect(scan.confusionForms.there).toBe(1);
    expect(scan.confusionForms.then).toBe(1);
    expect(scan.confusionForms.than).toBe(1);
    expect(scan.hardErrors.common_misspelling).toBe(0);
  });

  it('flags repeated letters', () => {
    const scan = scanTypos('this is sooo cool and helllo');
    expect(scan.hardErrors.repeated_letter).toBeGreaterThan(0);
  });
});

describe('TwitterTypoErrorExtractor', () => {
  it('emits error rate and distributions from a controlled typo corpus', () => {
    const posts = [
      { text: 'I dont know what teh problem is', lang: 'en' },
      { text: 'Definately seperate the files tommorow', lang: 'en' },
      { text: 'Their idea is better than there idea then', lang: 'en' },
      { text: 'Clean post with no deliberate errors here', lang: 'en' },
    ].map((p, i) => ({
      ...p,
      created_at: new Date(2025, 0, i + 1).toISOString(),
    }));

    const extractor = new TwitterTypoErrorExtractor();
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

    expect(
      (byName.typo_error_rate.value as { value: number }).value
    ).toBeGreaterThan(0);
    expect(byName.typo_error_distribution.value.kind).toBe('json');
    expect(byName.confusion_form_distribution.value.kind).toBe('json');
  });
});

describe('TypoErrorPairExtractor', () => {
  it('returns higher JSD for dissimilar typo distributions', () => {
    const pair = new TypoErrorPairExtractor();
    const similarA = featureMap({
      typo_error_rate: { kind: 'numeric', value: 0.05 },
      typo_error_distribution: {
        kind: 'json',
        value: { missing_apostrophe: 4, common_misspelling: 2 },
      },
      confusion_form_distribution: {
        kind: 'json',
        value: { their: 5, there: 3, then: 2 },
      },
    });
    const similarB = featureMap({
      typo_error_rate: { kind: 'numeric', value: 0.06 },
      typo_error_distribution: {
        kind: 'json',
        value: { missing_apostrophe: 5, common_misspelling: 2 },
      },
      confusion_form_distribution: {
        kind: 'json',
        value: { their: 4, there: 4, then: 2 },
      },
    });
    const dissimilar = featureMap({
      typo_error_rate: { kind: 'numeric', value: 0.2 },
      typo_error_distribution: {
        kind: 'json',
        value: { repeated_letter: 10, qwerty_adjacent_swap: 8 },
      },
      confusion_form_distribution: {
        kind: 'json',
        value: { too: 12, two: 1, to: 1 },
      },
    });

    const simFeat = pair.extract('a', 'b', similarA, similarB);
    const disFeat = pair.extract('a', 'c', similarA, dissimilar);
    const simJsd = (
      simFeat.find((f) => f.name === 'jsd_typo_error')!.value as {
        value: number;
      }
    ).value;
    const disJsd = (
      disFeat.find((f) => f.name === 'jsd_typo_error')!.value as {
        value: number;
      }
    ).value;
    expect(disJsd).toBeGreaterThan(simJsd);
  });
});

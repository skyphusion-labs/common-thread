/**
 * Unit tests for §4.3.4 code-switching / register extractors.
 */

import { describe, expect, it } from 'vitest';
import {
  classifyRegister,
  classifyIntraPostCodeSwitch,
  registerSwitchRate,
  languageSwitchRate,
} from '../../implementation/extractors/stylometric/register-classify';
import { TwitterCodeSwitchingExtractor } from '../../implementation/extractors/stylometric/code-switching';
import {
  RegisterPatternPairExtractor,
  CodeSwitchPatternPairExtractor,
} from '../../implementation/extractors/stylometric/code-switching-pair';
import type { AccountFeatureMap } from '../../implementation/extractors/pair-types';
import type { FeatureValue } from '../../implementation/schema/db-types';

function featureMap(entries: Record<string, FeatureValue>): AccountFeatureMap {
  return new Map(Object.entries(entries));
}

function timeline(posts: Array<{ text: string; lang?: string }>) {
  return posts.map((p, i) => ({
    created_at: new Date(2025, 0, i + 1).toISOString(),
    lang: p.lang ?? 'en',
    text: p.text,
  }));
}

describe('register + code-switch classifiers', () => {
  it('labels informal vs formal samples', () => {
    expect(
      classifyRegister("lol yeah I'm gonna check that later!!! 😂")
    ).toBe('informal');
    expect(
      classifyRegister(
        'Furthermore, the committee shall therefore proceed accordingly regarding the matter.'
      )
    ).toBe('formal');
    expect(classifyRegister('The meeting is at noon tomorrow.')).toBe('neutral');
  });

  it('detects script-based intra-post code-switching', () => {
    const mixed = classifyIntraPostCodeSwitch(
      'Hello friends Привет друзья this is mixed'
    );
    expect(mixed.switched).toBe(true);
    expect(mixed.scripts).toContain('Latn');
    expect(mixed.scripts).toContain('Cyrl');
    expect(mixed.patternKey).toBe('Cyrl+Latn');
  });

  it('detects Latin bilingual stopword mix', () => {
    const mixed = classifyIntraPostCodeSwitch(
      'The cat and the dog are here pero el perro y el gato son grandes'
    );
    expect(mixed.switched).toBe(true);
    expect(mixed.languages).toContain('en');
    expect(mixed.languages).toContain('es');
  });

  it('computes switch rates on sequences', () => {
    expect(
      registerSwitchRate(['formal', 'formal', 'informal', 'informal'])
    ).toBeCloseTo(1 / 3);
    expect(languageSwitchRate(['en', 'en', 'es', 'es', null, 'fr'])).toBeCloseTo(
      1 / 3
    );
  });
});

describe('TwitterCodeSwitchingExtractor', () => {
  const extractor = new TwitterCodeSwitchingExtractor();

  it('emits register distribution and switch rates from a bilingual corpus', () => {
    const posts = timeline([
      { text: 'Furthermore, we shall therefore proceed carefully.', lang: 'en' },
      {
        text: 'lol yeah gonna skip that meeting tbh!!!',
        lang: 'en',
      },
      {
        text: 'Hello world Привет мир mixed scripts here',
        lang: 'und',
      },
      {
        text: 'The plan is ready pero el equipo necesita mas tiempo',
        lang: 'es',
      },
      {
        text: 'Neutral update about the schedule for next week.',
        lang: 'en',
      },
    ]);
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

    expect(byName.register_distribution.value.kind).toBe('json');
    const reg = (
      byName.register_distribution.value as {
        value: Record<string, number>;
      }
    ).value;
    expect(reg.formal).toBeGreaterThan(0);
    expect(reg.informal).toBeGreaterThan(0);

    expect(
      (byName.code_switch_post_rate.value as { value: number }).value
    ).toBeGreaterThan(0);
    expect(byName.code_switch_pattern_distribution).toBeDefined();
    expect(byName.register_switch_rate.value.kind).toBe('numeric');
  });
});

describe('pair extractors', () => {
  it('returns lower jsd_register for similar register distributions', () => {
    const pair = new RegisterPatternPairExtractor();
    const similarA = featureMap({
      register_distribution: {
        kind: 'json',
        value: { formal: 2, neutral: 8, informal: 10 },
      },
      register_switch_rate: { kind: 'numeric', value: 0.4 },
    });
    const similarB = featureMap({
      register_distribution: {
        kind: 'json',
        value: { formal: 3, neutral: 7, informal: 9 },
      },
      register_switch_rate: { kind: 'numeric', value: 0.35 },
    });
    const dissimilar = featureMap({
      register_distribution: {
        kind: 'json',
        value: { formal: 20, neutral: 1, informal: 0 },
      },
      register_switch_rate: { kind: 'numeric', value: 0.05 },
    });

    const sim = (
      pair.extract('a', 'b', similarA, similarB)[0].value as {
        value: number;
      }
    ).value;
    const dis = (
      pair.extract('a', 'c', similarA, dissimilar)[0].value as {
        value: number;
      }
    ).value;
    expect(dis).toBeGreaterThan(sim);
  });

  it('emits code-switch rate abs diff', () => {
    const pair = new CodeSwitchPatternPairExtractor();
    const a = featureMap({
      code_switch_post_rate: { kind: 'numeric', value: 0.5 },
      inter_post_language_switch_rate: { kind: 'numeric', value: 0.2 },
      code_switch_pattern_distribution: {
        kind: 'json',
        value: { 'Cyrl+Latn': 3, 'en+es': 2 },
      },
    });
    const b = featureMap({
      code_switch_post_rate: { kind: 'numeric', value: 0.1 },
      inter_post_language_switch_rate: { kind: 'numeric', value: 0.5 },
      code_switch_pattern_distribution: {
        kind: 'json',
        value: { 'Cyrl+Latn': 1, 'en+fr': 4 },
      },
    });
    const byName = Object.fromEntries(
      pair.extract('a', 'b', a, b).map((f) => [f.name, f])
    );
    expect(byName.code_switch_post_rate_abs_diff.value).toEqual({
      kind: 'numeric',
      value: 0.4,
    });
    expect(byName.jsd_code_switch_pattern.value.kind).toBe('numeric');
    expect(byName.inter_post_language_switch_rate_abs_diff.value).toEqual({
      kind: 'numeric',
      value: 0.3,
    });
  });
});

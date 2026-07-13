/**
 * Unit tests for Twitter stylometric account extractor (§4.3, §6.4).
 */

import { describe, expect, it } from 'vitest';
import { TwitterStylometricExtractor } from '../../implementation/extractors/stylometric/twitter';
import { FUNCTION_WORD_VECTOR_LENGTH } from '../../implementation/extractors/stylometric/function-words';

const STYLO_BODY =
  'the quick brown fox jumps over the lazy dog and the dog was very happy indeed';

function makeTimeline(postCount: number) {
  return Array.from({ length: postCount }, (_, i) => ({
    created_at: new Date(2025, 0, i + 1).toISOString(),
    lang: 'en',
    text: `${STYLO_BODY} post ${i + 1}`,
  }));
}

describe('TwitterStylometricExtractor', () => {
  const extractor = new TwitterStylometricExtractor();

  it('accepts timeline artifacts by tool and source', () => {
    expect(
      extractor.filterEntry({
        collectionMethod: { tool: 'apify-twitter-timeline', version: '1' },
        source: 'https://x.com/alice/timeline',
        hash: 'a'.repeat(64),
        collectedAt: '2026-01-01T00:00:00.000Z',
        investigationId: 'inv',
        account: 'alice',
        mimeType: 'application/json',
        status: 'present',
      })
    ).toBe(true);
  });

  it('emits core stylometric features from a timeline corpus', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(makeTimeline(12)));
    const features = extractor.extract({
      bytes,
      entry: {
        hash: 'b'.repeat(64),
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

    expect(byName.stylometric_corpus_language.value).toEqual({ kind: 'text', value: 'en' });
    expect(byName.function_word_frequencies.value.kind).toBe('json');
    expect((byName.function_word_frequencies.value as { value: number[] }).value).toHaveLength(
      FUNCTION_WORD_VECTOR_LENGTH
    );
    expect(byName.token_count.value.kind).toBe('numeric');
    expect(byName.posted_urls.value.kind).toBe('json');
    expect(byName.internal_stylometric_variance).toBeDefined();
    expect(byName.token_count_recent).toBeDefined();
    expect(byName.stylometric_recent_window_post_count.value).toEqual({
      kind: 'numeric',
      value: 4,
    });
  });

  it('filters to dominant language before stylometry', () => {
    const posts = [
      ...makeTimeline(6),
      { created_at: '2026-01-10T00:00:00.000Z', lang: 'es', text: 'hola mundo repetido muchas veces aqui' },
      { created_at: '2026-01-11T00:00:00.000Z', lang: 'es', text: 'otro tweet en espanol con suficiente texto' },
    ];
    const bytes = new TextEncoder().encode(JSON.stringify(posts));
    const features = extractor.extract({
      bytes,
      entry: {
        hash: 'c'.repeat(64),
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
    expect(byName.stylometric_corpus_language.value).toEqual({ kind: 'text', value: 'en' });
    expect(byName.stylometric_corpus_filtered_post_count.value).toEqual({
      kind: 'numeric',
      value: 6,
    });
  });

  it('returns empty for unparseable or empty timelines', () => {
    expect(
      extractor.extract({
        bytes: new TextEncoder().encode('not json'),
        entry: {
          hash: 'd'.repeat(64),
          source: 'https://twitter.com/alice/timeline',
          collectedAt: '2026-01-01T00:00:00.000Z',
          collectionMethod: { tool: 'apify-twitter-timeline', version: '1' },
          investigationId: 'inv',
          account: 'alice',
          mimeType: 'application/json',
          status: 'present',
        },
      })
    ).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { filterByDominantLanguage } from '../../implementation/extractors/stylometric/corpus-language';
import { computeInternalStylometricVariance } from '../../implementation/extractors/stylometric/internal-variance';
import {
  selectRecentThirdWindow,
  withRecentSuffix,
} from '../../implementation/extractors/stylometric/windowing';
import { tweetLanguage } from '../../implementation/ingest/apify-tweet-fields';
import { verifyEvidencePacket } from '../../packages/common-thread-verify/lib/crypto.mjs';

describe('dominant language filter (#128)', () => {
  it('filters posts to dominant language when enough tags exist', () => {
    const posts = [
      { lang: 'en', text: 'one' },
      { lang: 'en', text: 'two' },
      { lang: 'en', text: 'three' },
      { lang: 'es', text: 'cuatro' },
    ];
    const result = filterByDominantLanguage(posts, (p) => p.lang);
    expect(result.dominant_language).toBe('en');
    expect(result.filtered_count).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it('reads tweet language via shared accessor', () => {
    expect(tweetLanguage({ lang: 'EN' })).toBe('en');
    expect(tweetLanguage({ language: 'fr' })).toBe('fr');
    expect(tweetLanguage({})).toBeNull();
  });
});

describe('recent-third window (#130)', () => {
  it('selects newest third when enough posts exist', () => {
    const posts = Array.from({ length: 9 }, (_, i) => ({
      created_at: new Date(2025, 0, i + 1).toISOString(),
    }));
    const result = selectRecentThirdWindow(posts, (p) => p.created_at);
    expect(result.window).toBe('recent_third');
    expect(result.items).toHaveLength(3);
    expect(result.source_count).toBe(9);
  });

  it('appends _recent suffix once', () => {
    expect(withRecentSuffix('token_count')).toBe('token_count_recent');
    expect(withRecentSuffix('token_count_recent')).toBe('token_count_recent');
  });
});

describe('internal stylometric variance (#129)', () => {
  it('returns null for tiny corpora', () => {
    expect(computeInternalStylometricVariance(['short text'])).toBeNull();
  });

  it('flags high variance across chunks', () => {
    const stable = Array.from({ length: 40 }, () =>
      'the and of to in is that for it with as was on be at by'.repeat(3)
    );
    const mixed = [
      ...stable.slice(0, 20),
      ...Array.from({ length: 20 }, () =>
        'however therefore moreover notwithstanding consequently furthermore'.repeat(3)
      ),
    ];
    const result = computeInternalStylometricVariance(mixed);
    expect(result).not.toBeNull();
    expect(result!.chunk_count).toBeGreaterThanOrEqual(2);
  });
});

describe('npm verifier package (#103)', () => {
  it('reports unsigned packets', async () => {
    const result = await verifyEvidencePacket({ markdown: '# test' });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('UNSIGNED');
  });
});

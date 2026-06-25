import { describe, expect, it } from 'vitest';
import type { ManifestEntry } from '../../implementation/archive/types';
import { InstagramStylometricExtractor } from '../../implementation/extractors/stylometric/instagram';
import { InstagramTemporalExtractor } from '../../implementation/extractors/temporal/instagram';
import instagramPosts from '../fixtures/instagram-posts.json';

function stubEntry(account: string): ManifestEntry {
  return {
    hash: '0'.repeat(64),
    source: `https://www.instagram.com/${account}/`,
    collectedAt: '2026-06-22T01:12:46.453Z',
    collectionMethod: { tool: 'instagram-post-scraper', version: '1.0.0' },
    investigationId: 'instagram-post-validation',
    account,
    status: 'present',
  };
}

describe('instagram post scrape compatibility', () => {
  it('stylometric and temporal extractors handle Apify post rows', () => {
    const rows = instagramPosts as Array<{ ownerUsername: string }>;
    const byAuthor = new Map<string, unknown[]>();
    for (const row of rows) {
      const list = byAuthor.get(row.ownerUsername) ?? [];
      list.push(row);
      byAuthor.set(row.ownerUsername, list);
    }

    const stylometric = new InstagramStylometricExtractor();
    const temporal = new InstagramTemporalExtractor();

    for (const [author, posts] of byAuthor) {
      const bytes = new TextEncoder().encode(JSON.stringify(posts));
      const input = { bytes, entry: stubEntry(author) };

      const styFeatures = stylometric.extract(input);
      const tempFeatures = temporal.extract(input);

      expect(styFeatures.length).toBeGreaterThan(0);
      expect(tempFeatures.length).toBeGreaterThan(0);

      expect(styFeatures.find(f => f.name === 'post_count')?.value).toEqual({
        kind: 'numeric',
        value: posts.length,
      });
      expect(tempFeatures.find(f => f.name === 'post_count')?.value).toEqual({
        kind: 'numeric',
        value: posts.length,
      });
      expect(styFeatures.find(f => f.name === 'function_word_frequencies')?.value.kind).toBe(
        'json'
      );
      expect(tempFeatures.find(f => f.name === 'posting_hour_dow_distribution')?.value.kind).toBe(
        'json'
      );
    }
  });
});

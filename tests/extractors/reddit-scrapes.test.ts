import { describe, expect, it } from 'vitest';
import type { ManifestEntry } from '../../implementation/archive/types';
import { RedditStylometricExtractor } from '../../implementation/extractors/stylometric/reddit';
import { RedditTemporalExtractor } from '../../implementation/extractors/temporal/reddit';
import apifyPosts from '../fixtures/reddit-apify-posts.json';
import userActivity from '../fixtures/reddit-user-activity.json';

function stubEntry(account: string): ManifestEntry {
  return {
    hash: '0'.repeat(64),
    source: `https://www.reddit.com/user/${account}`,
    collectedAt: '2026-06-22T00:56:11.707Z',
    collectionMethod: { tool: 'reddit-posts-scraper', version: '1.0.0' },
    investigationId: 'reddit-scrape-validation',
    account,
    status: 'present',
  };
}

describe('reddit Apify scrape compatibility', () => {
  it('stylometric and temporal extractors handle Apify post rows', () => {
    const rows = apifyPosts as Array<{ author: string }>;

    const byAuthor = new Map<string, unknown[]>();
    for (const row of rows) {
      const list = byAuthor.get(row.author) ?? [];
      list.push(row);
      byAuthor.set(row.author, list);
    }

    const stylometric = new RedditStylometricExtractor();
    const temporal = new RedditTemporalExtractor();

    let stylometricHits = 0;
    let temporalHits = 0;

    for (const [author, posts] of byAuthor) {
      const bytes = new TextEncoder().encode(JSON.stringify(posts));
      const input = { bytes, entry: stubEntry(author) };

      const styFeatures = stylometric.extract(input);
      const tempFeatures = temporal.extract(input);

      if (styFeatures.length > 0) stylometricHits++;
      if (tempFeatures.length > 0) temporalHits++;

      if (posts.length > 0) {
        expect(styFeatures.length).toBeGreaterThan(0);
        expect(tempFeatures.length).toBeGreaterThan(0);

        const postCountSty = styFeatures.find(f => f.name === 'post_count');
        const postCountTemp = tempFeatures.find(f => f.name === 'post_count');
        expect(postCountSty?.value).toEqual({ kind: 'numeric', value: posts.length });
        expect(postCountTemp?.value).toEqual({ kind: 'numeric', value: posts.length });

        const subredditDist = tempFeatures.find(f => f.name === 'subreddit_distribution');
        expect(subredditDist?.value.kind).toBe('json');
      }
    }

    expect(byAuthor.size).toBeGreaterThan(5);
    expect(stylometricHits).toBe(byAuthor.size);
    expect(temporalHits).toBe(byAuthor.size);
  });

  it('stylometric and temporal extractors handle user activity scrape rows', () => {
    const rows = userActivity as Array<{ author: string; kind: string }>;
    const bytes = new TextEncoder().encode(JSON.stringify(rows));
    const input = {
      bytes,
      entry: {
        ...stubEntry('peterbouton'),
        collectionMethod: { tool: 'reddit-scraper-search-fast', version: '1.0.0' },
      },
    };

    const stylometric = new RedditStylometricExtractor();
    const temporal = new RedditTemporalExtractor();

    const styFeatures = stylometric.extract(input);
    const tempFeatures = temporal.extract(input);

    expect(styFeatures.length).toBeGreaterThan(0);
    expect(tempFeatures.length).toBeGreaterThan(0);

    expect(styFeatures.find(f => f.name === 'post_count')?.value).toEqual({
      kind: 'numeric',
      value: 4,
    });
    expect(styFeatures.find(f => f.name === 'comment_ratio')?.value).toEqual({
      kind: 'numeric',
      value: 0.5,
    });
    expect(tempFeatures.find(f => f.name === 'reply_ratio')?.value).toEqual({
      kind: 'numeric',
      value: 0.5,
    });
    expect(tempFeatures.find(f => f.name === 'subreddit_count')?.value).toEqual({
      kind: 'numeric',
      value: 2,
    });
  });
});

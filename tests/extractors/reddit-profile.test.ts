import { describe, expect, it } from 'vitest';
import type { ManifestEntry } from '../../implementation/archive/types';
import { parseRedditProfileObject } from '../../implementation/ingest/reddit-profile-fields';
import { RedditAccountMetadataExtractor } from '../../implementation/extractors/account-metadata/reddit';
import redditBasicProfile from '../fixtures/reddit-basic-profile.json';

function stubEntry(account: string): ManifestEntry {
  return {
    hash: '0'.repeat(64),
    source: `https://www.reddit.com/user/${account}/`,
    collectedAt: '2026-06-22T01:21:00.884Z',
    collectionMethod: { tool: 'Reddit-basic-profile-scraper', version: '1.0.0' },
    investigationId: 'reddit-profile-validation',
    account,
    status: 'present',
  };
}

describe('reddit basic profile scrape', () => {
  it('parses Apify basic-profile flat keys', () => {
    const profile = parseRedditProfileObject(redditBasicProfile);
    expect(profile?.name).toBe('peterbouton');
    expect(profile?.total_karma).toBe(326);
    expect(profile?.subreddit?.public_description).toBe('');
  });

  it('account metadata extractor emits karma and avatar features', () => {
    const bytes = new TextEncoder().encode(JSON.stringify(redditBasicProfile));
    const features = new RedditAccountMetadataExtractor().extract({
      bytes,
      entry: stubEntry('peterbouton'),
    });

    expect(features.length).toBeGreaterThan(0);
    expect(features.find(f => f.name === 'username')?.value).toEqual({
      kind: 'text',
      value: 'peterbouton',
    });
    expect(features.find(f => f.name === 'total_karma')?.value).toEqual({
      kind: 'numeric',
      value: 326,
    });
    expect(features.find(f => f.name === 'comment_karma_ratio')?.value).toEqual({
      kind: 'numeric',
      value: 158 / 326,
    });
    expect(features.find(f => f.name === 'default_profile_image')?.value).toEqual({
      kind: 'numeric',
      value: 1,
    });
    expect(features.find(f => f.name === 'profile_image_url')?.value.kind).toBe('text');
  });

  it('does not treat user activity artifacts as profiles', () => {
    const activityBytes = new TextEncoder().encode(
      JSON.stringify([
        {
          kind: 'comment',
          author: 'peterbouton',
          body: 'hello',
          created_utc: '2020-11-08T16:48:17.000Z',
          subreddit: 'gtaonline',
        },
      ])
    );
    const extractor = new RedditAccountMetadataExtractor();
    expect(
      extractor.filterEntry({
        ...stubEntry('peterbouton'),
        collectionMethod: { tool: 'reddit-scraper-search-fast', version: '1.0.0' },
      })
    ).toBe(false);
    expect(extractor.extract({ bytes: activityBytes, entry: stubEntry('peterbouton') })).toEqual(
      []
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  detectItemPlatform,
  dominantProvider,
  splitApifyPayload,
} from '../../implementation/ingest/platform-detect';
import { extractInstagramHandles, extractInstagramPosts } from '../../implementation/ingest/instagram-parser';
import {
  extractRedditChildren,
  extractRedditHandles,
} from '../../implementation/ingest/reddit-parser';

describe('detectItemPlatform', () => {
  it('classifies official Apify Instagram posts', () => {
    expect(
      detectItemPlatform({
        caption: 'hello #tag',
        ownerUsername: 'brandiprant',
        timestamp: '2025-03-01T14:00:00.000Z',
        url: 'https://www.instagram.com/p/abc123/',
      })
    ).toBe('instagram');
  });

  it('classifies trudax Reddit scraper rows', () => {
    expect(
      detectItemPlatform({
        username: 'ava_loomis',
        title: 'A post',
        body: 'self text',
        createdAt: '2025-03-01T14:00:00.000Z',
        dataType: 'post',
        communityName: 'r/news',
      })
    ).toBe('reddit');
  });

  it('classifies Apify Twitter rows by host, not by createdAt', () => {
    expect(
      detectItemPlatform({
        text: 'a tweet',
        userName: 'ava_loomis',
        createdAt: '2025-03-01T14:00:00.000Z',
        twitterUrl: 'https://x.com/ava_loomis/status/1',
      })
    ).toBe('twitter');
  });
});

describe('splitApifyPayload', () => {
  it('splits a mixed upload', () => {
    const split = splitApifyPayload([
      {
        caption: 'ig',
        ownerUsername: 'brandiprant',
        timestamp: '2025-03-01T14:00:00.000Z',
        url: 'https://www.instagram.com/p/abc/',
      },
      {
        username: 'ava_loomis',
        title: 'reddit',
        createdAt: '2025-03-01T14:00:00.000Z',
        dataType: 'post',
        communityName: 'r/osint',
      },
    ]);
    expect(split.instagram).toHaveLength(1);
    expect(split.reddit).toHaveLength(1);
    expect(split.twitter).toHaveLength(0);
    expect(dominantProvider(split)).toBe('mixed');
  });
});

describe('instagram parser', () => {
  it('flattens latestPosts from a profile row', () => {
    const posts = extractInstagramPosts([
      {
        username: 'brandiprant',
        biography: 'bio',
        latestPosts: [
          {
            caption: 'one',
            ownerUsername: 'brandiprant',
            timestamp: '2025-03-01T14:00:00.000Z',
          },
          {
            caption: 'two',
            ownerUsername: 'brandiprant',
            timestamp: '2025-03-02T14:00:00.000Z',
          },
        ],
      },
    ]);
    expect(posts).toHaveLength(2);
    expect(extractInstagramHandles(posts)).toEqual(['brandiprant']);
  });
});

describe('reddit parser', () => {
  it('normalizes Apify createdAt into created_utc seconds', () => {
    const children = extractRedditChildren([
      {
        username: 'Ava_Loomis',
        title: 'Hello',
        body: 'world',
        createdAt: '2025-03-01T14:00:00.000Z',
        dataType: 'post',
        communityName: 'r/news',
      },
    ]);
    expect(children).toHaveLength(1);
    expect(children[0].kind).toBe('t3');
    expect(children[0].data.author).toBe('ava_loomis');
    expect(children[0].data.created_utc).toBe(Date.parse('2025-03-01T14:00:00.000Z') / 1000);
    expect(children[0].data.subreddit).toBe('news');
    expect(extractRedditHandles(children)).toEqual(['ava_loomis']);
  });
});

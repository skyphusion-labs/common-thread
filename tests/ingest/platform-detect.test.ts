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

  it('does not treat text+author on a foreign host as Twitter', () => {
    expect(
      detectItemPlatform({
        text: 'a facebook post',
        user: { name: 'Someone' },
        url: 'https://www.facebook.com/someone/posts/123',
      })
    ).toBe('facebook');
    expect(
      detectItemPlatform({
        text: 'a bluesky post',
        author: { handle: 'someone.bsky.social' },
        createdAt: '2026-01-01T12:00:00.000Z',
        url: 'https://bsky.app/profile/someone.bsky.social/post/abc',
      })
    ).toBe('bluesky');
    expect(
      detectItemPlatform({
        text: 'a tiktok with author',
        author: { name: 'someone' },
        webVideoUrl: 'https://www.tiktok.com/@someone/video/1',
      })
    ).toBe('tiktok');
  });

  it('classifies newpo Mastodon rows by acct and mastodon.social', () => {
    expect(
      detectItemPlatform({
        text: 'a toot',
        createdAt: '2026-01-01T12:00:00.000Z',
        author: { acct: 'ava@mastodon.social', username: 'ava' },
        instance: 'mastodon.social',
        url: 'https://mastodon.social/@ava/1',
      })
    ).toBe('mastodon');
  });

  it('does not treat a foreign-instance URL alone as Mastodon', () => {
    expect(
      detectItemPlatform({
        text: 'a toot on another instance',
        user: { name: 'someone' },
        url: 'https://fosstodon.org/@someone/123',
      })
    ).toBe('unknown');
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

  it('splits a mixed Twitter + Bluesky upload', () => {
    const split = splitApifyPayload([
      {
        text: 'a tweet',
        userName: 'ava_loomis',
        twitterUrl: 'https://x.com/ava_loomis/status/1',
      },
      {
        text: 'hello from atproto',
        authorHandle: 'ava.bsky.social',
        createdAt: '2026-01-01T12:00:00.000Z',
        uri: 'at://did:plc:ava/app.bsky.feed.post/1',
        url: 'https://bsky.app/profile/ava.bsky.social/post/1',
      },
    ]);
    expect(split.twitter).toHaveLength(1);
    expect(split.bluesky).toHaveLength(1);
    expect(dominantProvider(split)).toBe('mixed');
  });

  it('splits a mixed Twitter + Mastodon upload', () => {
    const split = splitApifyPayload([
      {
        text: 'a tweet',
        userName: 'ava_loomis',
        twitterUrl: 'https://x.com/ava_loomis/status/1',
      },
      {
        text: 'hello from the fediverse',
        createdAt: '2026-01-01T12:00:00.000Z',
        author: { acct: 'ava@mastodon.social', username: 'ava' },
        instance: 'mastodon.social',
        url: 'https://mastodon.social/@ava/1',
      },
    ]);
    expect(split.twitter).toHaveLength(1);
    expect(split.mastodon).toHaveLength(1);
    expect(dominantProvider(split)).toBe('mixed');
  });

  it('splits a mixed Twitter + TikTok upload', () => {
    const split = splitApifyPayload([
      {
        text: 'a tweet',
        userName: 'ava_loomis',
        twitterUrl: 'https://x.com/ava_loomis/status/1',
      },
      {
        text: 'a caption',
        createTimeISO: '2026-01-01T12:00:00.000Z',
        authorMeta: { name: 'ava' },
        webVideoUrl: 'https://www.tiktok.com/@ava/video/1',
      },
    ]);
    expect(split.twitter).toHaveLength(1);
    expect(split.tiktok).toHaveLength(1);
    expect(dominantProvider(split)).toBe('mixed');
  });

  it('splits a mixed Twitter + YouTube upload', () => {
    const split = splitApifyPayload([
      {
        text: 'a tweet',
        userName: 'ava_loomis',
        twitterUrl: 'https://x.com/ava_loomis/status/1',
      },
      {
        title: 'a video',
        text: 'a description',
        channelUsername: 'ava',
        url: 'https://www.youtube.com/watch?v=1',
        date: '2026-01-01T12:00:00.000Z',
      },
    ]);
    expect(split.twitter).toHaveLength(1);
    expect(split.youtube).toHaveLength(1);
    expect(dominantProvider(split)).toBe('mixed');
  });

  it('splits a mixed Twitter + Facebook upload', () => {
    const split = splitApifyPayload([
      {
        text: 'a tweet',
        userName: 'ava_loomis',
        twitterUrl: 'https://x.com/ava_loomis/status/1',
      },
      {
        text: 'a page post',
        time: '2026-01-01T12:00:00.000Z',
        user: { name: 'Ava' },
        url: 'https://www.facebook.com/ava/posts/1',
      },
    ]);
    expect(split.twitter).toHaveLength(1);
    expect(split.facebook).toHaveLength(1);
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

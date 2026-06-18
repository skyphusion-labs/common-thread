import { describe, expect, it } from 'vitest';
import {
  extractEngagementsFromPosts,
  parsePosts,
} from '../../implementation/extractors/network/engagement-parse';

describe('engagement-parse', () => {
  it('parses a single Apify-style tweet object', () => {
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        id: '111',
        createdAt: '2024-06-01T12:00:00.000Z',
        text: 'hello',
        author: { userName: 'alice' },
      })
    );
    const posts = parsePosts(bytes);
    expect(posts).toHaveLength(1);
  });

  it('extracts reply engagement on third-party content', () => {
    const events = extractEngagementsFromPosts('alice', [
      {
        id: '111',
        createdAt: '2024-06-01T12:00:00.000Z',
        inReplyToId: '999',
        inReplyToUsername: 'news_outlet',
        text: 'agree',
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('reply');
    expect(events[0].eventData).toMatchObject({
      target_post_id: '999',
      target_author: 'news_outlet',
      engagement_kind: 'reply',
    });
  });

  it('extracts repost from embedded retweetedTweet', () => {
    const events = extractEngagementsFromPosts('bob', [
      {
        id: '222',
        createdAt: '2024-06-01T12:05:00.000Z',
        retweetedTweet: {
          id: '888',
          author: { userName: 'news_outlet' },
        },
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('repost');
  });

  it('skips self-replies', () => {
    const events = extractEngagementsFromPosts('alice', [
      {
        id: '111',
        createdAt: '2024-06-01T12:00:00.000Z',
        inReplyToId: '999',
        inReplyToUsername: 'alice',
        text: 'thread',
      },
    ]);
    expect(events).toHaveLength(0);
  });

  it('extracts repost from Apify retweet field', () => {
    const events = extractEngagementsFromPosts('bob', [
      {
        id: '222',
        createdAt: '2024-06-01T12:05:00.000Z',
        isRetweet: true,
        retweet: {
          id: '888',
          author: { userName: 'news_outlet' },
        },
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe('repost');
    expect(events[0].eventData.target_post_id).toBe('888');
  });

  it('resolves repost target id from status URL in media when RT prefix only', () => {
    const events = extractEngagementsFromPosts('bob', [
      {
        id: '222',
        createdAt: '2024-06-01T12:05:00.000Z',
        text: 'RT @news_outlet: headline',
        extendedEntities: {
          media: [
            {
              expanded_url:
                'https://x.com/news_outlet/status/2034029511981809861/photo/1',
            },
          ],
        },
      },
    ]);
    expect(events).toHaveLength(1);
    expect(events[0].eventData).toMatchObject({
      target_post_id: '2034029511981809861',
      target_author: 'news_outlet',
    });
  });

  it('uses fullText when text is absent', () => {
    const events = extractEngagementsFromPosts('alice', [
      {
        id: '111',
        createdAt: '2024-06-01T12:00:00.000Z',
        fullText: 'RT @news_outlet: shared',
        isRetweet: true,
        retweet: {
          id: '42',
          author: { userName: 'news_outlet' },
        },
      },
    ]);
    expect(events).toHaveLength(1);
  });
});

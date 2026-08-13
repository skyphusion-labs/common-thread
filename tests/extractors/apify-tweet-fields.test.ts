import { describe, expect, it } from 'vitest';
import {
  authorFromStatusUrl,
  authorHandleFromTweet,
  embeddedRetweet,
  isApifyNoResultsItem,
  isApifyTweetLike,
  tweetText,
} from '../../implementation/ingest/apify-tweet-fields';
import { detectItemPlatform } from '../../implementation/ingest/platform-detect';

describe('apify-tweet-fields', () => {
  it('reads fullText and skips noResults rows', () => {
    expect(tweetText({ fullText: 'hello', text: 'ignored' })).toBe('hello');
    expect(isApifyNoResultsItem({ noResults: true })).toBe(true);
  });

  it('resolves author from status URL when author object is missing', () => {
    const handle = authorHandleFromTweet({
      url: 'https://x.com/EvilRabbitSec/status/2055573079867228475',
      text: '@someone hi',
      isReply: true,
    });
    expect(handle).toBe('evilrabbitsec');
    expect(authorFromStatusUrl('https://twitter.com/foo/status/1')).toBe('foo');
  });

  it('finds embedded retweet under Apify retweet key', () => {
    const embedded = embeddedRetweet({
      isRetweet: true,
      retweet: { id: '99', author: { userName: 'target' } },
    });
    expect(embedded).toMatchObject({ id: '99' });
  });

  it('accepts URL-less Apify tweets that detect will not classify as Twitter', () => {
    const tweet = {
      id: '111',
      createdAt: '2024-06-01T12:00:00.000Z',
      text: 'hello',
      author: { userName: 'alice' },
    };
    expect(detectItemPlatform(tweet)).toBe('unknown');
    expect(isApifyTweetLike(tweet)).toBe(true);
  });

  it('rejects foreign-host rows even when they carry tweet-shaped text', () => {
    expect(
      isApifyTweetLike({
        text: 'a facebook post',
        user: { name: 'Someone' },
        url: 'https://www.facebook.com/someone/posts/123',
      })
    ).toBe(false);
    expect(
      isApifyTweetLike({
        text: 'hello from atproto',
        uri: 'at://did:plc:ava/app.bsky.feed.post/1',
        url: 'https://bsky.app/profile/ava.bsky.social/post/1',
      })
    ).toBe(false);
  });
});

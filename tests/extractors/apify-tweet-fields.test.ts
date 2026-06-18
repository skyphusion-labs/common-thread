import { describe, expect, it } from 'vitest';
import {
  authorFromStatusUrl,
  authorHandleFromTweet,
  embeddedRetweet,
  isApifyNoResultsItem,
  tweetText,
} from '../../implementation/ingest/apify-tweet-fields';

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
});

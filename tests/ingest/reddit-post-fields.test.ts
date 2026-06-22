import { describe, expect, it } from 'vitest';
import {
  isRedditPostLike,
  redditCreatedAtRaw,
  redditPostText,
  redditSubredditName,
  isRedditCommentPost,
} from '../../implementation/ingest/reddit-post-fields';
import { parseRedditListingData } from '../../implementation/ingest/reddit-listing-parser';
import apifyPosts from '../fixtures/reddit-apify-posts.json';
import userActivity from '../fixtures/reddit-user-activity.json';

describe('reddit-post-fields', () => {
  it('recognizes Apify scraper rows', () => {
    const row = {
      title: 'OCaml 5.5.0 released',
      author: 'Personal_Rough6944',
      subreddit: 'programming',
      createdAt: '2026-06-21T10:57:13.000Z',
      isSelf: false,
      url: 'https://discuss.ocaml.org/t/ocaml-5-5-0-released/18265',
    };
    expect(isRedditPostLike(row)).toBe(true);
    expect(redditPostText(row)).toBe('OCaml 5.5.0 released');
    expect(redditCreatedAtRaw(row)).toBe('2026-06-21T10:57:13.000Z');
    expect(redditSubredditName(row)).toBe('programming');
    expect(isRedditCommentPost(row)).toBe(false);
  });

  it('recognizes native API comment and submission shapes', () => {
    const submission = {
      kind: 't3',
      data: {
        title: 'Hello',
        selftext: 'World',
        created_utc: 1_700_000_000,
        subreddit_name_prefixed: 'r/news',
      },
    };
    const comment = {
      kind: 't1',
      data: {
        body: 'Nice post',
        created_utc: 1_700_000_100,
        subreddit: 'news',
        parent_id: 't3_abc',
      },
    };

    const parsed = parseRedditListingData([submission, comment]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].text).toBe('Hello World');
    expect(parsed[0].isComment).toBe(false);
    expect(parsed[0].subreddit).toBe('news');
    expect(parsed[1].text).toBe('Nice post');
    expect(parsed[1].isComment).toBe(true);
  });

  it('parses the subreddit listing Apify scrape sample', () => {
    const parsed = parseRedditListingData(apifyPosts);
    expect(parsed.length).toBe(10);
    expect(parsed.every(p => p.text.length > 0)).toBe(true);
    expect(parsed.every(p => typeof p.createdAt === 'string')).toBe(true);
    expect(parsed.every(p => p.subreddit === 'programming')).toBe(true);
    expect(parsed.every(p => p.isComment === false)).toBe(true);
  });

  it('parses reddit-scraper-search-fast user activity rows', () => {
    const parsed = parseRedditListingData(userActivity);
    expect(parsed.length).toBe(4);
    expect(parsed.filter(p => p.isComment).length).toBe(2);
    expect(parsed.filter(p => !p.isComment).length).toBe(2);
    expect(parsed[0].text).toContain('Humane Raid');
    expect(parsed[0].text).toContain('Looking for 3 players');
    expect(parsed[1].text).toBe('R* fixed that');
    expect(parsed.every(p => typeof p.createdAt === 'string')).toBe(true);
  });
});

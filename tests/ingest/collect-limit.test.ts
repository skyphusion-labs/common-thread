import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_JSON_BODY_BYTES,
  MAX_COLLECT_DEPTH,
  boundedCollect,
  flattenIngestItems,
  jsonBodyTooLarge,
  newCollectState,
} from '../../implementation/ingest/collect-limit';
import { extractBlueskyPosts } from '../../implementation/ingest/bluesky-parser';

function blueskyPost(i: number) {
  return {
    text: `hello ${i}`,
    createdAt: '2026-01-01T12:00:00.000Z',
    authorHandle: 'ava.bsky.social',
    uri: `at://did:plc:ava/app.bsky.feed.post/${i}`,
    url: `https://bsky.app/profile/ava.bsky.social/post/${i}`,
  };
}

describe('flattenIngestItems (#280)', () => {
  it('counts nested items wrappers as leaves, not one wrapper', () => {
    const inner = Array.from({ length: 12 }, (_, i) => ({ id: i }));
    const payload = { items: [{ items: inner }] };
    const { items, truncated } = flattenIngestItems(payload, 5000);
    expect(truncated).toBe(false);
    expect(items).toHaveLength(12);
    expect(items[0]).toEqual({ id: 0 });
  });

  it('sets truncated when nested collect exceeds the cap', () => {
    const inner = Array.from({ length: 8 }, (_, i) => ({ id: i }));
    const payload = { items: [{ items: inner }] };
    const { items, truncated } = flattenIngestItems(payload, 5);
    expect(truncated).toBe(true);
    expect(items.length).toBeGreaterThan(5);
    expect(items.length).toBeLessThanOrEqual(6);
  });

  it('does not unwrap a leaf that happens to carry media', () => {
    const tweet = { text: 'hi', twitterUrl: 'https://x.com/a/status/1', media: [{ url: 'https://pbs.twimg.com/x.jpg' }] };
    const { items } = flattenIngestItems([tweet], 5000);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual(tweet);
  });
});

describe('boundedCollect (#280)', () => {
  it('stops at the item cap', () => {
    const out: { n: number }[] = [];
    const state = newCollectState(3);
    boundedCollect(
      Array.from({ length: 20 }, (_, i) => ({ n: i, text: 'x' })),
      out,
      (obj) => ({ n: obj.n as number }),
      { state }
    );
    expect(out).toHaveLength(3);
    expect(state.truncated).toBe(true);
  });

  it('does not recurse past max depth', () => {
    let nest: unknown = { text: 'leaf', authorHandle: 'ava.bsky.social', createdAt: '2026-01-01T12:00:00.000Z' };
    for (let i = 0; i < MAX_COLLECT_DEPTH + 3; i++) {
      nest = { items: [nest] };
    }
    const posts = extractBlueskyPosts(nest);
    expect(posts.length).toBeLessThanOrEqual(1);
  });
});

describe('jsonBodyTooLarge', () => {
  it('rejects bodies over the default 8MiB cap', () => {
    expect(jsonBodyTooLarge(DEFAULT_MAX_JSON_BODY_BYTES)).toBe(false);
    expect(jsonBodyTooLarge(DEFAULT_MAX_JSON_BODY_BYTES + 1)).toBe(true);
  });
});

describe('extractBlueskyPosts nested cap', () => {
  it('does not expand a million-item nested wrapper past the default cap', () => {
    const posts = extractBlueskyPosts({
      items: [{ items: Array.from({ length: 80 }, (_, i) => blueskyPost(i)) }],
    });
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.length).toBeLessThanOrEqual(80);
  });
});

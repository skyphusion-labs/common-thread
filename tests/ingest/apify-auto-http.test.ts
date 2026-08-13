/**
 * HTTP contract for POST /ingest/apify: auto-detect plus unsupported-platform reject.
 * Drives worker.fetch (the shipped Worker entry), not the parsers in isolation.
 */
import { describe, expect, it } from 'vitest';
import { env } from '../helpers/test-env';
import worker from '../../implementation/workers/index';
import { createInvestigation } from '../helpers/db';
import { testDb } from '../helpers/test-env';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

describe('POST /ingest/apify', () => {
  it('returns 400 unsupported_export for a TikTok-shaped payload', async () => {
    const created = await createInvestigation(testDb(), { id: uid('apify-auto-tiktok') });
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/ingest/apify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify([
          {
            id: '7483920192837461',
            webVideoUrl: 'https://www.tiktok.com/@someuser/video/7483920192837461',
            text: 'a tiktok caption',
            authorMeta: { name: 'someuser' },
          },
        ]),
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unsupported_export');
  });

  it('returns 400 unsupported_export for a typical Facebook row (text + user + facebook.com)', async () => {
    const created = await createInvestigation(testDb(), { id: uid('apify-auto-fb') });
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/ingest/apify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify([
          {
            text: 'public page update',
            user: { id: '1000444', name: 'Example Page' },
            url: 'https://www.facebook.com/examplepage/posts/pfbid0abc',
            time: '2025-03-01T14:00:00.000Z',
          },
        ]),
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unsupported_export');
  });

  it('returns 400 unsupported_export for a typical Bluesky row (text + author + bsky.app)', async () => {
    const created = await createInvestigation(testDb(), { id: uid('apify-auto-bsky') });
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/ingest/apify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify([
          {
            text: 'hello from atproto',
            author: { did: 'did:plc:abc', handle: 'example.bsky.social' },
            url: 'https://bsky.app/profile/example.bsky.social/post/3kxyz',
            uri: 'at://did:plc:abc/app.bsky.feed.post/3kxyz',
            createdAt: '2025-03-01T14:00:00.000Z',
          },
        ]),
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe('unsupported_export');
  });
});

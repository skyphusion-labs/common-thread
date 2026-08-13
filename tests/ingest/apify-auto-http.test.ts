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

describe('POST /ingest/apify', { timeout: 30_000 }, () => {
  it('returns 400 unsupported_export for a YouTube-shaped payload', async () => {
    const created = await createInvestigation(testDb(), { id: uid('apify-auto-yt') });
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/ingest/apify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify([
          {
            title: 'a video',
            text: 'a description',
            channelUsername: 'somechannel',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            date: '2026-01-01',
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

  it('ingests a Bluesky Apify fixture and emits stylometric_bluesky features', async () => {
    const created = await createInvestigation(testDb(), { id: uid('apify-auto-bsky') });
    const fixture = (await import('../fixtures/bluesky-posts.json')).default;
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/ingest/apify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify(fixture),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { uniqueAccounts: number; tweetsProcessed: number };
    expect(body.uniqueAccounts).toBe(2);
    expect(body.tweetsProcessed).toBeGreaterThan(0);

    const row = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'stylometric_bluesky'`
      )
      .bind(created.id)
      .first<{ n: number }>();
    expect(Number(row?.n ?? 0)).toBeGreaterThan(0);

    const temporal = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'temporal_bluesky'`
      )
      .bind(created.id)
      .first<{ n: number }>();
    expect(Number(temporal?.n ?? 0)).toBeGreaterThan(0);

    const seed = await testDb()
      .prepare(
        `SELECT platform FROM seed_accounts WHERE investigation_id = ? LIMIT 1`
      )
      .bind(created.id)
      .first<{ platform: string }>();
    expect(seed?.platform).toBe('bluesky');
  });

  it('splits a mixed Twitter + Bluesky upload on POST /ingest/apify', async () => {
    const created = await createInvestigation(testDb(), { id: uid('apify-mixed-bsky') });
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/ingest/apify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify([
          {
            id_str: '1001',
            full_text: 'This beacon reroutes every waypoint before dawn.',
            created_at: '2026-01-01T23:16:00.000Z',
            url: 'https://x.com/finchlowe_synth/status/1001',
            user: { screen_name: 'finchlowe_synth' },
          },
          {
            text: 'The atlas annotates these coordinates as promised.',
            createdAt: '2026-01-02T12:00:00.000Z',
            authorHandle: 'finchlowe.bsky.social',
            uri: 'at://did:plc:finch/app.bsky.feed.post/1',
            url: 'https://bsky.app/profile/finchlowe.bsky.social/post/1',
          },
        ]),
      }),
      env
    );
    expect(res.status).toBe(200);
    const platforms = await testDb()
      .prepare(
        `SELECT DISTINCT platform FROM seed_accounts WHERE investigation_id = ? ORDER BY platform`
      )
      .bind(created.id)
      .all<{ platform: string }>();
    const names = (platforms.results ?? []).map((r) => r.platform);
    expect(names).toContain('bluesky');
    expect(names).toContain('twitter');
  });

  it('ingests a Mastodon Apify fixture and emits stylometric_mastodon features', async () => {
    const created = await createInvestigation(testDb(), { id: uid('apify-auto-masto') });
    const fixture = (await import('../fixtures/mastodon-posts.json')).default;
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/ingest/apify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify(fixture),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { uniqueAccounts: number; tweetsProcessed: number };
    expect(body.uniqueAccounts).toBe(2);
    expect(body.tweetsProcessed).toBeGreaterThan(0);

    const row = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'stylometric_mastodon'`
      )
      .bind(created.id)
      .first<{ n: number }>();
    expect(Number(row?.n ?? 0)).toBeGreaterThan(0);

    const temporal = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'temporal_mastodon'`
      )
      .bind(created.id)
      .first<{ n: number }>();
    expect(Number(temporal?.n ?? 0)).toBeGreaterThan(0);

    const seed = await testDb()
      .prepare(
        `SELECT platform FROM seed_accounts WHERE investigation_id = ? LIMIT 1`
      )
      .bind(created.id)
      .first<{ platform: string }>();
    expect(seed?.platform).toBe('mastodon');
  });

  it('splits a mixed Twitter + Mastodon upload on POST /ingest/apify', async () => {
    const created = await createInvestigation(testDb(), { id: uid('apify-mixed-masto') });
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/ingest/apify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify([
          {
            id_str: '1001',
            full_text: 'This beacon reroutes every waypoint before dawn.',
            created_at: '2026-01-01T23:16:00.000Z',
            url: 'https://x.com/finchlowe_synth/status/1001',
            user: { screen_name: 'finchlowe_synth' },
          },
          {
            text: 'The atlas annotates these coordinates as promised.',
            createdAt: '2026-01-02T12:00:00.000Z',
            author: { acct: 'finchlowe@mastodon.social', username: 'finchlowe' },
            instance: 'mastodon.social',
            url: 'https://mastodon.social/@finchlowe/111',
            uri: 'https://mastodon.social/users/finchlowe/statuses/111',
          },
        ]),
      }),
      env
    );
    expect(res.status).toBe(200);
    const platforms = await testDb()
      .prepare(
        `SELECT DISTINCT platform FROM seed_accounts WHERE investigation_id = ? ORDER BY platform`
      )
      .bind(created.id)
      .all<{ platform: string }>();
    const names = (platforms.results ?? []).map((r) => r.platform);
    expect(names).toContain('mastodon');
    expect(names).toContain('twitter');
  });

  it('ingests a TikTok Apify fixture and emits stylometric_tiktok features', async () => {
    const created = await createInvestigation(testDb(), { id: uid('apify-auto-tiktok') });
    const fixture = (await import('../fixtures/tiktok-posts.json')).default;
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/ingest/apify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify(fixture),
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { uniqueAccounts: number; tweetsProcessed: number };
    expect(body.uniqueAccounts).toBe(2);
    expect(body.tweetsProcessed).toBeGreaterThan(0);

    const row = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'stylometric_tiktok'`
      )
      .bind(created.id)
      .first<{ n: number }>();
    expect(Number(row?.n ?? 0)).toBeGreaterThan(0);

    const temporal = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'temporal_tiktok'`
      )
      .bind(created.id)
      .first<{ n: number }>();
    expect(Number(temporal?.n ?? 0)).toBeGreaterThan(0);

    const seed = await testDb()
      .prepare(
        `SELECT platform FROM seed_accounts WHERE investigation_id = ? LIMIT 1`
      )
      .bind(created.id)
      .first<{ platform: string }>();
    expect(seed?.platform).toBe('tiktok');
  });

  it('splits a mixed Twitter + TikTok upload on POST /ingest/apify', async () => {
    const created = await createInvestigation(testDb(), { id: uid('apify-mixed-tiktok') });
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/ingest/apify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify([
          {
            id_str: '1001',
            full_text: 'This beacon reroutes every waypoint before dawn.',
            created_at: '2026-01-01T23:16:00.000Z',
            url: 'https://x.com/finchlowe_synth/status/1001',
            user: { screen_name: 'finchlowe_synth' },
          },
          {
            text: 'The atlas annotates these coordinates as promised.',
            createTimeISO: '2026-01-02T12:00:00.000Z',
            authorMeta: { name: 'finchlowe' },
            webVideoUrl: 'https://www.tiktok.com/@finchlowe/video/1',
          },
        ]),
      }),
      env
    );
    expect(res.status).toBe(200);
    const platforms = await testDb()
      .prepare(
        `SELECT DISTINCT platform FROM seed_accounts WHERE investigation_id = ? ORDER BY platform`
      )
      .bind(created.id)
      .all<{ platform: string }>();
    const names = (platforms.results ?? []).map((r) => r.platform);
    expect(names).toContain('tiktok');
    expect(names).toContain('twitter');
  });
});

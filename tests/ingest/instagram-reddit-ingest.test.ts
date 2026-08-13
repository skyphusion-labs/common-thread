import { describe, expect, it } from 'vitest';
import { env } from '../helpers/test-env';
import { createInvestigation } from '../helpers/db';
import { testDb } from '../helpers/test-env';
import { runInstagramIngestPipeline } from '../../implementation/ingest/instagram-pipeline';
import { runRedditIngestPipeline } from '../../implementation/ingest/reddit-pipeline';
import { ArchiveStore } from '../../implementation/archive/store';
import instagramFixture from '../fixtures/instagram-posts.json';

describe('instagram ingest pipeline', () => {
  it('archives listings, registers seeds, and emits stylometric features', async () => {
    const investigationId = `ig-ingest-${crypto.randomUUID()}`;
    await createInvestigation(testDb(), { id: investigationId });
    const archive = new ArchiveStore({ bucket: env.ARCHIVE });
    const raw = new TextEncoder().encode(JSON.stringify(instagramFixture));
    const { hash } = await archive.put(raw, { mimeType: 'application/json', extension: 'json' });

    const result = await runInstagramIngestPipeline(
      { db: testDb(), archive: env.ARCHIVE },
      {
        investigationId,
        payload: instagramFixture,
        rawHash: hash,
        jobId: `job_${crypto.randomUUID()}`,
      }
    );

    expect(result.uniqueAccounts).toBe(2);
    expect(result.tweetsProcessed).toBe(4);
    expect(result.artifactsCreated).toBeGreaterThan(0);
    expect(result.extractorsRan).toBe(true);
    const feature = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'stylometric_instagram'`
      )
      .bind(investigationId)
      .first<{ n: number }>();
    expect(Number(feature?.n ?? 0)).toBeGreaterThan(0);
  });
});

describe('reddit ingest pipeline', () => {
  it('normalizes Apify rows and emits temporal features', async () => {
    const investigationId = `reddit-ingest-${crypto.randomUUID()}`;
    await createInvestigation(testDb(), { id: investigationId });
    const payload = [
      {
        username: 'ava_loomis',
        title: 'First post about weather and trains',
        body: 'The timetable slipped again this morning.',
        createdAt: '2025-03-01T14:00:00.000Z',
        dataType: 'post',
        communityName: 'r/news',
      },
      {
        username: 'ava_loomis',
        body: 'Agreed, the delay pattern is consistent.',
        createdAt: '2025-03-01T15:00:00.000Z',
        dataType: 'comment',
        communityName: 'r/news',
      },
      {
        username: 'brixby',
        title: 'Unrelated gardening note',
        body: 'Tomatoes want more sun than this balcony offers.',
        createdAt: '2025-03-02T10:00:00.000Z',
        dataType: 'post',
        communityName: 'r/gardening',
      },
    ];
    const archive = new ArchiveStore({ bucket: env.ARCHIVE });
    const raw = new TextEncoder().encode(JSON.stringify(payload));
    const { hash } = await archive.put(raw, { mimeType: 'application/json', extension: 'json' });

    const result = await runRedditIngestPipeline(
      { db: testDb(), archive: env.ARCHIVE },
      {
        investigationId,
        payload,
        rawHash: hash,
        jobId: `job_${crypto.randomUUID()}`,
      }
    );

    expect(result.uniqueAccounts).toBe(2);
    expect(result.tweetsProcessed).toBe(3);
    const feature = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'temporal_reddit'`
      )
      .bind(investigationId)
      .first<{ n: number }>();
    expect(Number(feature?.n ?? 0)).toBeGreaterThan(0);
  });
});

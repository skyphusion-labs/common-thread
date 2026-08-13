import { describe, expect, it } from 'vitest';
import { env } from '../helpers/test-env';
import { createInvestigation } from '../helpers/db';
import { testDb } from '../helpers/test-env';
import { extractYouTubePosts } from '../../implementation/ingest/youtube-parser';
import { runYouTubeIngestPipeline } from '../../implementation/ingest/youtube-pipeline';
import { ArchiveStore } from '../../implementation/archive/store';
import youtubeFixture from '../fixtures/youtube-posts.json';

describe('youtube ingest pipeline', { timeout: 20_000 }, () => {
  it('treats titles, descriptions, and comments as authored text', () => {
    const posts = extractYouTubePosts(youtubeFixture);
    expect(posts.some((p) => p.kind === 'video' && p.text.includes('Atlas'))).toBe(true);
    expect(posts.some((p) => p.kind === 'video' && p.text.includes('coordinates remain'))).toBe(true);
    expect(posts.some((p) => p.kind === 'comment' && p.text.includes('Beacon light'))).toBe(true);
  });

  it('archives listings, registers seeds, and emits stylometric features', async () => {
    const investigationId = `yt-ingest-${crypto.randomUUID()}`;
    await createInvestigation(testDb(), { id: investigationId });
    const archive = new ArchiveStore({ bucket: env.ARCHIVE });
    const raw = new TextEncoder().encode(JSON.stringify(youtubeFixture));
    const { hash } = await archive.put(raw, { mimeType: 'application/json', extension: 'json' });

    const result = await runYouTubeIngestPipeline(
      { db: testDb(), archive: env.ARCHIVE },
      {
        investigationId,
        payload: youtubeFixture,
        rawHash: hash,
        jobId: `job-${investigationId}`,
      }
    );

    expect(result.uniqueAccounts).toBe(2);
    expect(result.tweetsProcessed).toBe(6);
    expect(result.seedsRegistered).toBe(2);

    const seed = await testDb()
      .prepare(`SELECT platform FROM seed_accounts WHERE investigation_id = ? LIMIT 1`)
      .bind(investigationId)
      .first<{ platform: string }>();
    expect(seed?.platform).toBe('youtube');

    const stylo = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'stylometric_youtube'`
      )
      .bind(investigationId)
      .first<{ n: number }>();
    expect(Number(stylo?.n ?? 0)).toBeGreaterThan(0);

    const temporal = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'temporal_youtube'`
      )
      .bind(investigationId)
      .first<{ n: number }>();
    expect(Number(temporal?.n ?? 0)).toBeGreaterThan(0);
  });
});

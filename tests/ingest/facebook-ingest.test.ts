import { describe, expect, it } from 'vitest';
import { env } from '../helpers/test-env';
import { createInvestigation } from '../helpers/db';
import { testDb } from '../helpers/test-env';
import { runFacebookIngestPipeline } from '../../implementation/ingest/facebook-pipeline';
import { ArchiveStore } from '../../implementation/archive/store';
import facebookFixture from '../fixtures/facebook-posts.json';

describe('facebook ingest pipeline', { timeout: 20_000 }, () => {
  it('archives listings, registers seeds, and emits stylometric features', async () => {
    const investigationId = `fb-ingest-${crypto.randomUUID()}`;
    await createInvestigation(testDb(), { id: investigationId });
    const archive = new ArchiveStore({ bucket: env.ARCHIVE });
    const raw = new TextEncoder().encode(JSON.stringify(facebookFixture));
    const { hash } = await archive.put(raw, { mimeType: 'application/json', extension: 'json' });

    const result = await runFacebookIngestPipeline(
      { db: testDb(), archive: env.ARCHIVE },
      {
        investigationId,
        payload: facebookFixture,
        rawHash: hash,
        jobId: `job-${investigationId}`,
      }
    );

    expect(result.uniqueAccounts).toBe(2);
    expect(result.tweetsProcessed).toBe(5);
    expect(result.seedsRegistered).toBe(2);

    const seed = await testDb()
      .prepare(`SELECT platform FROM seed_accounts WHERE investigation_id = ? LIMIT 1`)
      .bind(investigationId)
      .first<{ platform: string }>();
    expect(seed?.platform).toBe('facebook');

    const stylo = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'stylometric_facebook'`
      )
      .bind(investigationId)
      .first<{ n: number }>();
    expect(Number(stylo?.n ?? 0)).toBeGreaterThan(0);

    const temporal = await testDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM account_features
         WHERE investigation_id = ? AND extractor_name = 'temporal_facebook'`
      )
      .bind(investigationId)
      .first<{ n: number }>();
    expect(Number(temporal?.n ?? 0)).toBeGreaterThan(0);
  });
});

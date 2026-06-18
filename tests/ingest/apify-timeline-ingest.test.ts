import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import {
  aggregateParsedTweetsByAccount,
  APIFY_TWITTER_TIMELINE_TOOL,
  archiveAccountTimelines,
} from '../../implementation/ingest/apify-timeline';
import { parseApifyTwitterItems } from '../../implementation/ingest/apify-twitter-parser';
import { TwitterStylometricExtractor } from '../../implementation/extractors/stylometric/twitter';
import { TwitterTemporalExtractor } from '../../implementation/extractors/temporal/twitter';
import { TwitterMetadataLeakageExtractor } from '../../implementation/extractors/metadata-leakage/twitter';
import { runAccountExtractors } from '../../implementation/extractors/runner';
import { createInvestigation } from '../helpers/db';
import { testDb } from '../helpers/test-env';

const PROBE_FILE =
  'twitter_scrapes/phase2_tweets_phatadvert_probe_2026-05-14T0346Z.json';

describe('apify timeline ingest', () => {
  it('aggregates tweets by account with dedupe and sort', () => {
    const data = JSON.parse(readFileSync(join(process.cwd(), PROBE_FILE), 'utf8'));
    const parsed = parseApifyTwitterItems(data);
    const timelines = aggregateParsedTweetsByAccount(parsed);

    expect(timelines.length).toBeGreaterThan(0);
    const totalTweets = timelines.reduce((n, t) => n + t.tweets.length, 0);
    expect(totalTweets).toBe(parsed.length);

    for (const timeline of timelines) {
      for (let i = 1; i < timeline.tweets.length; i++) {
        const prev = timeline.tweets[i - 1] as { createdAt?: string };
        const cur = timeline.tweets[i] as { createdAt?: string };
        const prevMs = Date.parse(prev.createdAt ?? '');
        const curMs = Date.parse(cur.createdAt ?? '');
        if (Number.isFinite(prevMs) && Number.isFinite(curMs)) {
          expect(curMs).toBeGreaterThanOrEqual(prevMs);
        }
      }
    }
  });

  it('archives timelines and runs stylometric/temporal/metadata extractors', async () => {
    const investigationId = `timeline-ingest-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });

    const data = JSON.parse(readFileSync(join(process.cwd(), PROBE_FILE), 'utf8'));
    const parsed = parseApifyTwitterItems(data);
    const timelines = aggregateParsedTweetsByAccount(parsed);
    expect(timelines.length).toBeGreaterThan(0);

    const collectedAt = new Date().toISOString();
    const { artifactsCreated } = await archiveAccountTimelines(
      { ARCHIVE: env.ARCHIVE },
      { investigationId, timelines, collectedAt }
    );
    expect(artifactsCreated).toBe(timelines.length);

    const runs = await runAccountExtractors(
      { DB: testDb(), ARCHIVE: env.ARCHIVE },
      {
        investigationId,
        extractors: [
          new TwitterStylometricExtractor(),
          new TwitterTemporalExtractor(),
          new TwitterMetadataLeakageExtractor(),
        ],
        accountFilter: timelines.map(t => t.account),
      }
    );

    for (const run of runs) {
      expect(run.outputFeatureCount).toBeGreaterThan(0);
    }

    const manifestRows = await testDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM account_features WHERE investigation_id = ?`
      )
      .bind(investigationId)
      .first<{ c: number }>();
    expect(manifestRows!.c).toBeGreaterThan(0);

    const timelineEntries = await testDb()
      .prepare(
        `SELECT COUNT(*) AS c
         FROM extractor_runs er
         WHERE er.investigation_id = ?
           AND er.extractor_name IN (?, ?, ?)`
      )
      .bind(
        investigationId,
        'stylometric_twitter',
        'temporal_twitter',
        'metadata_leakage_twitter'
      )
      .first<{ c: number }>();
    expect(timelineEntries!.c).toBe(3);
  });

  it('uses apify-twitter-timeline tool id on archived artifacts', async () => {
    const investigationId = `timeline-tool-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });

    const timelines = [{ account: 'alice', tweets: [{ id: '1', createdAt: '2024-01-01T00:00:00.000Z', text: 'hi' }] }];
    await archiveAccountTimelines(
      { ARCHIVE: env.ARCHIVE },
      { investigationId, timelines, collectedAt: new Date().toISOString() }
    );

    const { ManifestStore } = await import('../../implementation/archive/manifest');
    const manifest = new ManifestStore({ bucket: env.ARCHIVE });
    const entries = await manifest.list({ investigationId, status: 'present' });
    const timelineEntry = entries.find(e => e.account === 'alice');
    expect(timelineEntry?.collectionMethod.tool).toBe(APIFY_TWITTER_TIMELINE_TOOL);
  });
});

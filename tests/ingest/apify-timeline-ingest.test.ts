import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { env } from '../helpers/test-env';
import {
  aggregateParsedTweetsByAccount,
  applyTimeBoundsToTimelines,
  APIFY_TWITTER_TIMELINE_TOOL,
  archiveAccountTimelines,
  filterTweetsByTimeBounds,
} from '../../implementation/ingest/apify-timeline';
import { parseApifyTwitterItems } from '../../implementation/ingest/apify-twitter-parser';
import { TwitterStylometricExtractor } from '../../implementation/extractors/stylometric/twitter';
import { TwitterTemporalExtractor } from '../../implementation/extractors/temporal/twitter';
import { TwitterMetadataLeakageExtractor } from '../../implementation/extractors/metadata-leakage/twitter';
import { runAccountExtractors } from '../../implementation/extractors/runner';
import { createInvestigation } from '../helpers/db';
import { testDb } from '../helpers/test-env';
import { probeFixtureAvailable, probeFixturePath } from '../helpers/fixtures';

describe('apify timeline ingest', () => {
  // These two read the uncommitted twitter_scrapes/ probe corpus; they skip
  // visibly in CI where the fixture is absent (helpers/fixtures.ts, #46).
  it.skipIf(!probeFixtureAvailable())(
    'aggregates tweets by account with dedupe and sort',
    () => {
      const data = JSON.parse(readFileSync(probeFixturePath(), 'utf8'));
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
    }
  );

  it.skipIf(!probeFixtureAvailable())(
    'archives timelines and runs stylometric/temporal/metadata extractors',
    async () => {
      const investigationId = `timeline-ingest-${Date.now()}`;
      await createInvestigation(testDb(), { id: investigationId });

      const data = JSON.parse(readFileSync(probeFixturePath(), 'utf8'));
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
    }
  );

  // No fixture dependency: builds its timeline inline, so it runs everywhere.
  it('uses apify-twitter-timeline tool id on archived artifacts', async () => {
    const investigationId = `timeline-tool-${Date.now()}`;

    const timelines = [{ account: 'alice', tweets: [{ id: '1', createdAt: '2024-01-01T00:00:00.000Z', text: 'hi' }] }];
    await archiveAccountTimelines(
      { ARCHIVE: env.ARCHIVE },
      { investigationId, timelines, collectedAt: new Date().toISOString() }
    );

    const { ManifestStore } = await import('../../implementation/archive/manifest');
    const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId });
    const entries = await manifest.list({ status: 'present' });
    const timelineEntry = entries.find(e => e.account === 'alice');
    expect(timelineEntry?.collectionMethod.tool).toBe(APIFY_TWITTER_TIMELINE_TOOL);
  });

  it('filterTweetsByTimeBounds keeps inclusive window and drops unparseable', () => {
    const bounds = {
      start: '2024-06-01T00:00:00.000Z',
      end: '2024-06-30T23:59:59.999Z',
      justification: 'test window',
    };
    const tweets = [
      { id: 'before', createdAt: '2024-05-31T23:59:59.000Z' },
      { id: 'start', createdAt: '2024-06-01T00:00:00.000Z' },
      { id: 'mid', createdAt: '2024-06-15T12:00:00.000Z' },
      { id: 'end', createdAt: '2024-06-30T23:59:59.999Z' },
      { id: 'after', createdAt: '2024-07-01T00:00:00.000Z' },
      { id: 'nots', text: 'no timestamp' },
    ];
    const kept = filterTweetsByTimeBounds(tweets, bounds).map(
      (t) => (t as { id: string }).id
    );
    expect(kept).toEqual(['start', 'mid', 'end']);
  });

  it('archives only in-window tweets and records time_bounds on manifest', async () => {
    const investigationId = `timeline-bounds-${Date.now()}`;

    const rawTimelines = [
      {
        account: 'alice',
        tweets: [
          { id: 'old', createdAt: '2023-01-01T00:00:00.000Z', text: 'old' },
          { id: 'in', createdAt: '2024-03-15T12:00:00.000Z', text: 'in' },
          { id: 'new', createdAt: '2025-01-01T00:00:00.000Z', text: 'new' },
        ],
      },
      {
        account: 'bob',
        tweets: [{ id: 'bob-old', createdAt: '2020-01-01T00:00:00.000Z', text: 'x' }],
      },
    ];
    const bounds = {
      start: '2024-01-01T00:00:00.000Z',
      end: '2024-12-31T23:59:59.999Z',
      justification: 'calendar year 2024',
    };
    const tweetCountRawByAccount = Object.fromEntries(
      rawTimelines.map((t) => [t.account, t.tweets.length])
    );
    const timelines = applyTimeBoundsToTimelines(rawTimelines, bounds);
    expect(timelines).toHaveLength(1);
    expect(timelines[0].account).toBe('alice');
    expect(timelines[0].tweets).toHaveLength(1);
    expect((timelines[0].tweets[0] as { id: string }).id).toBe('in');

    await archiveAccountTimelines(
      { ARCHIVE: env.ARCHIVE },
      {
        investigationId,
        timelines,
        collectedAt: new Date().toISOString(),
        timeBounds: bounds,
        tweetCountRawByAccount,
      }
    );

    const { ManifestStore } = await import('../../implementation/archive/manifest');
    const { ArchiveStore } = await import('../../implementation/archive/store');
    const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId });
    const entries = await manifest.list({ status: 'present' });
    expect(entries.find((e) => e.account === 'bob')).toBeUndefined();
    const alice = entries.find((e) => e.account === 'alice');
    expect(alice?.collectionMethod.config).toMatchObject({
      tweet_count: 1,
      tweet_count_raw: 3,
      time_bounds: { start: bounds.start, end: bounds.end },
    });

    const archive = new ArchiveStore({ bucket: env.ARCHIVE });
    const stored = await archive.get(alice!.hash, 'json');
    expect(stored).toBeTruthy();
    const body = JSON.parse(new TextDecoder().decode(stored!.bytes)) as { id: string }[];
    expect(body.map((t) => t.id)).toEqual(['in']);
  });
});

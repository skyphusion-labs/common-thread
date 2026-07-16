/**
 * Re-collection tombstone + tweet_deletion tests (issue #151, §5.5 / §6.4.5).
 */

import { describe, expect, it } from 'vitest';
import { ManifestStore } from '../../implementation/archive/manifest';
import {
  APIFY_TWITTER_TIMELINE_TOOL,
  archiveAccountTimelines,
  type AccountTimeline,
} from '../../implementation/ingest/apify-timeline';
import {
  buildPriorTimelineByAccount,
  diffTimelines,
  extractTweetIds,
  findLatestTimelineEntry,
  runTimelineRecollection,
  selectManifestEntriesForExtraction,
} from '../../implementation/ingest/recollection';
import { RECOLLECTION_TOMBSTONE_TOOL } from '../../implementation/ingest/tombstones';
import { TwitterEngagementEventExtractor } from '../../implementation/extractors/network/engagement-events';
import { runEventExtractors } from '../../implementation/extractors/event-runner';
import type { ManifestEntry } from '../../implementation/archive/types';
import { createInvestigation } from '../helpers/db';
import { createFakeR2 } from '../helpers/fake-r2';
import { testDb } from '../helpers/test-env';

function timelineEntry(
  account: string,
  hash: string,
  collectedAt: string
): ManifestEntry {
  return {
    hash,
    source: `https://x.com/${account}/timeline`,
    collectedAt,
    investigationId: 'inv-test',
    account,
    collectionMethod: {
      tool: APIFY_TWITTER_TIMELINE_TOOL,
      version: '1',
      platform: 'twitter',
    },
    status: 'present',
  };
}

describe('recollection helpers', () => {
  it('extractTweetIds collects id, id_str, and tweetId fields', () => {
    const ids = extractTweetIds([
      { id: '111' },
      { id_str: '222' },
      { tweetId: '333' },
      { text: 'no id' },
    ]);
    expect([...ids].sort()).toEqual(['111', '222', '333']);
  });

  it('diffTimelines returns ids missing from the current set', () => {
    const prior = new Set(['a', 'b', 'c']);
    const current = new Set(['b', 'd']);
    expect(diffTimelines(prior, current)).toEqual(['a', 'c']);
  });

  it('findLatestTimelineEntry picks the newest present timeline per account', () => {
    const entries = [
      timelineEntry('alice', 'a'.repeat(64), '2024-01-01T00:00:00.000Z'),
      timelineEntry('alice', 'b'.repeat(64), '2024-06-01T00:00:00.000Z'),
      timelineEntry('bob', 'c'.repeat(64), '2024-03-01T00:00:00.000Z'),
    ];
    const latest = findLatestTimelineEntry(entries, 'alice');
    expect(latest?.hash).toBe('b'.repeat(64));
    expect(findLatestTimelineEntry(entries, 'missing')).toBeNull();
  });

  it('selectManifestEntriesForExtraction keeps only the latest timeline per account', () => {
    const entries = [
      timelineEntry('alice', 'a'.repeat(64), '2024-01-01T00:00:00.000Z'),
      timelineEntry('alice', 'b'.repeat(64), '2024-06-01T00:00:00.000Z'),
      {
        hash: 'd'.repeat(64),
        source: 'https://x.com/alice/profile',
        collectedAt: '2024-06-02T00:00:00.000Z',
        investigationId: 'inv-test',
        account: 'alice',
        collectionMethod: { tool: 'apify-twitter-profile', version: '1' },
        status: 'present',
      },
    ];
    const selected = selectManifestEntriesForExtraction(entries);
    const timelineHashes = selected
      .filter((e) => e.collectionMethod.tool === APIFY_TWITTER_TIMELINE_TOOL)
      .map((e) => e.hash);
    expect(timelineHashes).toEqual(['b'.repeat(64)]);
    expect(selected.some((e) => e.collectionMethod.tool === 'apify-twitter-profile')).toBe(
      true
    );
  });
});

describe('runTimelineRecollection', () => {
  it('writes tombstones and tweet_deletion events for absent tweets', async () => {
    const archive = createFakeR2();
    const investigationId = `recollection-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });

    const priorCollectedAt = '2024-01-01T12:00:00.000Z';
    const discoveredAt = '2024-06-01T12:00:00.000Z';
    const priorTimelines: AccountTimeline[] = [
      {
        account: 'alice',
        tweets: [
          { id: '100', createdAt: '2024-01-01T10:00:00.000Z', text: 'keep' },
          { id: '101', createdAt: '2024-01-01T11:00:00.000Z', text: 'gone' },
        ],
      },
    ];
    const { manifestHashes: priorHashes } = await archiveAccountTimelines(
      { ARCHIVE: archive },
      { investigationId, timelines: priorTimelines, collectedAt: priorCollectedAt }
    );
    expect(priorHashes).toHaveLength(1);

    const manifest = new ManifestStore({ bucket: archive, investigationId });
    const priorEntries = await manifest.list({ status: 'present' });
    const priorTimelineByAccount = buildPriorTimelineByAccount(priorEntries, ['alice']);

    const newTimelines: AccountTimeline[] = [
      {
        account: 'alice',
        tweets: [{ id: '100', createdAt: '2024-01-01T10:00:00.000Z', text: 'keep' }],
      },
    ];

    const result = await runTimelineRecollection({ ARCHIVE: archive }, testDb(), {
      investigationId,
      timelines: newTimelines,
      priorTimelineByAccount,
      discoveredAt,
    });

    expect(result.tombstonesWritten).toBe(1);
    expect(result.deletionsRecorded).toBe(1);
    expect(result.tombstoneManifestHashes).toHaveLength(1);

    const absent = await manifest.list({ status: 'absent' });
    expect(absent).toHaveLength(1);
    expect(absent[0].status).toBe('absent');
    expect(absent[0].tombstoneOf).toBe(priorHashes[0]);
    expect(absent[0].platformMetadata?.tweet_id).toBe('101');
    expect(absent[0].source).toBe('https://x.com/alice/status/101');
    expect(absent[0].collectionMethod.tool).toBe(RECOLLECTION_TOMBSTONE_TOOL);

    const row = await testDb()
      .prepare(
        `SELECT event_type, event_data_json FROM event_features
         WHERE investigation_id = ? AND event_type = 'tweet_deletion'`
      )
      .bind(investigationId)
      .first<{ event_type: string; event_data_json: string }>();
    expect(row?.event_type).toBe('tweet_deletion');
    const data = JSON.parse(row!.event_data_json);
    expect(data).toEqual({
      tweet_id: '101',
      prior_timeline_hash: priorHashes[0],
      discovered_at: discoveredAt,
      collection_window: priorCollectedAt,
    });
  });

  it('does not duplicate tombstones on repeated recollection', async () => {
    const archive = createFakeR2();
    const investigationId = `recollection-dedupe-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });

    const priorCollectedAt = '2024-01-01T12:00:00.000Z';
    await archiveAccountTimelines(
      { ARCHIVE: archive },
      {
        investigationId,
        timelines: [
          {
            account: 'bob',
            tweets: [
              { id: '200', createdAt: '2024-01-01T10:00:00.000Z', text: 'stay' },
              { id: '201', createdAt: '2024-01-01T11:00:00.000Z', text: 'delete' },
            ],
          },
        ],
        collectedAt: priorCollectedAt,
      }
    );

    const manifest = new ManifestStore({ bucket: archive, investigationId });
    const priorEntries = await manifest.list({ status: 'present' });
    const priorTimelineByAccount = buildPriorTimelineByAccount(priorEntries, ['bob']);
    const newTimelines: AccountTimeline[] = [
      {
        account: 'bob',
        tweets: [{ id: '200', createdAt: '2024-01-01T10:00:00.000Z', text: 'stay' }],
      },
    ];

    const first = await runTimelineRecollection({ ARCHIVE: archive }, testDb(), {
      investigationId,
      timelines: newTimelines,
      priorTimelineByAccount,
      discoveredAt: '2024-06-01T12:00:00.000Z',
    });
    const second = await runTimelineRecollection({ ARCHIVE: archive }, testDb(), {
      investigationId,
      timelines: newTimelines,
      priorTimelineByAccount,
      discoveredAt: '2024-07-01T12:00:00.000Z',
    });

    expect(first.tombstonesWritten).toBe(1);
    expect(second.tombstonesWritten).toBe(0);
    expect(await manifest.list({ status: 'absent' })).toHaveLength(1);
  });

  it('event extractors use only the latest timeline and stamp collection_window', async () => {
    const archive = createFakeR2();
    const investigationId = `recollection-extract-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });

    const olderAt = '2024-01-01T12:00:00.000Z';
    const newerAt = '2024-06-01T12:00:00.000Z';

    await archiveAccountTimelines(
      { ARCHIVE: archive },
      {
        investigationId,
        timelines: [
          {
            account: 'carol',
            tweets: [
              {
                id: 'old-reply',
                createdAt: '2024-01-01T10:00:00.000Z',
                inReplyToId: 'news-1',
                inReplyToUsername: 'news_outlet',
                text: 'old',
              },
            ],
          },
        ],
        collectedAt: olderAt,
      }
    );

    await archiveAccountTimelines(
      { ARCHIVE: archive },
      {
        investigationId,
        timelines: [
          {
            account: 'carol',
            tweets: [
              {
                id: 'new-reply',
                createdAt: '2024-06-01T10:00:00.000Z',
                inReplyToId: 'news-2',
                inReplyToUsername: 'news_outlet',
                text: 'new',
              },
            ],
          },
        ],
        collectedAt: newerAt,
      }
    );

    const runs = await runEventExtractors(
      { DB: testDb(), ARCHIVE: archive },
      {
        investigationId,
        extractors: [new TwitterEngagementEventExtractor()],
      }
    );
    expect(runs[0].outputEventCount).toBe(1);

    const row = await testDb()
      .prepare(
        `SELECT event_data_json FROM event_features
         WHERE investigation_id = ? AND account_identifier = 'carol'`
      )
      .bind(investigationId)
      .first<{ event_data_json: string }>();
    const data = JSON.parse(row!.event_data_json);
    expect(data.source_post_id).toBe('new-reply');
    expect(data.collection_window).toBe(newerAt);
  });
});

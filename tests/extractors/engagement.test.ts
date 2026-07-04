/**
 * Integration tests for engagement event + pair extractors (§4.4.3, §4.4.4).
 */

import { describe, expect, it } from 'vitest';
import { env } from '../helpers/test-env';
import { collectArtifact } from '../../implementation/archive/example';
import { TwitterEngagementEventExtractor } from '../../implementation/extractors/network/engagement-events';
import { CoEngagementTimingExtractor } from '../../implementation/extractors/network/co-engagement-timing';
import { AmplificationExtractor } from '../../implementation/extractors/network/amplification';
import { runEventExtractors } from '../../implementation/extractors/event-runner';
import { runEngagementPairExtractors } from '../../implementation/extractors/engagement-pair-runner';
import { addSeedAccount, createInvestigation } from '../helpers/db';
import { testDb } from '../helpers/test-env';

async function archiveTweet(
  investigationId: string,
  account: string,
  tweet: Record<string, unknown>
): Promise<void> {
  await collectArtifact(env, new TextEncoder().encode(JSON.stringify(tweet)), {
    source: 'https://twitter.com/apify',
    investigationId,
    account,
    tool: 'apify-twitter',
    toolVersion: '1.0.0',
    mimeType: 'application/json',
  });
}

describe('engagement event pipeline', () => {
  it('writes event_features and pair_features for co-engagement and amplification', async () => {
    const investigationId = `engagement-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });
    await addSeedAccount(testDb(), {
      investigationId,
      platform: 'twitter',
      account: 'alice',
    });
    await addSeedAccount(testDb(), {
      investigationId,
      platform: 'twitter',
      account: 'bob',
    });

    await archiveTweet(investigationId, 'alice', {
      id: 'a1',
      createdAt: '2024-06-01T12:00:00.000Z',
      inReplyToId: 'news-1',
      inReplyToUsername: 'news_outlet',
      text: 'first',
    });
    await archiveTweet(investigationId, 'bob', {
      id: 'b1',
      createdAt: '2024-06-01T12:01:00.000Z',
      inReplyToId: 'news-1',
      inReplyToUsername: 'news_outlet',
      text: 'second',
    });
    await archiveTweet(investigationId, 'bob', {
      id: 'b2',
      createdAt: '2024-06-01T13:00:00.000Z',
      inReplyToId: 'a-post',
      inReplyToUsername: 'alice',
      text: 'boost alice',
    });

    const eventRuns = await runEventExtractors(
      { DB: testDb(), ARCHIVE: env.ARCHIVE },
      {
        investigationId,
        extractors: [new TwitterEngagementEventExtractor()],
      }
    );
    expect(eventRuns[0].outputEventCount).toBe(3);

    const eventCount = await testDb()
      .prepare(
        `SELECT COUNT(*) AS c FROM event_features WHERE investigation_id = ?`
      )
      .bind(investigationId)
      .first<{ c: number }>();
    expect(eventCount!.c).toBe(3);

    const pairRuns = await runEngagementPairExtractors(
      { DB: testDb(), ARCHIVE: env.ARCHIVE },
      {
        investigationId,
        extractors: [
          new CoEngagementTimingExtractor(),
          new AmplificationExtractor(),
        ],
      }
    );
    expect(pairRuns[0].outputFeatureCount).toBeGreaterThan(0);
    expect(pairRuns[1].outputFeatureCount).toBeGreaterThan(0);

    const coDelta = await testDb()
      .prepare(
        `SELECT feature_value_numeric
         FROM pair_features
         WHERE investigation_id = ?
           AND feature_name = 'co_engagement_delta_min_ms'`
      )
      .bind(investigationId)
      .first<{ feature_value_numeric: number }>();
    expect(coDelta!.feature_value_numeric).toBe(60_000);

    const ampCount = await testDb()
      .prepare(
        `SELECT feature_value_numeric
         FROM pair_features
         WHERE investigation_id = ?
           AND feature_name = 'amplification_b_of_a_count'`
      )
      .bind(investigationId)
      .first<{ feature_value_numeric: number }>();
    expect(ampCount!.feature_value_numeric).toBe(1);
  });
});

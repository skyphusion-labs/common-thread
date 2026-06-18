/**
 * Validates extractors against real Apify scrape JSON in twitter_scrapes/.
 *
 * Files over MAX_BYTES are skipped to keep CI fast; the subset still covers
 * the main Apify field variants (fullText, retweet, inReplyTo*, noResults).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ManifestEntry } from '../../implementation/archive/types';
import { parseApifyTwitterItems } from '../../implementation/ingest/apify-twitter-parser';
import { APIFY_TWITTER_TIMELINE_TOOL } from '../../implementation/ingest/apify-timeline';
import { extractEngagementsFromPosts } from '../../implementation/extractors/network/engagement-parse';
import { TwitterStylometricExtractor } from '../../implementation/extractors/stylometric/twitter';
import { TwitterTemporalExtractor } from '../../implementation/extractors/temporal/twitter';

const SCRAPES_DIR = join(process.cwd(), 'twitter_scrapes');
const MAX_BYTES = 15 * 1024 * 1024;
const SKIP_NAME = /Chain_of_Custody|MANIFEST/i;

function stubEntry(account: string): ManifestEntry {
  return {
    hash: '0'.repeat(64),
    source: `https://x.com/${account}`,
    collectedAt: '2026-05-13T00:00:00.000Z',
    collectionMethod: { tool: APIFY_TWITTER_TIMELINE_TOOL, version: '1.0.0' },
    investigationId: 'scrape-validation',
    account,
    status: 'present',
  };
}

describe('twitter_scrapes Apify compatibility', () => {
  it('account and engagement extractors handle real scrape shapes', () => {
    const files = readdirSync(SCRAPES_DIR).filter(
      f => f.endsWith('.json') && !SKIP_NAME.test(f)
    );

    const summary = {
      filesProcessed: 0,
      tweetsParsed: 0,
      engagementEvents: 0,
      engagementsWithRealPostId: 0,
      rtPrefixOnly: 0,
      accountsWithStylometric: 0,
      accountsWithTemporal: 0,
      parseErrors: [] as string[],
      emptyParses: [] as string[],
    };

    const stylometric = new TwitterStylometricExtractor();
    const temporal = new TwitterTemporalExtractor();

    for (const file of files) {
      const filePath = join(SCRAPES_DIR, file);
      if (statSync(filePath).size > MAX_BYTES) continue;

      let data: unknown;
      try {
        data = JSON.parse(readFileSync(filePath, 'utf8'));
      } catch {
        summary.parseErrors.push(file);
        continue;
      }

      const parsed = parseApifyTwitterItems(data);
      if (parsed.length === 0) {
        summary.emptyParses.push(file);
        continue;
      }

      summary.filesProcessed++;

      const byAccount = new Map<string, unknown[]>();
      for (const row of parsed) {
        const list = byAccount.get(row.account) ?? [];
        list.push(row.tweet);
        byAccount.set(row.account, list);
      }

      for (const [account, tweets] of byAccount) {
        summary.tweetsParsed += tweets.length;

        const events = extractEngagementsFromPosts(account, tweets as never[]);
        summary.engagementEvents += events.length;
        for (const ev of events) {
          const postId = ev.eventData.target_post_id;
          if (postId.startsWith('rt-prefix:')) {
            summary.rtPrefixOnly++;
          } else if (!postId.startsWith('reply-mention:')) {
            summary.engagementsWithRealPostId++;
          }
        }

        const bytes = new TextEncoder().encode(JSON.stringify(tweets));
        const input = { bytes, entry: stubEntry(account) };
        if (stylometric.extract(input).length > 0) {
          summary.accountsWithStylometric++;
        }
        if (temporal.extract(input).length > 0) {
          summary.accountsWithTemporal++;
        }
      }
    }

    expect(summary.parseErrors, summary.parseErrors.join(', ')).toHaveLength(0);
    expect(summary.filesProcessed).toBeGreaterThan(15);
    expect(summary.tweetsParsed).toBeGreaterThan(5_000);
    expect(summary.engagementEvents).toBeGreaterThan(500);
    expect(summary.engagementsWithRealPostId).toBeGreaterThan(200);
    expect(summary.accountsWithStylometric).toBeGreaterThan(20);
    expect(summary.accountsWithTemporal).toBeGreaterThan(20);
    // Embedded `retweet` objects should dominate over weak RT-prefix keys.
    expect(summary.rtPrefixOnly).toBeLessThan(summary.engagementsWithRealPostId);
  }, 120_000);
});

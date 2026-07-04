/**
 * Validates the Apify ingest parser and the stylometric / temporal / engagement
 * extractors against realistic Apify Twitter scrape SHAPES held in
 * `twitter_scrapes/`.
 *
 * The corpus is a small, committed, 100% SYNTHETIC fixture set (see
 * `twitter_scrapes/README.md` and `scripts/gen-twitter-fixtures.mjs`). It is not
 * scraped data: handles are invented, text is machine-composed, IDs are
 * fabricated, external links use example.invalid. It deliberately covers the
 * Apify field variants the extractors branch on: camelCase (`fullText`,
 * `createdAt`, `author.userName`) vs snake_case (`full_text`, `created_at`,
 * `user.screen_name`); embedded `retweet` / `retweeted_status` reposts; weak
 * RT-prefix-only reposts; `inReplyTo*` / `in_reply_to_*` replies; `quotedTweet`
 * / `quoted_status` quotes; and `noResults` placeholder rows.
 *
 * If the directory is absent (a developer removed the fixtures) the suite skips
 * with a reason rather than hard-failing on ENOENT. Files over MAX_BYTES or
 * matching SKIP_NAME (manifest / chain-of-custody sidecars) are ignored.
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

/**
 * Scrape JSON files, or [] when the directory is absent. The suite skips (with
 * a reason) on [] rather than ENOENT-failing, so a missing local corpus never
 * turns into a hard CI error.
 */
function listScrapeFiles(): string[] {
  try {
    return readdirSync(SCRAPES_DIR).filter(
      f => f.endsWith('.json') && !SKIP_NAME.test(f)
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

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

const scrapeFiles = listScrapeFiles();
// Skip-with-reason when the fixture corpus is absent (acceptance for issue #47:
// never a hard ENOENT). Present in CI via the committed synthetic corpus.
const suite = scrapeFiles.length > 0 ? describe : describe.skip;

suite('twitter_scrapes Apify compatibility', () => {
  it('account and engagement extractors handle Apify scrape shapes', () => {
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

    for (const file of scrapeFiles) {
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

    // Thresholds are floors for the committed synthetic corpus (8 accounts x 34
    // posts across two field dialects, plus a mixed noResults file; actuals are
    // deterministic: 9 files, 274 tweets, 160 events, 128 real-post-id, 32
    // rt-prefix, 10/10 stylometric/temporal). They assert the extractors resolve
    // every field variant, not corpus scale, with margin for fixture edits.
    expect(summary.parseErrors, summary.parseErrors.join(', ')).toHaveLength(0);
    expect(summary.filesProcessed).toBeGreaterThan(7);
    expect(summary.tweetsParsed).toBeGreaterThan(200);
    expect(summary.engagementEvents).toBeGreaterThan(100);
    expect(summary.engagementsWithRealPostId).toBeGreaterThan(90);
    expect(summary.accountsWithStylometric).toBeGreaterThan(8);
    expect(summary.accountsWithTemporal).toBeGreaterThan(8);
    // The weak RT-prefix-only path must actually be exercised by the corpus,
    // yet embedded `retweet` objects must dominate over those weak keys.
    expect(summary.rtPrefixOnly).toBeGreaterThan(0);
    expect(summary.rtPrefixOnly).toBeLessThan(summary.engagementsWithRealPostId);
  }, 120_000);
});

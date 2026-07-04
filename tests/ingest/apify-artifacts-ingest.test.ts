import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { env } from '../helpers/test-env';
import { parseApifyTwitterItems } from '../../implementation/ingest/apify-twitter-parser';
import { aggregateParsedTweetsByAccount } from '../../implementation/ingest/apify-timeline';
import {
  aggregateProfilesFromParsedTweets,
  archiveAccountProfiles,
} from '../../implementation/ingest/apify-profile';
import {
  archivePostedImageCorpora,
  buildPostedImageCorporaFromTimelines,
} from '../../implementation/ingest/apify-media-corpus';
import { TwitterAccountMetadataExtractor } from '../../implementation/extractors/account-metadata/twitter';
import { PostedImageCorpusExtractor } from '../../implementation/extractors/visual/posted-image-corpus-extractor';
import { CreationDateClusterExtractor } from '../../implementation/extractors/account-metadata/creation-date-pair';
import { runAccountExtractors } from '../../implementation/extractors/runner';
import { runPairExtractors } from '../../implementation/extractors/pair-runner';
import { ACCOUNT_METADATA_PAIR_EXTRACTORS } from '../../implementation/extractors/account-metadata';
import { createInvestigation, addSeedAccount } from '../helpers/db';
import { testDb } from '../helpers/test-env';
import { probeFixtureAvailable, probeFixturePath } from '../helpers/fixtures';

describe('Apify profile and media corpus ingest', () => {
  // Reads the uncommitted twitter_scrapes/ probe corpus; skips visibly in CI
  // where the fixture is absent (see helpers/fixtures.ts, #46).
  it.skipIf(!probeFixtureAvailable())(
    'archives profiles and posted-image corpora from tweet scrapes',
    async () => {
      const investigationId = `apify-artifacts-${Date.now()}`;
      await createInvestigation(testDb(), { id: investigationId });

      const data = JSON.parse(readFileSync(probeFixturePath(), 'utf8'));
      const parsed = parseApifyTwitterItems(data);
      const timelines = aggregateParsedTweetsByAccount(parsed);
      const profiles = aggregateProfilesFromParsedTweets(parsed);
      const corpora = buildPostedImageCorporaFromTimelines(timelines);

      expect(profiles.length).toBeGreaterThan(0);
      expect(corpora.length).toBeGreaterThan(0);

      const collectedAt = new Date().toISOString();
      await archiveAccountProfiles(
        { ARCHIVE: env.ARCHIVE },
        { investigationId, profiles, collectedAt }
      );
      await archivePostedImageCorpora(
        { ARCHIVE: env.ARCHIVE },
        { investigationId, corpora, collectedAt }
      );

      for (const handle of profiles.map(p => p.account)) {
        await addSeedAccount(testDb(), {
          investigationId,
          platform: 'twitter',
          account: handle,
        });
      }

      const metadataRuns = await runAccountExtractors(
        { DB: testDb(), ARCHIVE: env.ARCHIVE },
        {
          investigationId,
          extractors: [
            new TwitterAccountMetadataExtractor(),
            new PostedImageCorpusExtractor(),
          ],
          accountFilter: profiles.map(p => p.account),
        }
      );
      expect(metadataRuns[0].outputFeatureCount).toBeGreaterThan(10);
      expect(metadataRuns[1].outputFeatureCount).toBeGreaterThan(0);

      const profile = profiles[0];
      const bytes = new TextEncoder().encode(JSON.stringify(profile.profile));
      const features = new TwitterAccountMetadataExtractor().extract({
        bytes,
        entry: {
          hash: '0'.repeat(64),
          source: `https://x.com/${profile.account}/profile`,
          collectedAt,
          collectionMethod: { tool: 'apify-twitter-profile', version: '1' },
          investigationId,
          account: profile.account,
          status: 'present',
        },
      });
      expect(features.some(f => f.name === 'creation_date')).toBe(true);
      expect(features.some(f => f.name === 'username')).toBe(true);

      if (profiles.length >= 2) {
        const pairRuns = await runPairExtractors(
          { DB: testDb(), ARCHIVE: env.ARCHIVE },
          {
            investigationId,
            extractors: [new CreationDateClusterExtractor(), ...ACCOUNT_METADATA_PAIR_EXTRACTORS],
            accountFilter: profiles.map(p => p.account),
          }
        );
        expect(pairRuns.some(r => r.outputFeatureCount > 0)).toBe(true);
      }
    }
  );
});

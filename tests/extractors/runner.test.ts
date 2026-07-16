/**
 * Integration tests for account and pair extractor runners.
 *
 * Seeds R2 via collectArtifact(), runs extractors against real MySQL/R2
 * bindings, and asserts feature rows land in the schema with provenance.
 */

import { describe, expect, it } from 'vitest';
import { env } from '../helpers/test-env';
import { collectArtifact } from '../../implementation/archive/example';
import { TwitterAccountMetadataExtractor } from '../../implementation/extractors/account-metadata/twitter';
import { TwitterNetworkExtractor } from '../../implementation/extractors/network/twitter';
import { ImageHashExtractor } from '../../implementation/extractors/visual/image-hash-extractor';
import { HandleReuseExtractor } from '../../implementation/extractors/cross-platform/handle-reuse';
import { runAccountExtractors } from '../../implementation/extractors/runner';
import { runPairExtractors } from '../../implementation/extractors/pair-runner';
import { dhash, dhashToHex } from '../../implementation/extractors/visual/dhash';
import { phash, phashToHex } from '../../implementation/extractors/visual/phash';
import {
  addSeedAccount,
  createInvestigation,
  insertAccountFeature,
} from '../helpers/db';
import { testDb } from '../helpers/test-env';

const SAMPLE_PROFILE = {
  id: '1234567890',
  username: 'alice',
  name: 'Alice Example',
  description: 'Test bio',
  followersCount: 100,
  friendsCount: 50,
  statusesCount: 200,
};

function rgba9x8(): Uint8Array {
  const width = 9;
  const height = 8;
  const bytes = new Uint8Array(width * height * 4);
  for (let i = 0; i < bytes.length; i += 4) {
    bytes[i] = 128;
    bytes[i + 1] = 64;
    bytes[i + 2] = 32;
    bytes[i + 3] = 255;
  }
  return bytes;
}

describe('runAccountExtractors', () => {
  it('extracts Twitter account metadata from a profile artifact', async () => {
    const investigationId = `extractor-account-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });

    await collectArtifact(env, new TextEncoder().encode(JSON.stringify(SAMPLE_PROFILE)), {
      source: 'https://twitter.com/alice',
      investigationId,
      account: 'alice',
      tool: 'twitter-scraper',
      toolVersion: '1.0.0',
      mimeType: 'application/json',
    });

    const results = await runAccountExtractors(
      { DB: testDb(), ARCHIVE: env.ARCHIVE },
      {
        investigationId,
        extractors: [new TwitterAccountMetadataExtractor()],
      }
    );

    expect(results).toHaveLength(1);
    expect(results[0].outputFeatureCount).toBeGreaterThan(0);

    const rows = await testDb()
      .prepare(
        `SELECT feature_name, feature_value_text
         FROM account_features
         WHERE investigation_id = ? AND account_identifier = 'alice'
         ORDER BY feature_name`
      )
      .bind(investigationId)
      .all<{ feature_name: string; feature_value_text: string | null }>();

    const byName = Object.fromEntries(
      (rows.results ?? []).map(r => [r.feature_name, r.feature_value_text])
    );
    expect(byName.username).toBe('alice');
    expect(byName.display_name).toBe('Alice Example');
  });

  it('passes manifest entry metadata to network extractors', async () => {
    const investigationId = `extractor-network-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });

    const followers = [{ username: 'fan_one' }, { username: 'fan_two' }];
    await collectArtifact(env, new TextEncoder().encode(JSON.stringify(followers)), {
      source: 'https://twitter.com/alice/followers',
      investigationId,
      account: 'alice',
      tool: 'twitter-followers',
      toolVersion: '1.0.0',
      mimeType: 'application/json',
    });

    const results = await runAccountExtractors(
      { DB: testDb(), ARCHIVE: env.ARCHIVE },
      {
        investigationId,
        extractors: [new TwitterNetworkExtractor()],
      }
    );

    expect(results[0].outputFeatureCount).toBe(2);

    const followerSet = await testDb()
      .prepare(
        `SELECT feature_value_json
         FROM account_features
         WHERE investigation_id = ?
           AND account_identifier = 'alice'
           AND feature_name = 'follower_set'`
      )
      .bind(investigationId)
      .first<{ feature_value_json: string }>();

    expect(JSON.parse(followerSet!.feature_value_json)).toEqual(['fan_one', 'fan_two']);
  });

  it('passes manifest entry metadata to image hash extractors', async () => {
    const investigationId = `extractor-visual-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });

    const width = 9;
    const height = 8;
    const rgba = rgba9x8();
    const expectedDhash = dhashToHex(dhash(rgba, width, height));
    const expectedPhash = phashToHex(phash(rgba, width, height));

    const entry = await collectArtifact(env, rgba, {
      source: 'https://twitter.com/alice/profile_images/avatar.png',
      investigationId,
      account: 'alice',
      tool: 'twitter-profile-image',
      toolVersion: '1.0.0',
      mimeType: 'application/x-rgba8',
      platformMetadata: { width, height, imageType: 'profile' },
    });

    const results = await runAccountExtractors(
      { DB: testDb(), ARCHIVE: env.ARCHIVE },
      {
        investigationId,
        extractors: [new ImageHashExtractor()],
      }
    );

    expect(results[0].outputFeatureCount).toBeGreaterThanOrEqual(4);

    const rows = await testDb()
      .prepare(
        `SELECT feature_name, feature_value_text, feature_value_numeric
         FROM account_features
         WHERE investigation_id = ?
           AND account_identifier = 'alice'
           AND feature_category = 'visual'`
      )
      .bind(investigationId)
      .all<{
        feature_name: string;
        feature_value_text: string | null;
        feature_value_numeric: number | null;
      }>();

    const byName = Object.fromEntries(
      (rows.results ?? []).map(r => [r.feature_name, r])
    );
    expect(byName.profile_image_sha256.feature_value_text).toBe(entry.hash);
    expect(byName.profile_image_dhash.feature_value_text).toBe(expectedDhash);
    expect(byName.profile_image_phash.feature_value_text).toBe(expectedPhash);
    expect(byName.profile_image_width.feature_value_numeric).toBe(width);
    expect(byName.profile_image_height.feature_value_numeric).toBe(height);
  });
});

describe('runPairExtractors', () => {
  it('writes canonical pair features with platform columns', async () => {
    const investigationId = `extractor-pair-${Date.now()}`;
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

    // Seed account features via account runner (username for handle-reuse).
    for (const [account, username] of [
      ['alice', 'operator2024'],
      ['bob', 'operator2025'],
    ] as const) {
      const profile = { ...SAMPLE_PROFILE, username };
      await collectArtifact(env, new TextEncoder().encode(JSON.stringify(profile)), {
        source: `https://twitter.com/${account}`,
        investigationId,
        account,
        tool: 'twitter-scraper',
        toolVersion: '1.0.0',
        mimeType: 'application/json',
      });
    }

    await runAccountExtractors(
      { DB: testDb(), ARCHIVE: env.ARCHIVE },
      {
        investigationId,
        extractors: [new TwitterAccountMetadataExtractor()],
      }
    );

    const pairResults = await runPairExtractors(
      { DB: testDb(), ARCHIVE: env.ARCHIVE },
      {
        investigationId,
        extractors: [new HandleReuseExtractor()],
      }
    );

    expect(pairResults[0].pairCount).toBe(1);
    expect(pairResults[0].outputFeatureCount).toBeGreaterThan(0);

    const pairRow = await testDb()
      .prepare(
        `SELECT account_a, account_b, platform_a, platform_b, feature_name, feature_value_text
         FROM pair_features
         WHERE investigation_id = ?
           AND feature_name = 'handle_match_variant'`
      )
      .bind(investigationId)
      .first<{
        account_a: string;
        account_b: string;
        platform_a: string;
        platform_b: string;
        feature_name: string;
        feature_value_text: string;
      }>();

    expect(pairRow!.account_a).toBe('alice');
    expect(pairRow!.account_b).toBe('bob');
    expect(pairRow!.platform_a).toBe('twitter');
    expect(pairRow!.platform_b).toBe('twitter');
    expect(pairRow!.feature_value_text).toBe('year_suffix');
  });

  it('writes platform columns for cross-platform pairs', async () => {
    const investigationId = `extractor-pair-cross-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });

    await addSeedAccount(testDb(), {
      investigationId,
      platform: 'twitter',
      account: 'alice',
    });
    await addSeedAccount(testDb(), {
      investigationId,
      platform: 'reddit',
      account: 'bob',
    });

    await collectArtifact(env, new TextEncoder().encode('{}'), {
      source: 'https://example.com/manifest-seed',
      investigationId,
      account: 'manifest-seed',
      tool: 'test',
      toolVersion: '1.0.0',
      mimeType: 'application/json',
    });

    await insertAccountFeature(testDb(), {
      investigationId,
      platform: 'twitter',
      account: 'alice',
      category: 'account_metadata',
      name: 'username',
      value: { kind: 'text', value: 'operator2024' },
    });
    await insertAccountFeature(testDb(), {
      investigationId,
      platform: 'reddit',
      account: 'bob',
      category: 'account_metadata',
      name: 'username',
      value: { kind: 'text', value: 'operator2025' },
    });

    const pairResults = await runPairExtractors(
      { DB: testDb(), ARCHIVE: env.ARCHIVE },
      {
        investigationId,
        extractors: [new HandleReuseExtractor()],
      }
    );

    expect(pairResults[0].pairCount).toBe(1);

    const pairRow = await testDb()
      .prepare(
        `SELECT platform_a, platform_b
         FROM pair_features
         WHERE investigation_id = ?
         LIMIT 1`
      )
      .bind(investigationId)
      .first<{ platform_a: string; platform_b: string }>();

    expect(pairRow!.platform_a).toBe('twitter');
    expect(pairRow!.platform_b).toBe('reddit');
  });
});

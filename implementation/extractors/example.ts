/**
 * End-to-end example: collect → archive → extract → query.
 *
 * This demonstrates the full pipeline working through the architecture:
 *
 *   1. An investigation is created in D1.
 *   2. A Twitter profile artifact is archived (content-addressed write
 *      to R2 + manifest entry).
 *   3. The Twitter account-metadata extractor runs against the manifest,
 *      reading the artifact from the archive and writing feature rows
 *      to D1 with provenance back to the artifact hash.
 *   4. Features are queried back and printed.
 *
 * Run this from a Worker handler, or adapt the bindings for a local
 * Node script.
 */

import { collectArtifact } from '../archive/example';
import { ACCOUNT_METADATA_EXTRACTORS } from './account-metadata';
import { runAccountExtractors } from './runner';
import type { AccountFeatureRow } from '../schema/db-types';

export interface DemoEnv {
  DB: D1Database;
  ARCHIVE: R2Bucket;
}

/**
 * Sample Twitter profile in a format common scrapers produce.
 * Fields are deliberately varied (camelCase + snake_case) to exercise
 * the extractor's tolerance of naming variations.
 */
const SAMPLE_PROFILE = {
  id: '1234567890',
  username: 'example_user',
  name: 'Example User',
  description:
    'Software engineer at a place. Opinions my own. ' +
    '#OSINT #methodology @some_mention https://example.com',
  location: 'Earth',
  url: 'https://example.com',
  verified: false,
  blueVerified: true,
  createdAt: '2021-04-15T12:34:56.000Z',
  protected: false,
  defaultProfile: false,
  defaultProfileImage: false,
  followersCount: 1234,
  friendsCount: 567,
  statusesCount: 8901,
  listedCount: 12,
  favouritesCount: 4567,
  profileImageUrl: 'https://example.com/profile.jpg',
  profileBannerUrl: 'https://example.com/banner.jpg',
};

export async function runDemo(env: DemoEnv): Promise<{
  investigationId: string;
  extractorResults: ReturnType<typeof Object>;
  features: AccountFeatureRow[];
}> {
  const investigationId = `demo-${Date.now()}`;

  // Step 1: create the investigation
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO investigations (id, name, description, status, created_at, updated_at)
     VALUES (?, ?, ?, 'active', ?, ?)`
  )
    .bind(investigationId, 'Extractor demo', 'End-to-end test', now, now)
    .run();

  // Step 2: archive the profile artifact
  const profileBytes = new TextEncoder().encode(JSON.stringify(SAMPLE_PROFILE));
  await collectArtifact(env, profileBytes, {
    source: 'https://twitter.com/example_user',
    investigationId,
    account: 'example_user',
    tool: 'twitter-scraper',
    toolVersion: '1.0.0',
    mimeType: 'application/json',
    extension: 'json',
  });

  // Step 3: run the extractor
  const extractorResults = await runAccountExtractors(env, {
    investigationId,
    extractors: ACCOUNT_METADATA_EXTRACTORS,
  });

  // Step 4: query the resulting features
  const queryResult = await env.DB.prepare(
    `SELECT * FROM account_features
     WHERE investigation_id = ?
     ORDER BY feature_category, feature_name`
  )
    .bind(investigationId)
    .all<AccountFeatureRow>();

  const features = queryResult.results ?? [];

  return {
    investigationId,
    extractorResults,
    features,
  };
}

/**
 * Worker route handler that runs the demo and returns the results.
 * Wire this into the Worker's main fetch handler:
 *
 *   if (method === 'POST' && path === '/demo/extractor') {
 *     const result = await runDemo(env);
 *     return Response.json(result);
 *   }
 */
export async function demoHandler(env: DemoEnv): Promise<Response> {
  const result = await runDemo(env);

  return new Response(
    JSON.stringify(
      {
        investigation_id: result.investigationId,
        extractor_results: result.extractorResults,
        feature_count: result.features.length,
        features_by_name: result.features.reduce<Record<string, unknown>>((acc, f) => {
          if (f.feature_value_text !== null) acc[f.feature_name] = f.feature_value_text;
          else if (f.feature_value_numeric !== null) acc[f.feature_name] = f.feature_value_numeric;
          else if (f.feature_value_json !== null)
            acc[f.feature_name] = JSON.parse(f.feature_value_json);
          return acc;
        }, {}),
      },
      null,
      2
    ) + '\n',
    { headers: { 'Content-Type': 'application/json' } }
  );
}

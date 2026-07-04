/**
 * Local-only test fixtures.
 *
 * The Apify Twitter probe corpus lives under twitter_scrapes/ and is NOT
 * committed to the repo (the same local-only test data that keeps
 * twitter-scrapes.test.ts fixture-blocked; see #46). Suites that read it skip
 * their fixture-dependent tests when it is absent (CI), rather than failing, so
 * the skip is visible in the report instead of a silent exclusion. When the
 * corpus is present (local dev) those tests run.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const PROBE_FILE =
  'twitter_scrapes/phase2_tweets_phatadvert_probe_2026-05-14T0346Z.json';

export function probeFixturePath(): string {
  return join(process.cwd(), PROBE_FILE);
}

export function probeFixtureAvailable(): boolean {
  return existsSync(probeFixturePath());
}

/**
 * Vitest config for Common Thread (two projects).
 *
 * The DB layer (implementation/db.ts -> mysql2/promise) fails to LOAD under
 * @cloudflare/vitest-pool-workers: the pool force-injects nodejs_compat v1,
 * where mysql2's `lru.min` does not resolve (Cannot destructure createLRU).
 * This is a TEST-HARNESS limitation, NOT a prod issue -- in production the
 * worker reaches MySQL via Hyperdrive using mysql2 with `disableEval: true` +
 * query() (Cloudflare's supported mysql2-in-Workers path) at the real compat
 * date, where it loads fine. So here, suites that touch the DB run in a NODE
 * project against a real MySQL (TEST_MYSQL_URL, a service container in CI); the
 * pure Workers-runtime suites stay in the workers pool. See issues #30, #46.
 *
 * The DB-backed suites that ALSO used `cloudflare:test` primitives were once
 * dark in both projects (#46). They now run in the node project: `env.ARCHIVE`
 * is an in-memory fake R2 (tests/helpers/fake-r2.ts), `fetchMock` is an undici
 * MockAgent shim (tests/helpers/undici-mock.ts), and `worker.fetch(req, env)`
 * is a direct handler call with a plain Node env (tests/helpers/test-env.ts).
 * Tradeoff: the fake R2 loses real R2-binding fidelity; it is the only path
 * that runs these suites at all and it recovers the real DB coverage. If a
 * subset ever needs real-R2 fidelity, run that subset in the workers pool as a
 * separate follow-up (#46).
 *
 * This file uses the `.mts` extension so Node/Vite load it as ESM.
 * `@cloudflare/vitest-pool-workers` is ESM-only and fails when the config is
 * bundled as CommonJS (vitest.config.ts without "type": "module").
 */

import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

const testMysqlUrl =
  process.env.TEST_MYSQL_URL ?? 'mysql://root@127.0.0.1:3306/common_thread_test';

/** Miniflare Hyperdrive emulation requires a `user:password@` URL. */
function hyperdriveLocalConnectionString(url: string): string {
  const parsed = new URL(url);
  if (!parsed.password) {
    parsed.password = 'local';
  }
  return parsed.toString();
}

// Hyperdrive binding in wrangler.toml requires a local MySQL URL for Miniflare.
process.env.CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB ??=
  hyperdriveLocalConnectionString(testMysqlUrl);

// Suites that run in the NODE project. Everything that needs node:fs or the
// mysql2 DB layer, neither of which works in the workers pool:
//   - api-routes: the pure-helper unit suite.
//   - twitter-scrapes: reads a committed synthetic fixture corpus off disk with
//     node:fs; touches no DB (the node-db globalSetup is a harmless no-op for
//     it).
//   - the DB-backed suites recovered from the old cloudflare:test hybrid block
//     (#46), now using the node harness helpers (fake R2, undici MockAgent,
//     direct worker.fetch) instead of `cloudflare:test`.
const nodeSuites = [
  'tests/investigation/api-routes.test.ts',
  'tests/extractors/twitter-scrapes.test.ts',
  'tests/extractors/engagement.test.ts',
  'tests/extractors/runner.test.ts',
  'tests/ingest/apify-artifacts-ingest.test.ts',
  'tests/ingest/apify-timeline-ingest.test.ts',
  'tests/investigation/access.test.ts',
  'tests/reasoner/ai-gateway.test.ts',
  'tests/reasoner/reasoner.test.ts',
  'tests/reasoner/runner.test.ts',
  'tests/reasoner/triage.test.ts',
  // Worker error-hygiene e2e (#67): drives worker.fetch, which imports the
  // mysql2 DB layer and so cannot run in the workers pool.
  'tests/workers/error-hygiene.test.ts',
];

// Note: the two apify ingest suites read the twitter_scrapes/ phatadvert probe,
// which is NOT part of the committed synthetic corpus, so their fixture-reading
// tests skip visibly via it.skipIf (helpers/fixtures.ts) while their
// non-fixture coverage runs. Nothing is silently excluded from either project.

export default defineConfig({
  test: {
    projects: [
      // --- Pure Workers-runtime suites (no mysql2, no node:fs, no DB env) ---
      {
        plugins: [
          cloudflareTest({
            wrangler: { configPath: './wrangler.toml' },
            miniflare: {
              r2Buckets: ['ARCHIVE'],
              bindings: {
                AI_GATEWAY_URL: 'https://gateway.test',
                ANTHROPIC_API_KEY: 'sk-test-key',
              },
            },
          }),
        ],
        test: {
          name: 'workers',
          pool: 'workers',
          include: ['tests/**/*.test.ts'],
          // Node-only suites do not belong in the workers pool.
          exclude: [...nodeSuites],
        },
      },
      // --- Node suites (real MySQL via mysql2; fake R2 + undici MockAgent) ---
      {
        test: {
          name: 'node-db',
          environment: 'node',
          include: nodeSuites,
          globalSetup: ['./tests/global-setup.ts'],
        },
      },
    ],
  },
});

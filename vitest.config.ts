/**
 * Vitest config for Common Thread.
 *
 * Uses @cloudflare/vitest-pool-workers to run tests inside a real
 * Miniflare-backed Workers runtime. This gives tests access to
 * actual D1 (in-memory SQLite, schema applied via tests/setup.ts)
 * and R2 (in-memory bucket) bindings instead of mocks. SQLite
 * functions like GROUP_CONCAT, SUBSTR, and strftime() that the
 * schema migrations and the runner depend on are exercised against
 * the real engine, not a JS approximation.
 *
 * Migrations are read at config-load time by readD1Migrations() and
 * passed into the runtime as the TEST_MIGRATIONS binding. The setup
 * file (tests/setup.ts) applies them via applyD1Migrations() from
 * cloudflare:test, which handles multi-statement SQL, comments, and
 * transactions correctly without a hand-rolled splitter.
 *
 * Env bindings: TRIAGE_MODEL and REASONING_MODEL inherit from
 * wrangler.toml's [vars] block. AI_GATEWAY_URL and ANTHROPIC_API_KEY
 * are documented as secrets in wrangler.toml (not present in source
 * control); for tests they are stubbed here. The fetchMock layer
 * intercepts the requests before they would actually reach the
 * gateway URL, so the URL only needs to be syntactically valid.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defineWorkersConfig,
  readD1Migrations,

} from '@cloudflare/vitest-pool-workers';

export default defineWorkersConfig(async () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsPath = path.join(
    here,
    'implementation',
    'schema',
    'migrations'
  );
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/**/*.test.ts'],
      
      coverage: {
        provider: 'istanbul',      // Runs cleanly inside the workerd sandbox
        reporter: ['cobertura'],   // Outputs format required by GitHub
        reportsDirectory: './coverage'
      },

      poolOptions: {
        workers: {
          wrangler: { configPath: './wrangler.toml' },
          miniflare: {
            d1Databases: ['DB'],
            r2Buckets: ['ARCHIVE'],
            bindings: {
              AI_GATEWAY_URL: 'https://gateway.test',
              ANTHROPIC_API_KEY: 'sk-test-key',
              TEST_MIGRATIONS: migrations,
            },
          },
        },
      },
    },
  };
});

/**
 * Global test setup.
 *
 * Applies the schema migrations against the test D1 binding before
 * any tests run. Migrations are read at config-load time by
 * readD1Migrations() in vitest.config.ts and passed into the runtime
 * via the TEST_MIGRATIONS binding. applyD1Migrations() handles
 * multi-statement SQL, comments, and transactions, and tracks which
 * migrations have already been applied via a d1_migrations table.
 *
 * To add migration 0003: drop it into
 * implementation/schema/migrations/ and readD1Migrations picks it up
 * automatically on the next run.
 */

import { applyD1Migrations, env } from 'cloudflare:test';
import type { D1Migration } from 'cloudflare:test';
import { beforeAll } from 'vitest';

// Augment cloudflare:test's ProvidedEnv with the test-only binding
// declared in vitest.config.ts miniflare options. The wrangler.toml
// shape doesn't include TEST_MIGRATIONS because it's a test-time
// construct, not a runtime binding.
declare module 'cloudflare:test' {
  interface ProvidedEnv {
    TEST_MIGRATIONS: D1Migration[];
  }
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

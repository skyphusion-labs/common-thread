/**
 * Vitest config for Common Thread.
 *
 * Uses @cloudflare/vitest-pool-workers for the Workers runtime (R2, fetchMock).
 * MySQL integration tests use a real database via TEST_MYSQL_URL
 * (see tests/helpers/mysql.ts and tests/setup.ts).
 *
 * This file uses the `.mts` extension so Node/Vite load it as ESM.
 * `@cloudflare/vitest-pool-workers` is ESM-only and fails when the
 * config is bundled as CommonJS (vitest.config.ts without "type": "module").
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

export default defineConfig({
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
    name: 'common-thread',
    pool: 'workers',
    globalSetup: ['./tests/global-setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
});

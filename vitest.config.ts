/**
 * Vitest config for Common Thread.
 *
 * Uses @cloudflare/vitest-pool-workers for the Workers runtime (R2, fetchMock).
 * MySQL integration tests use a real database via TEST_MYSQL_URL
 * (see tests/helpers/mysql.ts and tests/setup.ts).
 */

import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

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
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
  },
});

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
 * Env bindings: TRIAGE_MODEL and REASONING_MODEL inherit from
 * wrangler.toml's [vars] block. AI_GATEWAY_URL and ANTHROPIC_API_KEY
 * are documented as secrets in wrangler.toml (not present in source
 * control); for tests they are stubbed here. The fetchMock layer
 * intercepts the requests before they would actually reach the
 * gateway URL, so the URL only needs to be syntactically valid.
 */

import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          d1Databases: ['DB'],
          r2Buckets: ['ARCHIVE'],
          // Test-only values for the secrets documented in wrangler.toml.
          // fetchMock intercepts requests to AI_GATEWAY_URL before they
          // leave the runtime; the value just needs a valid origin.
          bindings: {
            AI_GATEWAY_URL: 'https://gateway.test/anthropic',
            ANTHROPIC_API_KEY: 'sk-test-key',
          },
        },
      },
    },
  },
});

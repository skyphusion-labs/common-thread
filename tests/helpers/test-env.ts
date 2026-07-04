/**
 * Shared bindings for the node-project integration tests: MySQL + in-memory R2.
 *
 * These suites moved out of the workers pool (#46): mysql2 cannot load under
 * @cloudflare/vitest-pool-workers, so the DB-backed suites run in the node
 * project against a real MySQL (TEST_MYSQL_URL). There is no `cloudflare:test`
 * here, so `env.ARCHIVE` is an in-memory fake R2 (see fake-r2.ts for the
 * fidelity tradeoff) and `env.DB` is a Hyperdrive-shaped object the worker
 * turns into its own mysql2 connection.
 */

import { createFakeR2 } from './fake-r2';
import { getTestDatabase, testMysqlConfig, testMysqlUrl } from './mysql';
import type { DatabaseClient } from '../../implementation/db';
import type { ReasonerRunnerEnv } from '../../implementation/reasoner/runner';
import type { Env } from '../../implementation/workers/index';

// One in-memory R2 shared across a test file, mirroring the single miniflare
// bucket the workers pool used to hand these suites. Content-addressed keys and
// per-investigation manifest paths keep unique-id tests from colliding.
const archive = createFakeR2();

/**
 * Hyperdrive-shaped DB binding for direct worker.fetch invocation. The worker
 * consumes env.DB via hyperdriveToConfig (host/user/password/database/port),
 * opening its own mysql2 connection to TEST_MYSQL_URL, so only those fields
 * carry meaning here.
 */
function fakeHyperdrive(): Hyperdrive {
  const cfg = testMysqlConfig();
  return {
    host: cfg.host,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    port: cfg.port,
    connectionString: testMysqlUrl(),
  } as unknown as Hyperdrive;
}

/**
 * Fake worker Env for direct handler invocation: Hyperdrive-shaped DB plus the
 * in-memory R2, matching the old miniflare bindings (AI_GATEWAY_URL /
 * ANTHROPIC_API_KEY). ENVIRONMENT is non-production so the hosted-API notice
 * stays off unless a test overrides it.
 */
export const env: Env = {
  DB: fakeHyperdrive(),
  ARCHIVE: archive,
  ENVIRONMENT: 'test',
  AI_GATEWAY_URL: 'https://gateway.test',
  ANTHROPIC_API_KEY: 'sk-test-key',
};

export function testDb(): DatabaseClient {
  return getTestDatabase();
}

export function testRunnerEnv(): { DB: DatabaseClient; ARCHIVE: R2Bucket } {
  return {
    DB: getTestDatabase(),
    ARCHIVE: archive,
  };
}

export function testReasonerEnv(): ReasonerRunnerEnv {
  return {
    DB: getTestDatabase(),
    ARCHIVE: archive,
    // Provider-segmented like a real CF AI Gateway URL (.../anthropic); callLLM
    // appends /v1/messages, matching the undici mock in helpers/llm.ts.
    AI_GATEWAY_URL: 'https://gateway.test/anthropic',
    ANTHROPIC_API_KEY: 'sk-test-key',
    TRIAGE_MODEL: 'claude-haiku-4-5',
    REASONING_MODEL: 'claude-opus-4-8',
  };
}

/**
 * Shared bindings for integration tests: MySQL + in-memory R2.
 */

import { env } from 'cloudflare:test';
import { getTestDatabase } from './mysql';
import type { DatabaseClient } from '../../implementation/db';
import type { ReasonerRunnerEnv } from '../../implementation/reasoner/runner';

export function testDb(): DatabaseClient {
  return getTestDatabase();
}

export function testRunnerEnv(): { DB: DatabaseClient; ARCHIVE: R2Bucket } {
  return {
    DB: getTestDatabase(),
    ARCHIVE: env.ARCHIVE,
  };
}

export function testReasonerEnv(): ReasonerRunnerEnv {
  return {
    DB: getTestDatabase(),
    ARCHIVE: env.ARCHIVE,
    AI_GATEWAY_URL: 'https://gateway.test',
    ANTHROPIC_API_KEY: 'sk-test-key',
    TRIAGE_MODEL: 'claude-haiku-4-5',
    REASONING_MODEL: 'claude-opus-4-8',
  };
}

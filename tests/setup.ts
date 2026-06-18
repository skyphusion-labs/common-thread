/**
 * Global test setup.
 *
 * Applies mysql-schema.sql to TEST_MYSQL_URL before integration tests run.
 * Workers-pool tests still use cloudflare:test for R2 and fetchMock; MySQL
 * is a direct mysql2 connection via tests/helpers/mysql.ts.
 */

import { beforeAll } from 'vitest';
import { applyTestSchema } from './helpers/mysql';

beforeAll(async () => {
  await applyTestSchema();
});

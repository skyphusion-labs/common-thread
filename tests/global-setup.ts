/**
 * Node-only global setup for Vitest.
 *
 * Runs in the host process before the Workers pool starts. Schema
 * bootstrap uses mysql2 and must not run inside setupFiles (Workers runtime).
 */

import { applyTestSchema } from './helpers/mysql';

export default async function globalSetup(): Promise<void> {
  try {
    await applyTestSchema();
  } catch (err) {
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as NodeJS.ErrnoException).code
        : undefined;
    if (code === 'ECONNREFUSED') {
      console.warn(
        '[test setup] MySQL not reachable at TEST_MYSQL_URL; skipping schema bootstrap. Integration tests will fail until MySQL is running.'
      );
      return;
    }
    throw err;
  }
}

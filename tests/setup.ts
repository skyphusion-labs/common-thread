/**
 * Global test setup.
 *
 * Applies the schema migrations against the test D1 binding before
 * any tests run. Each migration file is loaded as a raw string via
 * Vite's `?raw` import suffix and executed through D1's `exec()`,
 * which supports multi-statement SQL without parameter binding.
 *
 * Migration files are listed explicitly rather than discovered via
 * file glob because:
 *   1. Migration order matters (0001 before 0002), and an alphabetical
 *      sort happens to work today but the dependency is implicit.
 *   2. Adding a new migration is an intentional action that should
 *      include adding it here.
 *   3. Vite's static import resolution handles `?raw` at build time;
 *      glob would require additional plugin config.
 *
 * To add migration 0003: import it below and append to MIGRATIONS.
 */

import { env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

import migration0001 from '../implementation/schema/migrations/0001_initial.sql?raw';
import migration0002 from '../implementation/schema/migrations/0002_split_pair_platform_columns.sql?raw';

const MIGRATIONS: ReadonlyArray<{ name: string; sql: string }> = [
  { name: '0001_initial', sql: migration0001 },
  { name: '0002_split_pair_platform_columns', sql: migration0002 },
];

beforeAll(async () => {
  for (const m of MIGRATIONS) {
    try {
      await env.DB.exec(stripCommentsAndCollapse(m.sql));
    } catch (err) {
      throw new Error(
        `Migration ${m.name} failed in test setup: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
});

/**
 * D1's exec() does not accept SQL comments cleanly in all runtimes
 * and is whitespace-sensitive across newlines for some statement
 * splitting. Strip `-- line comments` and collapse trailing whitespace
 * to make exec() robust against the migration files' commenting style.
 *
 * Block comments are not used in the current migrations; if added,
 * extend this helper.
 */
function stripCommentsAndCollapse(sql: string): string {
  const lines = sql.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const commentIdx = line.indexOf('--');
    const code = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    const trimmed = code.trimEnd();
    if (trimmed.length > 0) out.push(trimmed);
  }
  return out.join('\n');
}

/**
 * Worker error-hygiene tests (#67).
 *
 * Runs in the NODE project: the worker imports the mysql2 DB layer, which
 * cannot load under the workers pool. These cases drive worker.fetch directly
 * with a plain env and never reach a real DB:
 *
 *   - A malformed JSON body must yield 400 + a typed code, not a generic 500.
 *   - An unexpected internal failure must yield a generic 500 that does NOT
 *     echo the underlying error string (which can carry SQL/driver internals).
 *
 * Self-contained (no shared node harness helpers) so it can live on a branch
 * cut from main independently of #46.
 */

import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../../implementation/workers/index';

function baseEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: {} as unknown as Hyperdrive,
    ARCHIVE: {} as unknown as R2Bucket,
    ENVIRONMENT: 'test',
    ...overrides,
  } as Env;
}

describe('worker error hygiene (#67)', () => {
  it('returns 400 invalid_json_body on a malformed JSON body (not a 500)', async () => {
    // POST /investigations parses the body before any DB work, so a malformed
    // body is rejected without touching env.DB.
    const res = await worker.fetch(
      new Request('http://localhost/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ this is not valid json',
      }),
      baseEnv()
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.code).toBe('invalid_json_body');
    expect(body.error).toBe('Request body must be valid JSON');
  });

  it('returns 400 invalid_json_body on an empty body where JSON is required', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
      baseEnv()
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('invalid_json_body');
  });

  it('returns a generic 500 without leaking the underlying error detail', async () => {
    // Any property read on env.DB throws with a message carrying sensitive
    // connection detail; the old code echoed err.message into the 500 body.
    const secret = 'host=192.0.2.9 user=root password=hunter2';
    const throwingDb = new Proxy(
      {},
      {
        get() {
          throw new Error(`driver failure: ${secret}`);
        },
      }
    ) as unknown as Hyperdrive;

    const res = await worker.fetch(
      new Request('http://localhost/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'e2e-500', name: 'boom' }),
      }),
      baseEnv({ DB: throwingDb })
    );

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.error).toBe('Internal server error');
    expect(body.code).toBe('internal_error');

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('driver failure');
    expect(serialized).not.toContain('192.0.2.9');
  });
});

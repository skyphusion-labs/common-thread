import { describe, expect, it } from 'vitest';
import worker from '../../implementation/workers/index';
import { env } from '../helpers/test-env';
import { generateAccessToken } from '../../implementation/investigations/access';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

describe('POST /investigations hygiene (#282)', () => {
  it('rejects an id that would break Content-Disposition or R2 keys', async () => {
    const res = await worker.fetch(
      new Request('http://localhost/investigations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': uid('ip-badid'),
        },
        body: JSON.stringify({ id: 'bad/"id\r\n', name: 'nope' }),
      }),
      env
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('invalid_investigation_id');
  });

  it('returns 429 create_cap_exceeded after the per-IP window fills', async () => {
    const ip = uid('ip-cap');
    const createEnv = { ...env, MAX_INVESTIGATION_CREATES_PER_WINDOW: '2' };
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await worker.fetch(
        new Request('http://localhost/investigations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': ip,
          },
          body: JSON.stringify({ id: uid(`cap-hygiene-${i}`), name: 'cap' }),
        }),
        createEnv
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 2)).toEqual([201, 201]);
    expect(statuses[2]).toBe(429);
    const body = (await (
      await worker.fetch(
        new Request('http://localhost/investigations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'CF-Connecting-IP': ip,
          },
          body: JSON.stringify({ id: uid('cap-hygiene-extra'), name: 'cap' }),
        }),
        createEnv
      )
    ).json()) as { error?: string };
    expect(body.error).toBe('create_cap_exceeded');
  });

  it('treats a missing investigation the same as a bad token', async () => {
    const token = generateAccessToken();
    const missing = await worker.fetch(
      new Request(`http://localhost/investigations/${uid('missing-inv')}/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      env
    );
    expect(missing.status).toBe(401);
    expect((await missing.json() as { code?: string }).code).toBe('invalid_token');

    const noToken = await worker.fetch(
      new Request(`http://localhost/investigations/${uid('missing-inv')}/summary`),
      env
    );
    expect(noToken.status).toBe(401);
    expect((await noToken.json() as { code?: string }).code).toBe('missing_token');
  });
});

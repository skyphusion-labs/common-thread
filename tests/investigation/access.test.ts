import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../implementation/workers/index';
import {
  authorizeInvestigation,
  generateAccessToken,
  hashAccessToken,
  timingSafeEqual,
} from '../../implementation/investigations/access';
import { createInvestigation } from '../helpers/db';
import { testDb } from '../helpers/test-env';

describe('investigation access helpers', () => {
  it('generateAccessToken uses ct_ prefix and sufficient length', () => {
    const token = generateAccessToken();
    expect(token.startsWith('ct_')).toBe(true);
    expect(token.length).toBeGreaterThan(40);
  });

  it('hashAccessToken is deterministic', async () => {
    const token = 'ct_test_token_value';
    const a = await hashAccessToken(token);
    const b = await hashAccessToken(token);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('timingSafeEqual compares strings safely', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
  });
});

describe('investigation access API', () => {
  it('POST /investigations returns a one-time access_token', async () => {
    const id = `api-create-${Date.now()}`;
    const res = await worker.fetch(
      new Request('http://localhost/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: 'Access test' }),
      }),
      env
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { access_token?: string };
    expect(body.access_token).toMatch(/^ct_/);
  });

  it('GET /investigations listing is disabled', async () => {
    const res = await worker.fetch(new Request('http://localhost/investigations'), env);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('listing_disabled');
  });

  it('rejects investigation routes without a capability token', async () => {
    const id = `api-deny-${Date.now()}`;
    await createInvestigation(testDb(), { id });

    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/summary`),
      env
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('missing_token');
  });

  it('allows read access with a valid token and blocks writes when sealed', async () => {
    const id = `api-seal-${Date.now()}`;
    const { accessToken } = await createInvestigation(testDb(), { id, status: 'active' });
    const headers = { 'X-Investigation-Token': accessToken };

    const summaryRes = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/summary`, { headers }),
      env
    );
    expect(summaryRes.status).toBe(200);

    const sealRes = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/seal`, {
        method: 'POST',
        headers,
      }),
      env
    );
    expect(sealRes.status).toBe(200);
    const sealBody = (await sealRes.json()) as { investigation?: { status?: string } };
    expect(sealBody.investigation?.status).toBe('sealed');

    const ingestRes = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/ingest/apify-twitter`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      }),
      env
    );
    expect(ingestRes.status).toBe(403);
    const ingestBody = (await ingestRes.json()) as { code?: string };
    expect(ingestBody.code).toBe('read_only');
  });

  it('authorizeInvestigation accepts Bearer and query tokens', async () => {
    const id = `api-bearer-${Date.now()}`;
    const { accessToken } = await createInvestigation(testDb(), { id });
    const url = new URL(`http://localhost/investigations/${id}/summary?access_token=${accessToken}`);

    const row = await authorizeInvestigation(
      env.DB,
      new Request(url.toString()),
      url,
      id
    );
    expect(row.id).toBe(id);
  });
});

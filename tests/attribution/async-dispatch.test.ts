/**
 * Async attribution enqueue/dispatch tests (#69).
 *
 * Two layers:
 *   - Pure decision predicate (shouldRunAttributionAsync / executorEnabled):
 *     the full source x executor matrix, no DB.
 *   - Integration via worker.fetch (node-db project, real MySQL + fake R2):
 *     server-creds + executor bound -> 202 + a queued attribution_jobs row with
 *     NO credential persisted and a dispatch carrying the Bearer secret; BYOK
 *     (request creds) does NOT enqueue even with the executor bound; the status
 *     poll endpoint returns the row or 404.
 *
 * The synchronous 200 inline path itself is covered by tests/reasoner/*; here we
 * only assert the enqueue DECISION and that BYOK stays off the async path.
 */

import { describe, expect, it } from 'vitest';
import worker, { type Env } from '../../implementation/workers/index';
import { env, testDb } from '../helpers/test-env';
import { createInvestigation } from '../helpers/db';
import {
  attributionExecutorEnabled,
  shouldRunAttributionAsync,
} from '../../implementation/attribution/dispatch';

// A stub Fetcher standing in for the VPC_ATTRIBUTION binding. Records each call
// so the test can assert the dispatch payload and Authorization header.
function makeStubExecutor(status = 202) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher = {
    async fetch(url: string, init?: RequestInit): Promise<Response> {
      calls.push({ url, init });
      return new Response(JSON.stringify({ accepted: true }), { status });
    },
  } as unknown as Fetcher;
  return { fetcher, calls };
}

function executorEnv(fetcher: Fetcher, overrides: Partial<Env> = {}): Env {
  return {
    ...env,
    // The shared test env's gateway host must be allow-listed for the handler's
    // credential resolution to accept it as server creds.
    AI_GATEWAY_ALLOWED_HOSTS: 'gateway.test',
    VPC_ATTRIBUTION: fetcher,
    ATTRIBUTION_WORKER_URL: 'http://attr.test/trigger',
    ATTRIBUTION_SECRET: 'attr-secret',
    ...overrides,
  } as Env;
}

// ---------------------------------------------------------------------------
// Decision predicate
// ---------------------------------------------------------------------------

describe('shouldRunAttributionAsync', () => {
  const bound = {
    VPC_ATTRIBUTION: {} as Fetcher,
    ATTRIBUTION_WORKER_URL: 'http://attr.test/trigger',
    ATTRIBUTION_SECRET: 's',
  };

  it('is true only for server creds with the executor bound', () => {
    expect(shouldRunAttributionAsync(bound, 'environment')).toBe(true);
  });

  it('is false for BYOK (request creds) even with the executor bound', () => {
    expect(shouldRunAttributionAsync(bound, 'request')).toBe(false);
  });

  it('is false for server creds when the executor is not bound', () => {
    expect(shouldRunAttributionAsync({}, 'environment')).toBe(false);
    expect(shouldRunAttributionAsync({ VPC_ATTRIBUTION: {} as Fetcher }, 'environment')).toBe(
      false
    );
  });

  it('executorEnabled requires all three bindings', () => {
    expect(attributionExecutorEnabled(bound)).toBe(true);
    expect(attributionExecutorEnabled({})).toBe(false);
    expect(
      attributionExecutorEnabled({
        VPC_ATTRIBUTION: {} as Fetcher,
        ATTRIBUTION_WORKER_URL: 'http://attr.test/trigger',
      })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: POST /attribute enqueue decision
// ---------------------------------------------------------------------------

describe('POST /attribute async enqueue', () => {
  it('server creds + executor bound -> 202 + queued job, no credential persisted', async () => {
    const id = `attr-async-${Date.now()}`;
    const { accessToken } = await createInvestigation(testDb(), { id, status: 'active' });
    const { fetcher, calls } = makeStubExecutor(202);

    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/attribute`, {
        method: 'POST',
        headers: {
          'X-Investigation-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ skipTriage: true }),
      }),
      executorEnv(fetcher)
    );

    expect(res.status).toBe(202);
    const body = (await res.json()) as {
      jobId?: string;
      status?: string;
      mode?: string;
    };
    expect(body.jobId).toMatch(/^attrjob_/);
    expect(body.status).toBe('queued');
    expect(body.mode).toBe('async');

    // The dispatch fired once, to the configured URL, with the Bearer secret.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://attr.test/trigger');
    const auth = new Headers(calls[0].init?.headers as HeadersInit).get('Authorization');
    expect(auth).toBe('Bearer attr-secret');

    // The handoff carries only non-secret options: no credential leaves the
    // Worker into the executor.
    const handoff = JSON.parse(String(calls[0].init?.body)) as {
      jobId: string;
      investigationId: string;
      options: Record<string, unknown>;
    };
    expect(handoff.investigationId).toBe(id);
    expect(handoff.options.skipTriage).toBe(true);
    const handoffJson = JSON.stringify(handoff).toLowerCase();
    expect(handoffJson).not.toContain('anthropic');
    expect(handoffJson).not.toContain('api_key');
    expect(handoffJson).not.toContain('apikey');

    // The persisted row is queued and holds no credential (the column does not
    // exist by construction; assert the stored options + full row too).
    const row = await testDb()
      .prepare(`SELECT * FROM attribution_jobs WHERE job_id = ?`)
      .bind(body.jobId)
      .first<Record<string, unknown>>();
    expect(row?.status).toBe('queued');
    expect(row?.investigation_id).toBe(id);
    const rowJson = JSON.stringify(row).toLowerCase();
    expect(rowJson).not.toContain('anthropic');
    expect(rowJson).not.toContain('api_key');
    expect(rowJson).not.toContain('sk-');
    const persistedOptions = JSON.parse(String(row?.options_json)) as Record<string, unknown>;
    expect(persistedOptions.skipTriage).toBe(true);
  });

  it('BYOK (request creds) does not enqueue even with the executor bound', async () => {
    const id = `attr-byok-${Date.now()}`;
    const { accessToken } = await createInvestigation(testDb(), { id, status: 'active' });
    const { fetcher, calls } = makeStubExecutor(202);

    // BYOK request headers make credential source 'request'. The sync path then
    // runs runAttribution, which fails fast on the empty fake-R2 manifest; we
    // assert only that the request did NOT go async (no 202, no dispatch, no
    // job row). The sync path's own behavior is covered by tests/reasoner/*.
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/attribute`, {
        method: 'POST',
        headers: {
          'X-Investigation-Token': accessToken,
          'Content-Type': 'application/json',
          'X-AI-Gateway-Url': 'https://gateway.test/anthropic',
          'X-Anthropic-Api-Key': 'sk-byok-should-never-persist',
        },
        body: JSON.stringify({}),
      }),
      executorEnv(fetcher)
    );

    expect(res.status).not.toBe(202);
    expect(calls).toHaveLength(0);

    const count = await testDb()
      .prepare(`SELECT COUNT(*) AS n FROM attribution_jobs WHERE investigation_id = ?`)
      .bind(id)
      .first<{ n: number }>();
    expect(count?.n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: status poll endpoint
// ---------------------------------------------------------------------------

describe('GET /investigations/:id/attribution-jobs/:jobId', () => {
  async function seedJob(investigationId: string, jobId: string): Promise<void> {
    await testDb()
      .prepare(
        `INSERT INTO attribution_jobs
         (job_id, investigation_id, status, options_json, pair_count,
          container_name, started_at, completed_at, error_message, created_at)
         VALUES (?, ?, 'completed', ?, 5, 'common-thread-attribution', ?, ?, NULL, ?)`
      )
      .bind(
        jobId,
        investigationId,
        JSON.stringify({ skipTriage: false }),
        new Date().toISOString(),
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();
  }

  it('returns the job row for a valid token', async () => {
    const id = `attr-poll-${Date.now()}`;
    const jobId = `attrjob_poll-${Date.now()}`;
    const { accessToken } = await createInvestigation(testDb(), { id, status: 'active' });
    await seedJob(id, jobId);

    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/attribution-jobs/${jobId}`, {
        headers: { 'X-Investigation-Token': accessToken },
      }),
      env
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { job?: Record<string, unknown> };
    expect(body.job?.job_id).toBe(jobId);
    expect(body.job?.status).toBe('completed');
    expect(body.job?.pair_count).toBe(5);
    expect(body.job?.investigation_id).toBe(id);
  });

  it('returns 404 for an unknown job id', async () => {
    const id = `attr-poll-404-${Date.now()}`;
    const { accessToken } = await createInvestigation(testDb(), { id, status: 'active' });

    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/attribution-jobs/nope`, {
        headers: { 'X-Investigation-Token': accessToken },
      }),
      env
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for a job that belongs to a different investigation', async () => {
    const idA = `attr-poll-a-${Date.now()}`;
    const idB = `attr-poll-b-${Date.now()}`;
    const jobId = `attrjob_cross-${Date.now()}`;
    await createInvestigation(testDb(), { id: idA, status: 'active' });
    const b = await createInvestigation(testDb(), { id: idB, status: 'active' });
    await seedJob(idA, jobId);

    // idB's token querying idA's job under the idB path: WHERE clause misses.
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${idB}/attribution-jobs/${jobId}`, {
        headers: { 'X-Investigation-Token': b.accessToken },
      }),
      env
    );
    expect(res.status).toBe(404);
  });
});

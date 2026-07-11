/**
 * attribution_jobs status-transition tests (#69).
 *
 * Runs in the node-db project against real MySQL. Exercises the claim /
 * complete / fail helpers in implementation/attribution/jobs.ts and the
 * queued|running claim guard. Unique ids per test (shared MySQL state).
 */

import { describe, expect, it } from 'vitest';
import { testDb } from '../helpers/test-env';
import { createInvestigation } from '../helpers/db';
import {
  claimAttributionJob,
  completeAttributionJob,
  failAttributionJob,
} from '../../implementation/attribution/jobs';

interface JobRow {
  job_id: string;
  status: string;
  pair_count: number | null;
  container_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}

async function insertQueuedJob(investigationId: string, jobId: string): Promise<void> {
  await testDb()
    .prepare(
      `INSERT INTO attribution_jobs
       (job_id, investigation_id, status, options_json, created_at)
       VALUES (?, ?, 'queued', ?, ?)`
    )
    .bind(jobId, investigationId, JSON.stringify({ skipTriage: true }), new Date().toISOString())
    .run();
}

async function readJob(jobId: string): Promise<JobRow | null> {
  return testDb()
    .prepare(
      `SELECT job_id, status, pair_count, container_name,
              started_at, completed_at, error_message
       FROM attribution_jobs WHERE job_id = ?`
    )
    .bind(jobId)
    .first<JobRow>();
}

describe('attribution_jobs transitions', () => {
  it('claim moves queued -> running and records start + container', async () => {
    const investigationId = `inv_attrjob_claim-${Date.now()}`;
    const jobId = `attrjob_claim-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });
    await insertQueuedJob(investigationId, jobId);

    await claimAttributionJob(testDb(), jobId, 'test-container');

    const row = await readJob(jobId);
    expect(row?.status).toBe('running');
    expect(row?.started_at).toBeTruthy();
    expect(row?.container_name).toBe('test-container');
  });

  it('complete moves running -> completed with pair_count and null error', async () => {
    const investigationId = `inv_attrjob_done-${Date.now()}`;
    const jobId = `attrjob_done-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });
    await insertQueuedJob(investigationId, jobId);
    await claimAttributionJob(testDb(), jobId, 'c');

    await completeAttributionJob(testDb(), jobId, 7);

    const row = await readJob(jobId);
    expect(row?.status).toBe('completed');
    expect(row?.pair_count).toBe(7);
    expect(row?.completed_at).toBeTruthy();
    expect(row?.error_message).toBeNull();
  });

  it('fail moves running -> failed and persists the error message', async () => {
    const investigationId = `inv_attrjob_fail-${Date.now()}`;
    const jobId = `attrjob_fail-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });
    await insertQueuedJob(investigationId, jobId);
    await claimAttributionJob(testDb(), jobId, 'c');

    await failAttributionJob(testDb(), jobId, 'empty manifest: collect artifacts first');

    const row = await readJob(jobId);
    expect(row?.status).toBe('failed');
    expect(row?.completed_at).toBeTruthy();
    expect(row?.error_message).toContain('empty manifest');
  });

  it('fail truncates an over-long error to 4000 chars', async () => {
    const investigationId = `inv_attrjob_trunc-${Date.now()}`;
    const jobId = `attrjob_trunc-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });
    await insertQueuedJob(investigationId, jobId);

    await failAttributionJob(testDb(), jobId, 'x'.repeat(9000));

    const row = await readJob(jobId);
    expect(row?.status).toBe('failed');
    expect(row?.error_message?.length).toBe(4000);
  });

  it('claim does not resurrect a job already in a terminal state', async () => {
    const investigationId = `inv_attrjob_guard-${Date.now()}`;
    const jobId = `attrjob_guard-${Date.now()}`;
    await createInvestigation(testDb(), { id: investigationId });
    await insertQueuedJob(investigationId, jobId);
    await claimAttributionJob(testDb(), jobId, 'c');
    await completeAttributionJob(testDb(), jobId, 3);

    // A late duplicate dispatch must not flip completed back to running.
    await claimAttributionJob(testDb(), jobId, 'late-container');

    const row = await readJob(jobId);
    expect(row?.status).toBe('completed');
    expect(row?.pair_count).toBe(3);
    expect(row?.container_name).toBe('c');
  });
});

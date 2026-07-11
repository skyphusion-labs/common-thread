/**
 * Enqueue + dispatch an async attribution job.
 *
 * Mirrors the INSERT-then-dispatch shape of ingest (implementation/ingest/
 * apify-ingest.ts). Inserts a queued attribution_jobs row, then hands it to the
 * executor over VPC. If dispatch fails, the row is flipped to 'failed' with the
 * reason persisted so the failure is observable via the status endpoint rather
 * than left dangling in 'queued'.
 *
 * No credential is ever written to the row: options carries only non-secret run
 * parameters, and the executor uses its own server-side credentials.
 */

import { execute } from '../db';
import { dispatchAttributionJob, type AttributionDispatchEnv } from './dispatch';
import type { AttributionJobOptions } from './handoff';

export interface AttributionEnqueueEnv extends AttributionDispatchEnv {
  DB: Hyperdrive;
}

export interface EnqueuedAttributionJob {
  jobId: string;
  status: 'queued';
}

export async function enqueueAttributionJob(
  env: AttributionEnqueueEnv,
  investigationId: string,
  options: AttributionJobOptions
): Promise<EnqueuedAttributionJob> {
  const jobId = `attrjob_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await execute(
    env.DB,
    `INSERT INTO attribution_jobs
     (job_id, investigation_id, status, options_json, created_at)
     VALUES (?, ?, 'queued', ?, ?)`,
    [jobId, investigationId, JSON.stringify(options ?? {}), now]
  );

  let dispatchResponse: Response;
  try {
    dispatchResponse = await dispatchAttributionJob(env, {
      jobId,
      investigationId,
      options: options ?? {},
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(env, jobId, `Attribution worker dispatch error: ${message}`);
    throw err;
  }

  if (!dispatchResponse.ok) {
    const detail = await dispatchResponse.text().catch(() => '');
    await markFailed(
      env,
      jobId,
      `Attribution worker dispatch failed: ${dispatchResponse.status} ${detail}`
    );
    throw new Error(
      `Attribution worker dispatch failed: ${dispatchResponse.status}`
    );
  }

  return { jobId, status: 'queued' };
}

async function markFailed(
  env: AttributionEnqueueEnv,
  jobId: string,
  reason: string
): Promise<void> {
  await execute(
    env.DB,
    `UPDATE attribution_jobs SET status = 'failed', completed_at = ?, error_message = ? WHERE job_id = ?`,
    [new Date().toISOString(), reason.slice(0, 4000), jobId]
  );
}

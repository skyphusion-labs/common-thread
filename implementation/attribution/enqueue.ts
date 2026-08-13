/**
 * Enqueue + dispatch an async attribution job.
 *
 * Mirrors the INSERT-then-dispatch shape of ingest (implementation/ingest/
 * apify-ingest.ts). Inserts a queued attribution_jobs row, then hands it to the
 * executor over VPC. If dispatch fails, the row is flipped to 'failed' with the
 * reason persisted so the failure is observable via the status endpoint rather
 * than left dangling in 'queued'.
 *
 * No AI credential is ever written to the row: options carries only non-secret
 * run parameters, and the executor uses its own server-side AI credentials.
 * Investigation encryption key material (#246) is sent only in the VPC handoff
 * body -- never in options_json / attribution_jobs.
 */

import { execute } from '../db';
import { dispatchAttributionJob, type AttributionDispatchEnv } from './dispatch';
import type { AttributionJobOptions } from './handoff';
import { sanitizeJobErrorMessage } from '../workers/job-error';

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
  options: AttributionJobOptions,
  /**
   * Transient encryption key material for encrypted investigations (#246).
   * Passed only to the VPC handoff; never written to the jobs table.
   */
  encryptionKeyMaterial?: string
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
      encryptionKeyMaterial,
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
    [new Date().toISOString(), sanitizeJobErrorMessage(reason), jobId]
  );
}

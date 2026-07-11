/**
 * attribution_jobs status-transition helpers.
 *
 * Mirrors implementation/ingest/jobs.ts. The executor claims a queued job,
 * then marks it completed or failed. Partial work is preserved regardless: the
 * reasoner writes one attribution_runs row per pair as it goes (per-pair
 * isolation, #96/#88), so a mid-run failure still leaves the finished pairs
 * behind. The job row records only the terminal outcome.
 */

import type { DatabaseClient } from '../db';

const MAX_ERROR_LEN = 4000;

/**
 * Claim a job for execution: queued|running -> running, recording the start
 * time and executing container. Guarded so a job already in a terminal state
 * is not resurrected.
 */
export async function claimAttributionJob(
  db: DatabaseClient,
  jobId: string,
  containerName?: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE attribution_jobs
       SET status = 'running', started_at = ?, container_name = COALESCE(?, container_name)
       WHERE job_id = ? AND status IN ('queued', 'running')`
    )
    .bind(now, containerName ?? null, jobId)
    .run();
}

/** Terminal success: -> completed, recording the pair count and clearing any error. */
export async function completeAttributionJob(
  db: DatabaseClient,
  jobId: string,
  pairCount: number
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE attribution_jobs
       SET status = 'completed',
           completed_at = ?,
           pair_count = ?,
           error_message = NULL
       WHERE job_id = ?`
    )
    .bind(now, pairCount, jobId)
    .run();
}

/** Terminal failure: -> failed, persisting a truncated error message. */
export async function failAttributionJob(
  db: DatabaseClient,
  jobId: string,
  errorMessage: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE attribution_jobs
       SET status = 'failed', completed_at = ?, error_message = ?
       WHERE job_id = ?`
    )
    .bind(now, errorMessage.slice(0, MAX_ERROR_LEN), jobId)
    .run();
}

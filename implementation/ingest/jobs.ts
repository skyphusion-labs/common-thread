import type { DatabaseClient } from '../db';

export async function claimIngestJob(
  db: DatabaseClient,
  jobId: string,
  containerName?: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE ingest_jobs
       SET status = 'running', started_at = ?, container_name = COALESCE(?, container_name)
       WHERE job_id = ? AND status IN ('queued', 'running')`
    )
    .bind(now, containerName ?? null, jobId)
    .run();
}

export async function completeIngestJob(
  db: DatabaseClient,
  jobId: string,
  manifestHashes: string[]
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE ingest_jobs
       SET status = 'completed',
           completed_at = ?,
           manifest_hashes = ?,
           error_message = NULL
       WHERE job_id = ?`
    )
    .bind(now, JSON.stringify(manifestHashes), jobId)
    .run();
}

export async function failIngestJob(
  db: DatabaseClient,
  jobId: string,
  errorMessage: string
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE ingest_jobs
       SET status = 'failed', completed_at = ?, error_message = ?
       WHERE job_id = ?`
    )
    .bind(now, errorMessage.slice(0, 4000), jobId)
    .run();
}

import type { IngestJobHandoff } from './handoff';

export interface IngestDispatchEnv {
  VPC_INGEST?: Fetcher;
  INGEST_WORKER_URL?: string;
  /** Required when dispatching to the ingest container. */
  INGEST_SECRET?: string;
}

/**
 * POST an ingest job to the self-hosted extraction container over Workers VPC.
 *
 * INGEST_WORKER_URL host must match the VPC service hostname
 * (e.g. http://common-thread-ingest.internal/trigger).
 */
export async function dispatchIngestJob(
  env: IngestDispatchEnv,
  handoff: IngestJobHandoff
): Promise<Response> {
  if (!env.VPC_INGEST) {
    throw new Error('VPC_INGEST binding is not configured');
  }
  if (!env.INGEST_WORKER_URL) {
    throw new Error('INGEST_WORKER_URL variable is not configured');
  }
  if (!env.INGEST_SECRET) {
    throw new Error('INGEST_SECRET is not configured');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.INGEST_SECRET}`,
  };

  return env.VPC_INGEST.fetch(env.INGEST_WORKER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(handoff),
  });
}

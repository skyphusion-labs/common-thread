import type { IngestJobHandoff } from './handoff';

export interface IngestDispatchEnv {
  VPC_INGEST?: Fetcher;
  INGEST_WORKER_URL?: string;
  INGEST_SECRET?: string;
}

/**
 * POST an ingest job to the self-hosted Docker worker over Workers VPC.
 *
 * Use a VPC Service binding. INGEST_WORKER_URL host must match the service
 * hostname (e.g. http://json_ingest/trigger); routing is by service_id.
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (env.INGEST_SECRET) {
    headers['Authorization'] = `Bearer ${env.INGEST_SECRET}`;
  }

  return env.VPC_INGEST.fetch(env.INGEST_WORKER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(handoff),
  });
}

/**
 * Workers VPC dispatch for the self-hosted attribution executor.
 *
 * Mirrors implementation/ingest/dispatch.ts. The Worker POSTs an
 * AttributionJobHandoff to the executor container over the VPC binding; the
 * container returns 202 immediately and processes the job asynchronously.
 */

import type { AttributionJobHandoff } from './handoff';

export interface AttributionDispatchEnv {
  /** Workers VPC binding to the self-hosted attribution container. */
  VPC_ATTRIBUTION?: Fetcher;
  /** Full URL for VPC_ATTRIBUTION.fetch(), e.g. http://common-thread-attribution:8082/trigger */
  ATTRIBUTION_WORKER_URL?: string;
  /** Bearer token shared with the executor (wrangler secret put ATTRIBUTION_SECRET). */
  ATTRIBUTION_SECRET?: string;
}

/** True when all three async-executor bindings are present. */
export function attributionExecutorEnabled(env: AttributionDispatchEnv): boolean {
  return Boolean(
    env.VPC_ATTRIBUTION && env.ATTRIBUTION_WORKER_URL && env.ATTRIBUTION_SECRET
  );
}

/**
 * Decide whether POST /attribute runs asynchronously. Async only when the run
 * uses server-side credentials (source 'environment') AND the executor is
 * bound. BYOK requests (source 'request') always stay on the synchronous inline
 * path so a user-supplied key never outlives the request or reaches the
 * executor (Conrad, 2026-07-11). Without the executor bound (local dev, tests)
 * everything stays inline, preserving current behavior.
 */
export function shouldRunAttributionAsync(
  env: AttributionDispatchEnv,
  credentialSource: 'request' | 'environment'
): boolean {
  return credentialSource === 'environment' && attributionExecutorEnabled(env);
}

/**
 * POST an attribution job to the executor container over Workers VPC.
 *
 * ATTRIBUTION_WORKER_URL host must match the VPC service hostname
 * (e.g. http://common-thread-attribution:8082/trigger).
 */
export async function dispatchAttributionJob(
  env: AttributionDispatchEnv,
  handoff: AttributionJobHandoff
): Promise<Response> {
  if (!env.VPC_ATTRIBUTION) {
    throw new Error('VPC_ATTRIBUTION binding is not configured');
  }
  if (!env.ATTRIBUTION_WORKER_URL) {
    throw new Error('ATTRIBUTION_WORKER_URL variable is not configured');
  }
  if (!env.ATTRIBUTION_SECRET) {
    throw new Error('ATTRIBUTION_SECRET is not configured');
  }

  return env.VPC_ATTRIBUTION.fetch(env.ATTRIBUTION_WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.ATTRIBUTION_SECRET}`,
    },
    body: JSON.stringify(handoff),
  });
}

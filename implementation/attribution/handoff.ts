/**
 * Payload POSTed to the self-hosted attribution executor via Workers VPC HTTP.
 *
 * Mirrors implementation/ingest/handoff.ts. It carries only the non-secret run
 * parameters the executor needs to reconstruct the attribution run. Per Conrad's
 * 2026-07-11 decision, credentials are NEVER included: the async path runs with
 * the executor's own server-side AI_GATEWAY_URL / ANTHROPIC_API_KEY, so no
 * user-supplied (BYOK) key is ever handed to the container.
 */

/** Non-secret run parameters, a subset of reasoner RunAttributionOptions. */
export interface AttributionJobOptions {
  /** Restrict to this subset of seed accounts. */
  accountFilter?: string[];
  /** Bypass triage and reason on every pair. */
  skipTriage?: boolean;
  /** Maximum reasoning retry attempts per section 7.2.3. */
  maxRetries?: number;
  /** Fixed signal-order randomization seed for deterministic replays. */
  randomizationSeed?: string;
}

export interface AttributionJobHandoff {
  jobId: string;
  investigationId: string;
  options: AttributionJobOptions;
}

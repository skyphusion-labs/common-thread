/**
 * Payload POSTed to the self-hosted attribution executor via Workers VPC HTTP.
 *
 * Mirrors implementation/ingest/handoff.ts. AI credentials are NEVER included:
 * the async path runs with the executor's own server-side AI_GATEWAY_URL /
 * ANTHROPIC_API_KEY / CF_AIG_TOKEN, so no user-supplied (BYOK) AI key is ever
 * handed to the container (Conrad, 2026-07-11).
 *
 * Investigation encryption key material MAY be included for encrypted
 * investigations (#246) so the container can write encrypted conclusions /
 * metadata. That material is transient VPC-only and is never AI credentials.
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
  /**
   * Envelope-sealed investigation encryption key for encrypted invs (#246).
   * Format: `inv-enc-handoff:v1:<base64url>` (AES-GCM under a key derived from
   * ATTRIBUTION_SECRET + investigationId). Never written to attribution_jobs.
   * Omit for legacy plaintext investigations.
   */
  encryptionKeyMaterial?: string;
}

/** Payload POSTed to the self-hosted ingest worker via Workers VPC HTTP. */
export interface IngestJobHandoff {
  jobId: string;
  investigationId: string;
  provider: 'twitter' | 'instagram' | 'reddit' | 'bluesky' | 'mastodon' | 'tiktok' | 'youtube' | 'facebook' | 'mixed';
  rawFileHash: string;
  itemCount: number;
  accounts: string[];
  /**
   * Base URL for manifest appends through the Worker DO proxy (#110).
   * Example: https://common-thread-backend.skyphusion.org/internal/manifest
   */
  manifestAppendBaseUrl?: string;
  /**
   * Envelope-sealed investigation encryption key for encrypted invs (#246).
   * Format: `inv-enc-handoff:v1:<base64url>` (AES-GCM under a key derived from
   * INGEST_SECRET + investigationId). Sent only over bearer-authenticated VPC;
   * NEVER written to ingest_jobs or any durable store. Omit for plaintext invs.
   */
  encryptionKeyMaterial?: string;
}

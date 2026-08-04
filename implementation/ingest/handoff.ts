/** Payload POSTed to the self-hosted ingest worker via Workers VPC HTTP. */
export interface IngestJobHandoff {
  jobId: string;
  investigationId: string;
  provider: 'twitter';
  rawFileHash: string;
  itemCount: number;
  accounts: string[];
  /**
   * Base URL for manifest appends through the Worker DO proxy (#110).
   * Example: https://common-thread-backend.skyphusion.org/internal/manifest
   */
  manifestAppendBaseUrl?: string;
  /**
   * Transient AES-256 key material for encrypted investigations (#246).
   * Format: `inv-enc-key:v1:<base64url>`. Sent only over bearer-authenticated
   * VPC; NEVER written to ingest_jobs or any durable store. Omit for legacy
   * plaintext investigations.
   */
  encryptionKeyMaterial?: string;
}

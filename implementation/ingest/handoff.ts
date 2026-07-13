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
}

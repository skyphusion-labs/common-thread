/** Payload POSTed to the self-hosted ingest worker via Workers VPC HTTP. */
export interface IngestJobHandoff {
  jobId: string;
  investigationId: string;
  provider: 'twitter';
  rawFileHash: string;
  itemCount: number;
  accounts: string[];
}

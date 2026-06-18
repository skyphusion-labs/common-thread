/** Payload POSTed to the self-hosted ingest worker via Workers VPC HTTP. */
export interface IngestJobHandoff {
  jobId: string;
  investigationId: string;
  provider: 'twitter';
  rawFileHash: string;
  /** Forwarded from ?runExtractors=true */
  runExtractors: boolean;
  itemCount: number;
  accounts: string[];
}

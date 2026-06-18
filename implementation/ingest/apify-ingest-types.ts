export interface ApifyIngestResult {
  investigationId: string;
  rawPayloadHash: string;
  tweetsProcessed: number;
  uniqueAccounts: number;
  artifactsCreated: number;
  seedsRegistered: number;
  jobId?: string;
  /** True when the job was handed off to the self-hosted extraction container. */
  delegatedToContainer?: boolean;
  extractorsRan: boolean;
  accountExtractorRuns?: unknown[];
  eventExtractorRuns?: unknown[];
  pairExtractorRuns?: unknown[];
  engagementPairExtractorRuns?: unknown[];
  pairExtractorsSkipped?: boolean;
  pairExtractorsSkippedReason?: string;
}

/**
 * Common Thread archive types.
 *
 * The archive holds raw artifacts collected from platforms before any
 * transformation. Each artifact is content-addressed by SHA-256 hash.
 * The manifest is the append-only index of what was collected, when,
 * by what method, and under what investigation.
 *
 * See methodology paper §3.1 (chain of custody) and §5.4 (archival).
 */

/**
 * A single entry in the manifest. Each entry describes one artifact
 * (or one tombstone for an artifact that has become inaccessible at source).
 */
export interface ManifestEntry {
  /** SHA-256 hash of the artifact, lowercase hex, 64 chars. */
  hash: string;

  /** Source URL or identifier from which the artifact was collected. */
  source: string;

  /** Collection timestamp, ISO 8601 UTC. */
  collectedAt: string;

  /** Collection method: tool name, version, and configuration. */
  collectionMethod: {
    tool: string;
    version: string;
    config?: Record<string, unknown>;
  };

  /** Investigation identifier. */
  investigationId: string;

  /** Optional. The seed account this artifact relates to. */
  account?: string;

  /**
   * Optional. The first-degree network account this artifact relates to.
   * Used for follower-list collection where the artifact is data ABOUT a
   * seed account from the perspective of an adjacent account.
   */
  relatedAccount?: string;

  /**
   * Optional. Platform-supplied metadata that came with the artifact but
   * is not embedded in the artifact bytes (e.g. API response headers,
   * platform-internal IDs).
   */
  platformMetadata?: Record<string, unknown>;

  /**
   * 'present' for normal collection entries.
   * 'absent' for tombstones (re-collection found the artifact missing
   * at source; the original archived bytes still exist in the archive).
   */
  status: 'present' | 'absent';

  /**
   * Required for tombstones (status='absent'). The hash of the originally
   * collected artifact that is now absent at source.
   */
  tombstoneOf?: string;

  /**
   * Optional. For corrections: hash of the manifest entry being superseded.
   * Per §5.4.3, manifest entries are append-only; corrections take the form
   * of new entries that reference the superseded entry.
   */
  supersedes?: string;

  /** Optional. MIME type, if known. */
  mimeType?: string;

  /** Optional. Size in bytes, if known. */
  size?: number;
}

/** Result of writing an artifact to the archive. */
export interface ArchiveWriteResult {
  /** SHA-256 hash of the written bytes. */
  hash: string;

  /** Content-addressed path under which the artifact is stored. */
  path: string;

  /**
   * True if the artifact was newly written; false if an artifact with
   * the same hash was already present (in which case the existing
   * artifact is treated as the result, since content-addressed
   * storage guarantees byte equivalence).
   */
  newlyWritten: boolean;

  /** Size in bytes. */
  size: number;
}

/** Result of reading an artifact from the archive. */
export interface ArchiveReadResult {
  /** The artifact bytes. */
  bytes: Uint8Array;

  /** Content-addressed path from which the artifact was read. */
  path: string;

  /** SHA-256 hash (matches the requested hash; verified on read). */
  hash: string;

  /** Size in bytes. */
  size: number;
}

/** Filter for querying manifest entries. */
export interface ManifestFilter {
  investigationId?: string;
  account?: string;
  status?: 'present' | 'absent';
  collectedAfter?: string;
  collectedBefore?: string;
  hash?: string;
}

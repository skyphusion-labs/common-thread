/**
 * Manifest: append-only JSONL log of artifacts collected for investigations.
 *
 * The manifest is the index that makes the archive queryable. Per §3.1.2
 * and §5.4.3 of the methodology paper:
 *
 *   - Line-oriented JSON, one record per line (.jsonl format)
 *   - Append-only: existing entries are never mutated
 *   - Corrections take the form of new entries that supersede prior
 *     entries with a reference to the superseded entry's hash
 *
 * Atomicity caveat: R2 does not provide native append. This implementation
 * performs append by reading the current manifest, concatenating the new
 * entry, and writing the result. Concurrent appends from multiple Worker
 * instances can produce last-write-wins races that lose entries. For v1,
 * the recommendation is to serialize appends through a single Worker
 * instance per investigation (a Durable Object would be the natural
 * primitive for this if scaling beyond single-Worker becomes needed).
 */

import { sha256 } from './hash';
import { investigationManifestPath } from './paths';
import type { R2BucketLike } from './store';
import type { ManifestEntry, ManifestFilter } from './types';

export interface ManifestStoreOptions {
  /** R2 bucket binding. */
  bucket: R2BucketLike;

  /**
   * Scope storage to one investigation. Preferred for all production use;
   * manifests are keyed per investigation in R2.
   */
  investigationId?: string;

  /**
   * Path to the manifest JSONL file in the bucket.
   * Use only for tests or migration tooling; production code should pass
   * investigationId instead.
   */
  manifestPath?: string;
}

export class ManifestStore {
  private readonly manifestPath: string;
  private readonly investigationId?: string;

  constructor(private readonly options: ManifestStoreOptions) {
    if (options.manifestPath && options.investigationId) {
      throw new Error('ManifestStore: pass investigationId or manifestPath, not both');
    }
    this.investigationId = options.investigationId;
    this.manifestPath =
      options.manifestPath ??
      (options.investigationId
        ? investigationManifestPath(options.investigationId)
        : 'manifest.jsonl');
  }

  /**
   * Append an entry to the manifest. The manifest is append-only;
   * existing entries are never modified.
   *
   * @param entry - The manifest entry to append
   * @throws Error if the entry fails validation
   */
  async append(entry: ManifestEntry): Promise<void> {
    this.validateEntry(entry);
    if (this.investigationId && entry.investigationId !== this.investigationId) {
      throw new Error(
        `Manifest entry investigationId ${entry.investigationId} does not match store scope ${this.investigationId}`
      );
    }
    const line = JSON.stringify(entry) + '\n';

    const existing = await this.options.bucket.get(this.manifestPath);
    const existingBytes = existing
      ? new Uint8Array(await existing.arrayBuffer())
      : new Uint8Array(0);

    const newLineBytes = new TextEncoder().encode(line);
    const combined = new Uint8Array(existingBytes.length + newLineBytes.length);
    combined.set(existingBytes, 0);
    combined.set(newLineBytes, existingBytes.length);

    await this.options.bucket.put(this.manifestPath, combined, {
      httpMetadata: { contentType: 'application/x-ndjson' },
    });
  }

  /**
   * Read all manifest entries, optionally filtered.
   *
   * Malformed lines are skipped rather than causing the whole read to fail.
   * The methodology accepts that an unparseable line is preferable to losing
   * access to the rest of the manifest; investigations into corruption are
   * the practitioner's responsibility separate from routine reads.
   *
   * @param filter - Optional filter to apply
   * @returns Array of matching manifest entries (preserves insertion order)
   */
  async list(filter?: ManifestFilter): Promise<ManifestEntry[]> {
    const object = await this.options.bucket.get(this.manifestPath);
    if (!object) {
      return [];
    }

    const text = await object.text();
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    const entries: ManifestEntry[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as ManifestEntry;
        if (filter && !this.matches(entry, filter)) continue;
        entries.push(entry);
      } catch {
        // Skip malformed lines. Corruption is investigated separately.
      }
    }

    return entries;
  }

  /**
   * Compute the SHA-256 hash of the current manifest content.
   * Used as input to signing (see §3.1.3, deferred to v1.1).
   *
   * @returns Hash of the manifest bytes, or null if the manifest is empty
   */
  async manifestHash(): Promise<string | null> {
    const object = await this.options.bucket.get(this.manifestPath);
    if (!object) {
      return null;
    }
    const bytes = new Uint8Array(await object.arrayBuffer());
    return sha256(bytes);
  }

  /**
   * Find entries that supersede a given entry hash.
   * Used for tracing the correction chain when reconstructing the
   * authoritative state of a manifest record.
   *
   * @param entryHash - The hash of the entry potentially being superseded
   * @returns Entries whose `supersedes` field points to the given hash
   */
  async findSupersessions(entryHash: string): Promise<ManifestEntry[]> {
    const all = await this.list();
    return all.filter(e => e.supersedes === entryHash);
  }

  /**
   * Find the tombstone for a given artifact hash, if one exists.
   * A tombstone indicates that re-collection found the artifact missing
   * at source after some point.
   *
   * @param artifactHash - The hash of the original artifact
   * @returns The tombstone entry, or null if no tombstone exists
   */
  async findTombstone(artifactHash: string): Promise<ManifestEntry | null> {
    const all = await this.list();
    const tombstones = all.filter(
      e => e.status === 'absent' && e.tombstoneOf === artifactHash
    );
    if (tombstones.length === 0) return null;
    // Return the earliest tombstone. Later tombstones for the same artifact
    // are tolerated (re-collection events may be repeated) but the first
    // one establishes the deletion event.
    return tombstones.reduce((earliest, current) =>
      current.collectedAt < earliest.collectedAt ? current : earliest
    );
  }

  private validateEntry(entry: ManifestEntry): void {
    if (!entry.hash) {
      throw new Error('ManifestEntry.hash is required');
    }
    if (!/^[0-9a-f]{64}$/.test(entry.hash)) {
      throw new Error(`ManifestEntry.hash must be lowercase SHA-256 hex: ${entry.hash}`);
    }
    if (!entry.source) {
      throw new Error('ManifestEntry.source is required');
    }
    if (!entry.collectedAt) {
      throw new Error('ManifestEntry.collectedAt is required');
    }
    if (!entry.investigationId) {
      throw new Error('ManifestEntry.investigationId is required');
    }
    if (!entry.collectionMethod || !entry.collectionMethod.tool) {
      throw new Error('ManifestEntry.collectionMethod.tool is required');
    }
    if (!entry.collectionMethod.version) {
      throw new Error('ManifestEntry.collectionMethod.version is required');
    }
    if (entry.status !== 'present' && entry.status !== 'absent') {
      throw new Error(
        `ManifestEntry.status must be 'present' or 'absent', got: ${String(entry.status)}`
      );
    }
    if (entry.status === 'absent' && !entry.tombstoneOf) {
      throw new Error("Tombstone entries (status='absent') must specify tombstoneOf");
    }
    if (entry.tombstoneOf && !/^[0-9a-f]{64}$/.test(entry.tombstoneOf)) {
      throw new Error(`ManifestEntry.tombstoneOf must be lowercase SHA-256 hex: ${entry.tombstoneOf}`);
    }
    if (entry.supersedes && !/^[0-9a-f]{64}$/.test(entry.supersedes)) {
      throw new Error(`ManifestEntry.supersedes must be lowercase SHA-256 hex: ${entry.supersedes}`);
    }
  }

  private matches(entry: ManifestEntry, filter: ManifestFilter): boolean {
    if (filter.investigationId && entry.investigationId !== filter.investigationId) return false;
    if (filter.account && entry.account !== filter.account) return false;
    if (filter.status && entry.status !== filter.status) return false;
    if (filter.collectedAfter && entry.collectedAt < filter.collectedAfter) return false;
    if (filter.collectedBefore && entry.collectedAt > filter.collectedBefore) return false;
    if (filter.hash && entry.hash !== filter.hash) return false;
    return true;
  }
}

/**
 * Archive store: content-addressed read/write to R2.
 *
 * Implements the chain-of-custody primitive from the Common Thread
 * methodology paper, §3.1 and §5.4. Writes are atomic in the
 * content-addressed sense: the path is determined entirely by the
 * hash of the bytes, so partial writes cannot produce a corrupt
 * artifact at a valid path. Reads verify byte integrity against
 * the expected hash.
 */

import { sha256, isValidSha256Hex } from './hash';
import { pathForHash, extensionForMimeType } from './paths';
import type { ArchiveWriteResult, ArchiveReadResult } from './types';

/**
 * R2Bucket type. Cloudflare's Workers types declare R2Bucket globally;
 * if your environment doesn't, this minimal interface covers the
 * methods this module uses.
 */
export interface R2BucketLike {
  head(key: string): Promise<{ size: number } | null>;
  get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> } | null>;
  put(
    key: string,
    value: Uint8Array | ArrayBuffer | string,
    options?: {
      httpMetadata?: { contentType?: string };
      onlyIf?: { etagDoesNotMatch?: string };
    }
  ): Promise<unknown | null>;
}

export interface ArchiveStoreOptions {
  /** R2 bucket binding. */
  bucket: R2BucketLike;
}

export interface PutOptions {
  /** Optional MIME type to set on the stored object. */
  mimeType?: string;

  /**
   * Optional file extension to include in the path (e.g. 'json', 'html', 'png').
   * If provided, the artifact is stored at sha256/ab/cd/<hash>.ext rather than
   * sha256/ab/cd/<hash>.
   */
  extension?: string;
}

export class ArchiveStore {
  constructor(private readonly options: ArchiveStoreOptions) {}

  /**
   * Write bytes to the archive.
   *
   * The write is atomic in the content-addressed sense: the path is
   * determined by the hash of the bytes, so a partial write cannot
   * produce a corrupt artifact at a valid path. If the write fails
   * partway, the path simply doesn't exist.
   *
   * If an artifact with the same hash is already present, the write
   * is a no-op and the existing artifact is treated as the result.
   * This is correct behavior for content-addressed storage: same
   * bytes produce the same hash, the same path, and the same artifact.
   *
   * @param bytes - The artifact bytes to write
   * @param options - Optional MIME type and file extension
   * @returns Hash, path, and whether the artifact was newly written
   */
  async put(bytes: Uint8Array, options: PutOptions = {}): Promise<ArchiveWriteResult> {
    const hash = await sha256(bytes);
    const path = pathForHash(hash, options.extension);

    // Fast path: artifact already present.
    const existing = await this.options.bucket.head(path);
    if (existing) {
      return {
        hash,
        path,
        newlyWritten: false,
        size: existing.size,
      };
    }

    // Write with onlyIf to prevent race-condition double-writes.
    // If another writer creates the same path between our head() and our put(),
    // the put() will return null and we treat it as not-newly-written.
    const httpMetadata: { contentType?: string } = {};
    if (options.mimeType) {
      httpMetadata.contentType = options.mimeType;
    }

    const result = await this.options.bucket.put(path, bytes, {
      httpMetadata,
      onlyIf: { etagDoesNotMatch: '*' },
    });

    if (result === null) {
      // Race: another writer created the artifact between our head() and
      // our put(). Since the artifact is content-addressed, the existing
      // bytes are identical to ours by construction, so this is still
      // operationally a success.
      const existingAfterRace = await this.options.bucket.head(path);
      return {
        hash,
        path,
        newlyWritten: false,
        size: existingAfterRace?.size ?? bytes.length,
      };
    }

    return {
      hash,
      path,
      newlyWritten: true,
      size: bytes.length,
    };
  }

  /**
   * Read an artifact by hash. Verifies that the retrieved bytes hash
   * to the expected hash; throws if verification fails (which indicates
   * archive corruption and should be investigated immediately).
   *
   * @param hash - SHA-256 hex string of the artifact to retrieve
   * @param extension - Optional extension if the artifact was stored with one
   * @returns ArchiveReadResult with the bytes, or null if not found
   * @throws Error if the artifact exists but bytes don't match the hash
   */
  async get(hash: string, extension?: string): Promise<ArchiveReadResult | null> {
    if (!isValidSha256Hex(hash)) {
      throw new Error(`Invalid SHA-256 hash: ${hash}`);
    }

    const path = pathForHash(hash, extension);
    const object = await this.options.bucket.get(path);
    if (!object) {
      return null;
    }

    const bytes = new Uint8Array(await object.arrayBuffer());

    // Verify the bytes hash to the expected hash. This protects against
    // archive corruption (bit rot, mistaken upload, deliberate tampering).
    // The cost of verification is the cost of one SHA-256 over the bytes
    // we just read, which is fast and is the point of content-addressing.
    const actualHash = await sha256(bytes);
    if (actualHash !== hash) {
      throw new Error(
        `Archive integrity error: artifact at ${path} hashes to ${actualHash}, expected ${hash}`
      );
    }

    return {
      bytes,
      path,
      hash,
      size: bytes.length,
    };
  }

  /**
   * Read an artifact for a manifest entry, tolerant of the storage-path
   * extension. The content address is the hash (§3.1); the extension is
   * only a path suffix. Writers store artifacts with an extension (e.g.
   * '.json'), but the extension is not carried on the manifest entry, so a
   * reader that reconstructs the bare-hash path misses the object. This
   * resolves the object by trying, in order: an extension derived from the
   * entry's mimeType, then the bare hash (legacy layout). The first match
   * wins. Existing '.json'-keyed objects stay reachable (their entries
   * record mimeType 'application/json'), and reads no longer depend on the
   * reader guessing the writer's suffix.
   *
   * Returns null only when the artifact is genuinely absent under every
   * candidate path; callers treat that as a missing artifact, not a silent
   * skip.
   *
   * @param entry - Manifest entry (hash required; mimeType optional)
   * @returns ArchiveReadResult with the bytes, or null if not found
   * @throws Error if the artifact exists but bytes don't match the hash
   */
  async getForEntry(entry: {
    hash: string;
    mimeType?: string;
  }): Promise<ArchiveReadResult | null> {
    const candidates: Array<string | undefined> = [];
    const fromMime = extensionForMimeType(entry.mimeType);
    if (fromMime) candidates.push(fromMime);
    candidates.push(undefined); // bare-hash legacy layout

    const tried = new Set<string>();
    for (const ext of candidates) {
      const key = ext ?? '';
      if (tried.has(key)) continue;
      tried.add(key);
      const found = await this.get(entry.hash, ext);
      if (found) return found;
    }
    return null;
  }

  /**
   * Check if an artifact exists in the archive without reading the bytes.
   *
   * @param hash - SHA-256 hex string of the artifact
   * @param extension - Optional extension if the artifact was stored with one
   * @returns true if the artifact is present, false otherwise
   */
  async exists(hash: string, extension?: string): Promise<boolean> {
    if (!isValidSha256Hex(hash)) {
      throw new Error(`Invalid SHA-256 hash: ${hash}`);
    }

    const path = pathForHash(hash, extension);
    const head = await this.options.bucket.head(path);
    return head !== null;
  }
}

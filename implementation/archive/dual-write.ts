/**
 * Optional dual-write wrapper for archive R2 (§5.4.4).
 *
 * When ARCHIVE_DUAL_WRITE is enabled and ARCHIVE_REPLICA is bound, every
 * mutating call is applied to the primary ARCHIVE bucket and then to the
 * replica. Reads always use the primary (authoritative for the Worker).
 *
 * Default deploys leave the flag unset / replica unbound and behave exactly
 * as before (single-bucket). Operator-managed rclone sync remains valid;
 * this path is for deployments that want synchronous second-bucket writes.
 */

import type { R2BucketLike } from './store';

export interface DualWriteEnv {
  ARCHIVE: R2BucketLike;
  /** Optional second R2 bucket for synchronous replication. */
  ARCHIVE_REPLICA?: R2BucketLike;
  /**
   * Set to "true" or "1" to enable dual-write. Requires ARCHIVE_REPLICA.
   * Any other value (or unset) keeps single-bucket behavior.
   */
  ARCHIVE_DUAL_WRITE?: string;
}

export function isArchiveDualWriteEnabled(env: DualWriteEnv): boolean {
  const flag = (env.ARCHIVE_DUAL_WRITE ?? '').trim().toLowerCase();
  return (flag === 'true' || flag === '1') && env.ARCHIVE_REPLICA != null;
}

/**
 * Return the bucket callers should use for archive I/O. When dual-write is
 * off, returns the primary binding unchanged (no wrapper allocation).
 */
export function resolveArchiveBucket(env: DualWriteEnv): R2BucketLike {
  if (!isArchiveDualWriteEnabled(env)) {
    return env.ARCHIVE;
  }
  return new DualWriteBucket(env.ARCHIVE, env.ARCHIVE_REPLICA!);
}

type PutOptions = {
  httpMetadata?: { contentType?: string };
  onlyIf?: { etagDoesNotMatch?: string };
};

/**
 * Structural R2 surface used by ArchiveStore / ManifestStore / purge.
 * Extends R2BucketLike with delete for investigation purge.
 */
export interface DualWriteBucketLike extends R2BucketLike {
  delete?(key: string): Promise<void>;
}

export class DualWriteBucket implements DualWriteBucketLike {
  constructor(
    private readonly primary: DualWriteBucketLike,
    private readonly replica: DualWriteBucketLike
  ) {}

  head(key: string): Promise<{ size: number } | null> {
    return this.primary.head(key);
  }

  get(
    key: string
  ): Promise<{ arrayBuffer(): Promise<ArrayBuffer>; text(): Promise<string> } | null> {
    return this.primary.get(key);
  }

  async put(
    key: string,
    value: Uint8Array | ArrayBuffer | string,
    options?: PutOptions
  ): Promise<unknown | null> {
    const primaryResult = await this.primary.put(key, value, options);

    // Mirror to replica. Content-addressed puts use onlyIf create-if-absent;
    // a null return on the replica means the object already exists there
    // (same bytes by construction) and is still a success.
    const replicaResult = await this.replica.put(key, value, options);
    if (replicaResult === null && options?.onlyIf?.etagDoesNotMatch === '*') {
      // Ensure replica has the object even if a prior primary-only write
      // left it behind: unconditional put when create-only raced.
      const missing = (await this.replica.head(key)) === null;
      if (missing) {
        await this.replica.put(key, value, {
          httpMetadata: options.httpMetadata,
        });
      }
    } else if (replicaResult === null && primaryResult !== null) {
      // Non-conditional put returned null unexpectedly; force-write.
      await this.replica.put(key, value, {
        httpMetadata: options?.httpMetadata,
      });
    }

    return primaryResult;
  }

  async delete(key: string): Promise<void> {
    const primaryDelete = this.primary.delete?.bind(this.primary);
    const replicaDelete = this.replica.delete?.bind(this.replica);
    if (primaryDelete) await primaryDelete(key);
    if (replicaDelete) await replicaDelete(key);
  }
}

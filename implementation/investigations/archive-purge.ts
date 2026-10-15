/**
 * Remove per-investigation archive objects from R2.
 *
 * Encrypted artifact bytes live under investigations/{id}/artifacts/ and are
 * not shared. Purge deletes that prefix when the bucket can list it.
 * Legacy plaintext blobs under sha256/ stay. Those may still be referenced
 * by another investigation that collected the same bytes before encryption.
 * The manifest and signature sidecars are always removed.
 */

import {
  encryptedArtifactPrefix,
  investigationManifestPath,
  investigationSignaturesPath,
} from '../archive/paths';
import type { R2BucketLike } from '../archive/store';

export interface ArchivePurgeResult {
  deletedKeys: string[];
}

export async function purgeInvestigationArchive(
  bucket: R2BucketLike,
  investigationId: string
): Promise<ArchivePurgeResult> {
  if (!bucket.delete) {
    throw new Error('purgeInvestigationArchive: bucket has no delete');
  }
  const remove = bucket.delete.bind(bucket);
  const deletedKeys: string[] = [];
  if (bucket.list) {
    const prefix = encryptedArtifactPrefix(investigationId);
    let cursor: string | undefined;
    do {
      const page = await bucket.list({ prefix, cursor });
      for (const object of page.objects) {
        await remove(object.key);
        deletedKeys.push(object.key);
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
  }
  const keys = [
    investigationManifestPath(investigationId),
    investigationSignaturesPath(investigationId),
  ];
  for (const key of keys) {
    await remove(key);
    deletedKeys.push(key);
  }
  return { deletedKeys };
}

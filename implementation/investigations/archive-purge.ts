/**
 * Remove per-investigation archive metadata from R2.
 *
 * Content-addressed artifact blobs under sha256/ are intentionally retained:
 * they are global deduplicated storage and may be referenced by other
 * investigations that collected the same bytes. Only the investigation-scoped
 * manifest and signature sidecars are removed.
 */

import {
  investigationManifestPath,
  investigationSignaturesPath,
} from '../archive/paths';

export interface R2DeletableBucket {
  delete(key: string): Promise<void>;
}

export interface ArchivePurgeResult {
  deletedKeys: string[];
}

export async function purgeInvestigationArchive(
  bucket: R2DeletableBucket,
  investigationId: string
): Promise<ArchivePurgeResult> {
  const keys = [
    investigationManifestPath(investigationId),
    investigationSignaturesPath(investigationId),
  ];
  const deletedKeys: string[] = [];
  for (const key of keys) {
    await bucket.delete(key);
    deletedKeys.push(key);
  }
  return { deletedKeys };
}

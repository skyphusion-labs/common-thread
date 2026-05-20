/**
 * Usage example: collecting an artifact end-to-end through the archive layer.
 *
 * This is not a test — it's a reference for what the API calls look like
 * in a typical collection workflow. Drop it into the Workers handler that
 * receives artifacts from a scraper.
 */

import { ArchiveStore } from './store';
import { ManifestStore } from './manifest';
import type { ManifestEntry } from './types';

// Worker environment binding interface.
// In wrangler.toml, declare the R2 bucket binding as ARCHIVE.
export interface Env {
  ARCHIVE: R2Bucket;
}

/**
 * Collect an artifact and append a manifest entry.
 *
 * @param env - Worker environment with R2 binding
 * @param bytes - The artifact bytes to archive
 * @param meta - Collection metadata
 */
export async function collectArtifact(
  env: Env,
  bytes: Uint8Array,
  meta: {
    source: string;
    investigationId: string;
    account?: string;
    relatedAccount?: string;
    tool: string;
    toolVersion: string;
    toolConfig?: Record<string, unknown>;
    mimeType?: string;
    extension?: string;
    platformMetadata?: Record<string, unknown>;
  }
): Promise<ManifestEntry> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE });

  // Step 1: write to the archive. Content-addressed; if the artifact is
  // already present (same bytes already collected before), this is a no-op.
  const writeResult = await archive.put(bytes, {
    mimeType: meta.mimeType,
    extension: meta.extension,
  });

  // Step 2: append a manifest entry. Even if the artifact bytes were
  // already present, this collection event is itself new evidence
  // (different source URL, different timestamp, different tool run)
  // and gets its own manifest entry.
  const entry: ManifestEntry = {
    hash: writeResult.hash,
    source: meta.source,
    collectedAt: new Date().toISOString(),
    collectionMethod: {
      tool: meta.tool,
      version: meta.toolVersion,
      config: meta.toolConfig,
    },
    investigationId: meta.investigationId,
    account: meta.account,
    relatedAccount: meta.relatedAccount,
    platformMetadata: meta.platformMetadata,
    status: 'present',
    mimeType: meta.mimeType,
    size: writeResult.size,
  };

  await manifest.append(entry);
  return entry;
}

/**
 * Record a tombstone: re-collection found a previously-archived artifact
 * is no longer accessible at its source.
 *
 * @param env - Worker environment
 * @param originalHash - Hash of the artifact that is now absent at source
 * @param meta - Re-collection metadata
 */
export async function recordTombstone(
  env: Env,
  originalHash: string,
  meta: {
    source: string;
    investigationId: string;
    account?: string;
    tool: string;
    toolVersion: string;
  }
): Promise<ManifestEntry> {
  const manifest = new ManifestStore({ bucket: env.ARCHIVE });

  const entry: ManifestEntry = {
    // For a tombstone, the entry's own hash is its identity. We use the
    // original artifact's hash for traceability; tombstoneOf carries the
    // actual reference.
    hash: originalHash,
    source: meta.source,
    collectedAt: new Date().toISOString(),
    collectionMethod: {
      tool: meta.tool,
      version: meta.toolVersion,
    },
    investigationId: meta.investigationId,
    account: meta.account,
    status: 'absent',
    tombstoneOf: originalHash,
  };

  await manifest.append(entry);
  return entry;
}

/**
 * Read an artifact back from the archive, verifying its integrity.
 *
 * @param env - Worker environment
 * @param hash - The SHA-256 hash to retrieve
 * @returns The artifact bytes, or null if not present
 */
export async function readArtifact(
  env: Env,
  hash: string,
  extension?: string
): Promise<Uint8Array | null> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const result = await archive.get(hash, extension);
  return result ? result.bytes : null;
}

/**
 * List all artifacts collected for an investigation.
 *
 * @param env - Worker environment
 * @param investigationId - Investigation identifier
 * @returns Manifest entries for the investigation
 */
export async function listInvestigationArtifacts(
  env: Env,
  investigationId: string
): Promise<ManifestEntry[]> {
  const manifest = new ManifestStore({ bucket: env.ARCHIVE });
  return manifest.list({ investigationId, status: 'present' });
}

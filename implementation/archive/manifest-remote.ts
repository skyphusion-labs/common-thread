/**
 * Remote manifest append client for the VPC ingest container (#110).
 *
 * When the ingest pipeline runs outside the Worker (no MANIFEST_COORDINATOR
 * binding), manifest appends are routed through an authenticated Worker
 * endpoint that fronts the Durable Object.
 */

import type { ManifestEntry } from './types';
import { timingSafeEqual } from '../investigations/access';

export interface RemoteManifestAppendOptions {
  appendUrl: string;
  secret: string;
  entry: ManifestEntry;
}

export async function appendManifestEntryRemote(
  options: RemoteManifestAppendOptions
): Promise<void> {
  const response = await fetch(options.appendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.secret}`,
    },
    body: JSON.stringify({ entry: options.entry }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Remote manifest append failed: ${response.status} ${detail}`.trim()
    );
  }
}

export function authorizeIngestSecret(
  provided: string | null | undefined,
  expected: string | undefined
): boolean {
  if (!expected || !provided) return false;
  return timingSafeEqual(provided, expected);
}

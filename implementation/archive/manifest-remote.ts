/**
 * Remote manifest append client for the VPC ingest container (#110).
 *
 * When the ingest pipeline runs outside the Worker (no MANIFEST_COORDINATOR
 * binding), manifest appends are routed through an authenticated Worker
 * endpoint that fronts the Durable Object.
 */

import type { ManifestEntry } from './types';
import { timingSafeEqual } from '../crypto/timing-safe';

export interface RemoteManifestAppendOptions {
  appendUrl: string;
  secret: string;
  entry: ManifestEntry;
}

export interface RemoteManifestLineOptions {
  appendUrl: string;
  secret: string;
  /** One JSONL record, including the trailing newline. May be an enc:1: cell. */
  line: string;
}

/**
 * Send one prepared manifest line to the Worker. The Worker stores the line
 * as-is, so encryption happens before this call and the Worker does not need
 * the investigation key.
 */
export async function appendManifestPreparedLine(
  options: RemoteManifestLineOptions
): Promise<void> {
  const response = await fetch(options.appendUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${options.secret}`,
    },
    body: JSON.stringify({ line: options.line }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Remote manifest append failed: ${response.status} ${detail}`.trim()
    );
  }
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

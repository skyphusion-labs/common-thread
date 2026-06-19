/**
 * Per-account profile extraction and archival for Apify Twitter ingest.
 *
 * Tweet scrapes embed an `author` object on each tweet. This module
 * deduplicates those snapshots into one profile JSON per account for
 * account-metadata extractors (§4.1).
 */

import { ArchiveStore } from '../archive/store';
import { ManifestStore } from '../archive/manifest';
import type { ParsedTweet } from './apify-twitter-parser';
import { APIFY_TWITTER_TIMELINE_TOOL } from './apify-timeline';

export const APIFY_TWITTER_PROFILE_TOOL = 'apify-twitter-profile';

export interface AccountProfile {
  account: string;
  profile: Record<string, unknown>;
}

/**
 * Pick the richest author snapshot per account (most populated fields).
 */
export function aggregateProfilesFromParsedTweets(
  parsed: ParsedTweet[]
): AccountProfile[] {
  const byAccount = new Map<string, Record<string, unknown>>();

  for (const row of parsed) {
    const author = extractAuthorObject(row.tweet);
    if (!author) continue;

    const existing = byAccount.get(row.account);
    if (!existing || profileRichness(author) > profileRichness(existing)) {
      byAccount.set(row.account, author);
    }
  }

  const profiles: AccountProfile[] = [];
  for (const [account, profile] of byAccount) {
    profiles.push({ account, profile });
  }
  profiles.sort((a, b) => a.account.localeCompare(b.account));
  return profiles;
}

export interface ArchiveProfilesResult {
  manifestHashes: string[];
  artifactsCreated: number;
}

export async function archiveAccountProfiles(
  env: { ARCHIVE: R2Bucket },
  options: {
    investigationId: string;
    profiles: AccountProfile[];
    collectedAt: string;
    toolVersion?: string;
  }
): Promise<ArchiveProfilesResult> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId: options.investigationId });
  const toolVersion = options.toolVersion ?? '1';
  const manifestHashes: string[] = [];

  for (const { account, profile } of options.profiles) {
    const bytes = new TextEncoder().encode(JSON.stringify(profile));
    const { hash } = await archive.put(bytes, {
      mimeType: 'application/json',
      extension: 'json',
    });

    await manifest.append({
      hash,
      account,
      source: `https://x.com/${account}/profile`,
      collectedAt: options.collectedAt,
      investigationId: options.investigationId,
      collectionMethod: {
        tool: APIFY_TWITTER_PROFILE_TOOL,
        version: toolVersion,
        platform: 'twitter',
      },
      mimeType: 'application/json',
      status: 'present',
    } as never);

    manifestHashes.push(hash);
  }

  return {
    manifestHashes,
    artifactsCreated: manifestHashes.length,
  };
}

function extractAuthorObject(tweet: unknown): Record<string, unknown> | null {
  if (!tweet || typeof tweet !== 'object') return null;
  const author = (tweet as Record<string, unknown>).author;
  if (!author || typeof author !== 'object') return null;
  return author as Record<string, unknown>;
}

function profileRichness(profile: Record<string, unknown>): number {
  let score = 0;
  for (const value of Object.values(profile)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.length === 0) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    score++;
  }
  return score;
}

/** True when a manifest entry is a per-account profile artifact. */
export function isApifyTwitterProfileEntry(tool: string): boolean {
  const t = tool.toLowerCase();
  return t.includes('profile') && !t.includes(APIFY_TWITTER_TIMELINE_TOOL);
}

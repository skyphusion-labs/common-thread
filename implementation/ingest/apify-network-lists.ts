/**
 * Follower/following list extraction from Apify Twitter exports.
 *
 * Archives per-account network list artifacts consumable by
 * network_twitter extractor (§4.4.1).
 */

import { ArchiveStore } from '../archive/store';
import { ManifestStore } from '../archive/manifest';

export const APIFY_TWITTER_FOLLOWERS_TOOL = 'apify-twitter-followers';
export const APIFY_TWITTER_FOLLOWING_TOOL = 'apify-twitter-following';
export const NETWORK_LIST_MIME = 'application/json';

export interface NetworkListArtifact {
  account: string;
  direction: 'followers' | 'following';
  users: string[];
}

function cleanHandle(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/^@/, '');
  if (trimmed.length === 0) return null;
  if (!/^[a-z0-9_]{1,15}$/.test(trimmed)) return null;
  return trimmed;
}

function extractHandleFromItem(item: unknown): string | null {
  if (typeof item === 'string') return cleanHandle(item);
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;
  for (const key of [
    'username',
    'screen_name',
    'screenName',
    'userName',
    'handle',
    'name',
  ]) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > 0) {
      const cleaned = cleanHandle(v);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function ownerFromItem(item: Record<string, unknown>): string | null {
  for (const key of [
    'ownerUsername',
    'owner_username',
    'account',
    'accountUsername',
    'profileUserName',
    'User_Name',
    'userName',
  ]) {
    const v = item[key];
    if (typeof v === 'string') {
      const cleaned = cleanHandle(v);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function usersFromArray(arr: unknown[]): string[] {
  const seen = new Set<string>();
  for (const entry of arr) {
    const h = extractHandleFromItem(entry);
    if (h) seen.add(h);
  }
  return [...seen].sort();
}

/**
 * Scan an Apify payload for follower/following list data.
 */
export function extractNetworkListsFromPayload(payload: unknown): NetworkListArtifact[] {
  const items = normalizeItems(payload);
  const byKey = new Map<string, NetworkListArtifact>();

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const owner = ownerFromItem(obj);

    for (const [direction, keys] of [
      ['followers', ['followers', 'followerList', 'follower_list', 'subscribers']] as const,
      ['following', ['following', 'friends', 'followingList', 'following_list']] as const,
    ]) {
      for (const key of keys) {
        const v = obj[key];
        if (!Array.isArray(v) || v.length === 0) continue;
        const users = usersFromArray(v);
        if (users.length === 0) continue;

        const account =
          owner ??
          (typeof obj.screen_name === 'string' ? cleanHandle(obj.screen_name) : null) ??
          (typeof obj.userName === 'string' ? cleanHandle(obj.userName) : null);
        if (!account) continue;

        const mapKey = `${account}|${direction}`;
        const existing = byKey.get(mapKey);
        if (existing) {
          const merged = new Set([...existing.users, ...users]);
          existing.users = [...merged].sort();
        } else {
          byKey.set(mapKey, { account, direction, users });
        }
      }
    }

    // Edge-list shape: { ownerUsername, username } without embedded arrays.
    if (owner) {
      const member = extractHandleFromItem(obj);
      if (member && member !== owner) {
        const direction: 'followers' | 'following' =
          typeof obj.relationship === 'string' && obj.relationship.toLowerCase().includes('follower')
            ? 'followers'
            : 'following';
        const mapKey = `${owner}|${direction}`;
        const existing = byKey.get(mapKey);
        if (existing) {
          if (!existing.users.includes(member)) {
            existing.users.push(member);
            existing.users.sort();
          }
        } else {
          byKey.set(mapKey, { account: owner, direction, users: [member] });
        }
      }
    }
  }

  return [...byKey.values()];
}

function normalizeItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [payload];
  const obj = payload as Record<string, unknown>;
  for (const key of ['items', 'data', 'users', 'followers', 'following']) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [payload];
}

export interface ArchiveNetworkListsResult {
  manifestHashes: string[];
  artifactsCreated: number;
}

export async function archiveNetworkLists(
  env: { ARCHIVE: R2Bucket; MANIFEST_COORDINATOR?: DurableObjectNamespace },
  options: {
    investigationId: string;
    lists: NetworkListArtifact[];
    collectedAt: string;
  }
): Promise<ArchiveNetworkListsResult> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId: options.investigationId, coordinator: env.MANIFEST_COORDINATOR });
  const manifestHashes: string[] = [];
  let artifactsCreated = 0;

  for (const list of options.lists) {
    if (list.users.length === 0) continue;

    const body = JSON.stringify({ users: list.users }, null, 0);
    const bytes = new TextEncoder().encode(body);
    const tool =
      list.direction === 'followers'
        ? APIFY_TWITTER_FOLLOWERS_TOOL
        : APIFY_TWITTER_FOLLOWING_TOOL;

    const { hash } = await archive.put(bytes, {
      mimeType: NETWORK_LIST_MIME,
      extension: 'json',
    });

    await manifest.append({
      hash,
      source: `https://x.com/${list.account}/${list.direction}`,
      collectedAt: options.collectedAt,
      investigationId: options.investigationId,
      account: list.account,
      collectionMethod: { tool, version: '1' },
      mimeType: NETWORK_LIST_MIME,
      status: 'present',
    });

    manifestHashes.push(hash);
    artifactsCreated++;
  }

  return { manifestHashes, artifactsCreated };
}

/**
 * True when the payload contains actual follower/following arrays,
 * not merely numeric follower counts on tweet rows.
 */
export function payloadHasNetworkLists(payload: unknown): boolean {
  return extractNetworkListsFromPayload(payload).some(l => l.users.length > 0);
}

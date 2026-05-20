/**
 * Twitter network extractor.
 *
 * Reads follower-list or following-list artifacts from the archive and
 * emits the account's follower set or following set as a JSON array
 * feature. Together these populate the inputs that paper §4.4 network
 * pair extractors require.
 *
 * Status: this extractor is a no-op on archives that do not contain
 * follower/following list artifacts. The current account-metadata
 * extractor emits follower COUNTS from profile artifacts but does not
 * enumerate the SET of follower handles. This extractor consumes
 * separate list artifacts that the collection layer must emit.
 * Practitioners adding follower-list collection to their workflow can
 * point at this extractor as the consumer.
 *
 * Direction dispatch:
 *
 * A single artifact may represent either the followers of an account
 * (people following the account) or the followings of an account
 * (people the account follows). The extractor dispatches on the
 * manifest entry metadata:
 *
 *   - tool name containing 'followers' OR source URL containing
 *     '/followers' indicates the artifact lists this account's
 *     followers. Emits feature 'follower_set'.
 *
 *   - tool name containing 'following' or 'friends' OR source URL
 *     containing '/following' or '/friends' indicates the artifact
 *     lists accounts THIS account follows. Emits feature
 *     'following_set'.
 *
 *   - If neither set of hints is present, the artifact is not
 *     recognized as a list artifact and the extractor returns empty.
 *
 * Accepted input shapes (the parser tries each in order):
 *
 *   { users: [{ username | screen_name | name: '...' }, ...] }
 *   { data:  [{ username | screen_name | name: '...' }, ...] }
 *   { followers: [...] }
 *   { following: [...] }
 *   { friends:   [...] }
 *   [ { username | screen_name | name: '...' }, ... ]
 *   [ 'alice', 'bob', ... ]
 *
 * Features emitted (one of two paths, never both from the same
 * artifact):
 *
 *   follower_set       (json, sorted lowercase array)
 *   follower_set_size  (numeric)
 *
 *      OR
 *
 *   following_set       (json, sorted lowercase array)
 *   following_set_size  (numeric)
 *
 * Determinism: the parsed handle list is deduplicated, lowercased, and
 * sorted before emission. The same artifact bytes always produce the
 * same feature value. No randomness, no clock access, no I/O beyond
 * the artifact bytes passed in. Satisfies §6.1.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';

const NAME = 'network_twitter';
const VERSION = '1.0.0';

type Direction = 'followers' | 'following';

export class TwitterNetworkExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();

    // The artifact must look like a graph-list collection.
    const looksLikeListArtifact =
      tool.includes('follower') ||
      tool.includes('following') ||
      tool.includes('friends') ||
      tool.includes('subscriber') ||
      source.includes('/followers') ||
      source.includes('/following') ||
      source.includes('/friends');
    if (!looksLikeListArtifact) return false;

    // Reject if it's obviously not Twitter. Mirrors the negative-check
    // pattern used by the Twitter account-metadata extractor.
    const looksTwitter =
      tool.includes('twitter') ||
      tool.includes('x-com') ||
      source.includes('twitter.com') ||
      source.includes('x.com');
    const looksReddit =
      tool.includes('reddit') || source.includes('reddit.com');
    if (looksReddit && !looksTwitter) return false;

    return true;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const direction = detectDirection(input.entry);
    if (!direction) return [];

    const parsed = tryParseList(input.bytes);
    if (!parsed) return [];

    const normalized = normalizeHandles(parsed);
    if (normalized.length === 0) return [];

    const setFeatureName = direction === 'followers' ? 'follower_set' : 'following_set';
    const sizeFeatureName =
      direction === 'followers' ? 'follower_set_size' : 'following_set_size';

    return [
      {
        category: 'network',
        name: setFeatureName,
        value: { kind: 'json', value: normalized },
      },
      {
        category: 'network',
        name: sizeFeatureName,
        value: { kind: 'numeric', value: normalized.length },
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// Direction detection
// ---------------------------------------------------------------------------

function detectDirection(entry: ManifestEntry): Direction | null {
  const tool = entry.collectionMethod.tool.toLowerCase();
  const source = entry.source.toLowerCase();

  // Followers indicators take priority because some scraper tools name
  // their following-list endpoints 'friends_followers' or similar; if
  // both substrings are present, prefer the explicit 'followers'.
  const followersHint =
    tool.includes('follower') || source.includes('/followers');
  const followingHint =
    tool.includes('following') ||
    tool.includes('friends') ||
    source.includes('/following') ||
    source.includes('/friends');

  if (followersHint && !followingHint) return 'followers';
  if (followingHint && !followersHint) return 'following';

  // Ambiguous (both or neither hint present). Fall back to source URL
  // segment ordering: whichever of '/followers' or '/following' appears
  // LATER in the path wins (Twitter URLs put the operation last).
  if (followersHint && followingHint) {
    const fwerIdx = source.lastIndexOf('/followers');
    const fwingIdx = Math.max(
      source.lastIndexOf('/following'),
      source.lastIndexOf('/friends')
    );
    if (fwerIdx > fwingIdx) return 'followers';
    if (fwingIdx > fwerIdx) return 'following';
  }

  return null;
}

// ---------------------------------------------------------------------------
// List parsing
// ---------------------------------------------------------------------------

/**
 * Try to parse the artifact bytes as one of the accepted list shapes.
 * Returns a raw list of handle-bearing items (strings or objects) or
 * null if no shape matches.
 */
function tryParseList(bytes: Uint8Array): unknown[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
  return extractListPayload(parsed);
}

function extractListPayload(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return null;

  const obj = parsed as Record<string, unknown>;
  // Try common wrapper keys, in priority order.
  for (const key of ['users', 'data', 'followers', 'following', 'friends', 'subscribers', 'items']) {
    const v = obj[key];
    if (Array.isArray(v)) return v;
  }

  return null;
}

/**
 * Convert each list item to a normalized lowercase handle. Drops
 * items that don't yield a usable handle. Deduplicates and sorts the
 * result for determinism.
 */
function normalizeHandles(items: unknown[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const handle = extractHandle(item);
    if (handle) seen.add(handle);
  }
  return [...seen].sort();
}

function extractHandle(item: unknown): string | null {
  if (typeof item === 'string') return cleanHandle(item);
  if (!item || typeof item !== 'object') return null;

  const obj = item as Record<string, unknown>;
  // Try each plausible field name in order.
  for (const key of ['username', 'screen_name', 'screenName', 'handle', 'name']) {
    const v = obj[key];
    if (typeof v === 'string' && v.length > 0) {
      const cleaned = cleanHandle(v);
      if (cleaned) return cleaned;
    }
  }
  return null;
}

function cleanHandle(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase().replace(/^@/, '');
  if (trimmed.length === 0) return null;
  // Reject obvious non-handles (URLs, multi-word strings, etc.). A
  // Twitter handle is at most 15 characters and contains only
  // alphanumeric or underscore.
  if (!/^[a-z0-9_]{1,15}$/.test(trimmed)) return null;
  return trimmed;
}

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';

const NAME = 'network_twitter';
const VERSION = '1.0.0';

type Direction = 'followers' | 'following';

interface ExtractorInputWithEntry extends ExtractorInput {
  entry: ManifestEntry;
}

export class TwitterNetworkExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();

    const looksLikeListArtifact =
      tool.includes('follower') ||
      tool.includes('following') ||
      tool.includes('friends') ||
      tool.includes('subscriber') ||
      source.includes('/followers') ||
      source.includes('/following') ||
      source.includes('/friends') ||
      source.includes('/subscribers');

    if (!looksLikeListArtifact) return false;

    const looksTwitter =
      tool.includes('twitter') ||
      tool.includes('x-com') ||
      source.includes('twitter.com') ||
      source.includes('x.com');

    if (!looksTwitter) return false;

    const looksReddit = tool.includes('reddit') || source.includes('reddit.com');
    if (looksReddit) return false;

    return true;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const inputWithEntry = input as ExtractorInputWithEntry;
    const entry = inputWithEntry.entry;

    const direction = detectDirection(entry);
    if (!direction) return [];

    const parsed = tryParseList(input.bytes);
    if (!parsed) return [];

    const normalized = normalizeHandles(parsed);
    if (normalized.length === 0) return [];

    const setFeatureName = direction === 'followers' ? 'follower_set' : 'following_set';
    const sizeFeatureName = direction === 'followers' ? 'follower_set_size' : 'following_set_size';

    return [
      { category: 'network', name: setFeatureName, value: { kind: 'json', value: normalized } },
      { category: 'network', name: sizeFeatureName, value: { kind: 'numeric', value: normalized.length } },
    ];
  }
}

// ---------------------------------------------------------------------------
// Direction detection + parsing helpers (unchanged from previous clean version)
// ---------------------------------------------------------------------------

function detectDirection(entry: ManifestEntry): Direction | null {
  const tool = entry.collectionMethod.tool.toLowerCase();
  const source = entry.source.toLowerCase();

  const followersHint =
    tool.includes('follower') ||
    tool.includes('subscriber') ||
    source.includes('/followers') ||
    source.includes('/subscribers');

  const followingHint =
    tool.includes('following') ||
    tool.includes('friends') ||
    source.includes('/following') ||
    source.includes('/friends');

  if (followersHint && !followingHint) return 'followers';
  if (followingHint && !followersHint) return 'following';

  if (followersHint && followingHint) {
    const fwerIdx = source.lastIndexOf('/followers');
    const fwingIdx = Math.max(
      source.lastIndexOf('/following'),
      source.lastIndexOf('/friends')
    );
    if (fwerIdx >= fwingIdx) return 'followers';
    return 'following';
  }

  return null;
}

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
  for (const key of ['users', 'data', 'followers', 'following', 'friends', 'subscribers', 'items']) {
    const v = obj[key];
    if (Array.isArray(v)) return v;
  }
  return null;
}

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
  if (!/^[a-z0-9_]{1,15}$/.test(trimmed)) return null;
  return trimmed;
}

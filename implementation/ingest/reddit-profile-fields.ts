/**
 * Shared field accessors for Reddit user profile objects.
 *
 * Profiles arrive as native API `{ kind: 't2', data: {...} }`, nested
 * `subreddit` objects, or Apify basic-profile rows with flat dot keys
 * (`subreddit.public_description`) and optional array wrappers.
 */

export interface RedditProfileLike {
  id?: string;
  name?: string;
  created_utc?: number;
  link_karma?: number;
  comment_karma?: number;
  total_karma?: number;
  awardee_karma?: number;
  awarder_karma?: number;
  has_verified_email?: boolean;
  is_gold?: boolean;
  is_mod?: boolean;
  is_employee?: boolean;
  is_suspended?: boolean;
  icon_img?: string;
  snoovatar_img?: string;
  subreddit?: {
    title?: string;
    display_name?: string;
    display_name_prefixed?: string;
    public_description?: string;
    description?: string;
    subscribers?: number;
    over_18?: boolean;
    banner_img?: string;
    banner_background_image?: string;
    icon_img?: string;
  };
}

/** Normalize Apify flat keys and bare objects into RedditProfileLike. */
export function normalizeRedditProfile(raw: unknown): RedditProfileLike | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const profile: RedditProfileLike = { ...(obj as RedditProfileLike) };

  const flatBio = obj['subreddit.public_description'];
  if (typeof flatBio === 'string') {
    profile.subreddit = {
      ...(profile.subreddit ?? {}),
      public_description: flatBio,
    };
  }

  const flatTitle = obj['subreddit.title'];
  if (typeof flatTitle === 'string') {
    profile.subreddit = {
      ...(profile.subreddit ?? {}),
      title: flatTitle,
    };
  }

  return profile;
}

export function looksLikeRedditProfile(profile: RedditProfileLike): boolean {
  return (
    typeof profile.link_karma === 'number' ||
    typeof profile.comment_karma === 'number' ||
    typeof profile.total_karma === 'number' ||
    typeof profile.created_utc === 'number' ||
    profile.is_employee !== undefined ||
    typeof profile.snoovatar_img === 'string' ||
    (typeof profile.name === 'string' &&
      (typeof profile.link_karma === 'number' ||
        typeof profile.comment_karma === 'number' ||
        typeof profile.total_karma === 'number')) ||
    (profile.subreddit !== undefined &&
      typeof profile.subreddit.display_name_prefixed === 'string')
  );
}

export function redditProfileBio(profile: RedditProfileLike): string | undefined {
  const sub = profile.subreddit;
  if (!sub) return undefined;
  return sub.public_description ?? sub.description;
}

export function isDefaultRedditAvatar(iconUrl: string | undefined): boolean {
  if (typeof iconUrl !== 'string' || iconUrl.length === 0) return false;
  return /avatars\/defaults|avatar_default/i.test(iconUrl);
}

export function parseRedditProfileObject(
  parsed: unknown,
  preferredAccount?: string
): RedditProfileLike | null {
  if (!parsed) return null;

  if (Array.isArray(parsed)) {
    const normalized = parsed
      .map(normalizeRedditProfile)
      .filter((p): p is RedditProfileLike => p !== null && looksLikeRedditProfile(p));

    if (normalized.length === 0) return null;
    if (preferredAccount) {
      const match = normalized.find(
        p => p.name?.toLowerCase() === preferredAccount.toLowerCase()
      );
      if (match) return match;
    }
    return normalized[0];
  }

  if (typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.kind === 't2' && obj.data && typeof obj.data === 'object') {
    const profile = normalizeRedditProfile(obj.data);
    return profile && looksLikeRedditProfile(profile) ? profile : null;
  }

  if (obj.data && typeof obj.data === 'object' && !obj.kind) {
    const profile = normalizeRedditProfile(obj.data);
    return profile && looksLikeRedditProfile(profile) ? profile : null;
  }

  const profile = normalizeRedditProfile(parsed);
  return profile && looksLikeRedditProfile(profile) ? profile : null;
}

export function parseRedditProfileBytes(
  bytes: Uint8Array,
  preferredAccount?: string
): RedditProfileLike | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    return parseRedditProfileObject(parsed, preferredAccount);
  } catch {
    return null;
  }
}

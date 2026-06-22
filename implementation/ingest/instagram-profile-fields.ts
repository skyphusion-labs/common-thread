/**
 * Shared field accessors for Instagram profile objects.
 *
 * Apify instagram-profile-scraper rows use camelCase (fullName,
 * profilePicUrl, postsCount). Field helpers tolerate snake_case variants.
 */

export interface InstagramProfileLike {
  fullName?: string;
  full_name?: string;
  name?: string;
  username?: string;
  userName?: string;
  profilePicUrl?: string;
  profile_pic_url?: string;
  profilePicture?: string;
  profile_picture?: string;
  biography?: string;
  bio?: string;
  description?: string;
  postsCount?: number;
  posts_count?: number;
  media_count?: number;
  followersCount?: number;
  followers_count?: number;
  followers?: number;
  followsCount?: number;
  follows_count?: number;
  following_count?: number;
  following?: number;
  private?: boolean;
  is_private?: boolean;
  isPrivate?: boolean;
  verified?: boolean;
  is_verified?: boolean;
  isVerified?: boolean;
  isBusinessAccount?: boolean;
  is_business_account?: boolean;
  is_business?: boolean;
  externalUrl?: string;
  external_url?: string;
  url?: string;
}

export function instagramDisplayName(profile: InstagramProfileLike): string | undefined {
  return profile.fullName ?? profile.full_name ?? profile.name;
}

export function instagramUsername(profile: InstagramProfileLike): string | undefined {
  return profile.username ?? profile.userName;
}

export function instagramBio(profile: InstagramProfileLike): string | undefined {
  return profile.biography ?? profile.bio ?? profile.description;
}

export function instagramProfileImageUrl(profile: InstagramProfileLike): string | undefined {
  return (
    profile.profilePicUrl ??
    profile.profile_pic_url ??
    profile.profilePicture ??
    profile.profile_picture
  );
}

export function pickInstagramNumber(
  ...values: Array<number | undefined>
): number | undefined {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

export function looksLikeInstagramProfile(profile: InstagramProfileLike): boolean {
  return (
    typeof instagramUsername(profile) === 'string' ||
    typeof instagramProfileImageUrl(profile) === 'string' ||
    pickInstagramNumber(
      profile.followersCount,
      profile.followers_count,
      profile.followers
    ) !== undefined ||
    pickInstagramNumber(profile.postsCount, profile.posts_count, profile.media_count) !==
      undefined
  );
}

export function parseInstagramProfileObject(
  parsed: unknown,
  preferredAccount?: string
): InstagramProfileLike | null {
  if (!parsed) return null;

  if (Array.isArray(parsed)) {
    const candidates = parsed.filter(
      (item): item is InstagramProfileLike =>
        !!item && typeof item === 'object' && looksLikeInstagramProfile(item as InstagramProfileLike)
    ) as InstagramProfileLike[];

    if (candidates.length === 0) return null;
    if (preferredAccount) {
      const match = candidates.find(
        p => instagramUsername(p)?.toLowerCase() === preferredAccount.toLowerCase()
      );
      if (match) return match;
    }
    return candidates[0];
  }

  if (typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;

  if (obj.data && typeof obj.data === 'object') {
    const profile = obj.data as InstagramProfileLike;
    return looksLikeInstagramProfile(profile) ? profile : null;
  }

  const profile = parsed as InstagramProfileLike;
  return looksLikeInstagramProfile(profile) ? profile : null;
}

export function parseInstagramProfileBytes(
  bytes: Uint8Array,
  preferredAccount?: string
): InstagramProfileLike | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    return parseInstagramProfileObject(parsed, preferredAccount);
  } catch {
    return null;
  }
}

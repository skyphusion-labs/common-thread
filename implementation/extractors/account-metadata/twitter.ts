/**
 * Twitter account metadata extractor.
 *
 * Reads a JSON artifact representing a Twitter user profile and emits
 * features in the 'account_metadata' category (§4.1 of the methodology
 * paper).
 *
 * Accepts variations in field naming because different Twitter scrapers
 * (Apify, twscrape, Tweepy, raw API responses) use different conventions
 * (camelCase vs snake_case, sometimes wrapped in a top-level 'user' or
 * 'data' object).
 *
 * Features produced:
 *
 *   Identity:        display_name, username, platform_id
 *   Display name:    display_name_length, display_name_char_count
 *   Bio:             bio, bio_length, bio_hashtag_count, bio_mention_count,
 *                    bio_link_count, bio_emoji_count
 *   Location:        location, has_location
 *   URL:             url, has_url
 *   Status flags:    verified, blue_verified, protected,
 *                    default_profile, default_profile_image
 *   Creation:        creation_date, creation_year
 *   Counts:          follower_count, following_count, tweet_count,
 *                    listed_count, favourites_count,
 *                    follower_following_ratio
 *   Profile images:  profile_image_url, banner_image_url
 *   Language:        profile_lang
 *
 * All numeric counts are emitted as 'numeric' feature values. Booleans
 * are emitted as 'numeric' 0/1 (the schema doesn't have a boolean type).
 * Text fields are emitted as 'text' feature values.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';

const NAME = 'account_metadata_twitter';
const VERSION = '1.0.0';

/**
 * Union of field-name variations seen across Twitter scrapers.
 * The extractor checks each possible name in turn.
 */
interface TwitterProfile {
  id?: string | number;
  id_str?: string;
  username?: string;
  screen_name?: string;
  name?: string;
  description?: string;
  bio?: string;
  location?: string;
  url?: string;
  verified?: boolean;
  blueVerified?: boolean;
  is_blue_verified?: boolean;
  createdAt?: string;
  created_at?: string;
  protected?: boolean;
  defaultProfile?: boolean;
  default_profile?: boolean;
  defaultProfileImage?: boolean;
  default_profile_image?: boolean;
  followersCount?: number;
  followers_count?: number;
  friendsCount?: number;
  following_count?: number;
  friends_count?: number;
  statusesCount?: number;
  statuses_count?: number;
  tweet_count?: number;
  listedCount?: number;
  listed_count?: number;
  favouritesCount?: number;
  favourites_count?: number;
  profileImageUrl?: string;
  profile_image_url?: string;
  profile_image_url_https?: string;
  profileBannerUrl?: string;
  profile_banner_url?: string;
  lang?: string;
}

export class TwitterAccountMetadataExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    // Pre-filter based on manifest-entry metadata to avoid reading R2
    // for obviously-not-Twitter artifacts. False negatives here are
    // recoverable (extract will return empty), but false positives
    // waste R2 reads.
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();

    // Positive signals
    if (tool.includes('twitter') || tool.includes('x-com')) return true;
    if (source.includes('twitter.com') || source.includes('x.com')) return true;

    // If we can't tell from metadata, let it through and rely on extract()
    // to discriminate. This is conservative; refine as more platforms
    // come online.
    return true;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const profile = tryParseProfile(input.bytes);
    if (!profile) return [];
    if (!looksLikeTwitter(profile)) return [];

    const features: ExtractedFeature[] = [];

    // Identity
    pushText(features, 'display_name', profile.name);
    pushText(features, 'username', profile.username ?? profile.screen_name);
    pushText(features, 'platform_id', toIdString(profile.id ?? profile.id_str));

    // Display name analysis
    if (profile.name) {
      pushNumeric(features, 'display_name_length', profile.name.length);
      pushNumeric(features, 'display_name_char_count', [...profile.name].length);
    }

    // Bio
    const bio = profile.description ?? profile.bio;
    pushText(features, 'bio', bio);
    if (typeof bio === 'string') {
      pushNumeric(features, 'bio_length', bio.length);
      pushNumeric(features, 'bio_hashtag_count', countMatches(bio, /#[\w\u00C0-\uFFFF]+/g));
      pushNumeric(features, 'bio_mention_count', countMatches(bio, /@\w+/g));
      pushNumeric(features, 'bio_link_count', countMatches(bio, /https?:\/\/\S+/gi));
      pushNumeric(features, 'bio_emoji_count', countMatches(bio, /\p{Extended_Pictographic}/gu));
    }

    // Location
    pushText(features, 'location', profile.location);
    pushBool(features, 'has_location', !!(profile.location && profile.location.length > 0));

    // URL
    pushText(features, 'url', profile.url);
    pushBool(features, 'has_url', !!(profile.url && profile.url.length > 0));

    // Account status flags
    pushBool(features, 'verified', profile.verified);
    pushBool(features, 'blue_verified', profile.blueVerified ?? profile.is_blue_verified);
    pushBool(features, 'protected', profile.protected);
    pushBool(features, 'default_profile', profile.defaultProfile ?? profile.default_profile);
    pushBool(features, 'default_profile_image', profile.defaultProfileImage ?? profile.default_profile_image);

    // Creation date
    const rawCreated = profile.createdAt ?? profile.created_at;
    if (rawCreated) {
      const iso = normalizeDate(rawCreated);
      if (iso) {
        pushText(features, 'creation_date', iso);
        const year = new Date(iso).getUTCFullYear();
        if (Number.isFinite(year)) {
          pushNumeric(features, 'creation_year', year);
        }
      }
    }

    // Counts
    const followers = pickNumber(profile.followersCount, profile.followers_count);
    const following = pickNumber(profile.friendsCount, profile.following_count, profile.friends_count);
    const statuses = pickNumber(profile.statusesCount, profile.statuses_count, profile.tweet_count);
    const listed = pickNumber(profile.listedCount, profile.listed_count);
    const favourites = pickNumber(profile.favouritesCount, profile.favourites_count);

    pushNumeric(features, 'follower_count', followers);
    pushNumeric(features, 'following_count', following);
    pushNumeric(features, 'tweet_count', statuses);
    pushNumeric(features, 'listed_count', listed);
    pushNumeric(features, 'favourites_count', favourites);

    if (typeof followers === 'number' && typeof following === 'number' && following > 0) {
      pushNumeric(features, 'follower_following_ratio', followers / following);
    }

    // Profile images
    pushText(
      features,
      'profile_image_url',
      profile.profileImageUrl ?? profile.profile_image_url ?? profile.profile_image_url_https
    );
    pushText(features, 'banner_image_url', profile.profileBannerUrl ?? profile.profile_banner_url);

    // Profile language. Twitter deprecated 'lang' from default API
    // responses around 2019 (alongside source/timezone), but some
    // archives and scrapers still expose it. When present it's a
    // low-but-nonzero diagnostic signal: weak alone, more useful when
    // the value is uncommon (e.g., 'ja', 'tr') or when it corroborates
    // other signals in a sockpuppet network. Reddit doesn't have a
    // public-profile equivalent, so this is Twitter-only.
    pushText(features, 'profile_lang', profile.lang);

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryParseProfile(bytes: Uint8Array): TwitterProfile | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      // Common wrappers
      if (parsed.user && typeof parsed.user === 'object') return parsed.user as TwitterProfile;
      if (parsed.data && typeof parsed.data === 'object') return parsed.data as TwitterProfile;
      return parsed as TwitterProfile;
    }
    return null;
  } catch {
    return null;
  }
}

function looksLikeTwitter(profile: TwitterProfile): boolean {
  // Heuristic: must have at least one Twitter-distinctive field
  return (
    profile.screen_name !== undefined ||
    profile.username !== undefined ||
    profile.statusesCount !== undefined ||
    profile.statuses_count !== undefined ||
    profile.tweet_count !== undefined ||
    profile.friends_count !== undefined
  );
}

function pushText(out: ExtractedFeature[], name: string, value: string | undefined | null): void {
  if (typeof value === 'string' && value.length > 0) {
    out.push({ category: 'account_metadata', name, value: { kind: 'text', value } });
  }
}

function pushNumeric(out: ExtractedFeature[], name: string, value: number | undefined | null): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    out.push({ category: 'account_metadata', name, value: { kind: 'numeric', value } });
  }
}

function pushBool(out: ExtractedFeature[], name: string, value: boolean | undefined | null): void {
  if (typeof value === 'boolean') {
    out.push({
      category: 'account_metadata',
      name,
      value: { kind: 'numeric', value: value ? 1 : 0 },
    });
  }
}

function countMatches(str: string, re: RegExp): number {
  return (str.match(re) ?? []).length;
}

function pickNumber(...values: Array<number | undefined>): number | undefined {
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

function toIdString(id: string | number | undefined): string | undefined {
  if (id === undefined || id === null) return undefined;
  return String(id);
}

function normalizeDate(value: string): string | null {
  // Try ISO 8601 first
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  // Try Twitter classic format: "Wed Apr 14 21:43:36 +0000 2021"
  const d = new Date(value);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  return null;
}

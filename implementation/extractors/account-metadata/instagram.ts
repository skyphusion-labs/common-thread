/**
 * Instagram account metadata extractor.
 *
 * Reads a JSON artifact representing an Instagram user profile (Apify
 * instagram-profile-scraper or equivalent) and emits features in the
 * 'account_metadata' category (§4.1 of the methodology paper).
 *
 * Feature names parallel Twitter where signals match so cross-platform
 * pair extractors (display name / bio similarity, verification agreement,
 * profile image overlap via profile_image_url) operate without modification.
 *
 * Features produced:
 *
 *   Identity:        display_name, username
 *   Display name:    display_name_length, display_name_char_count
 *   Bio:             bio, bio_length, bio_hashtag_count, bio_mention_count,
 *                    bio_link_count, bio_emoji_count
 *   URL:             url, has_url
 *   Status flags:    verified, blue_verified (always 0; Instagram has no
 *                    separate paid-blue tier), protected (private account)
 *   Counts:          follower_count, following_count, posts_count,
 *                    follower_following_ratio
 *   Profile images:  profile_image_url
 *   Instagram-only:  is_business_account
 *
 * Notably absent (correctly): creation_date (not exposed by this scraper),
 * location, default_profile flags (no Twitter-equivalent fields in scrape).
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import {
  instagramBio,
  instagramDisplayName,
  instagramProfileImageUrl,
  instagramUsername,
  parseInstagramProfileBytes,
  pickInstagramNumber,
  type InstagramProfileLike,
} from '../../ingest/instagram-profile-fields';

const NAME = 'account_metadata_instagram';
const VERSION = '1.0.0';

export class InstagramAccountMetadataExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();

    if (
      tool.includes('instagram-post') ||
      tool.includes('instagram-timeline') ||
      tool.includes('instagram-media')
    ) {
      return false;
    }
    if (source.includes('/p/') || source.includes('/reel/')) return false;

    if (tool.includes('instagram')) return true;
    if (source.includes('instagram.com')) return true;

    return false;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const profile = parseInstagramProfileBytes(input.bytes, input.entry.account);
    if (!profile) return [];

    const features: ExtractedFeature[] = [];

    const displayName = instagramDisplayName(profile);
    const username = instagramUsername(profile);
    pushText(features, 'display_name', displayName);
    pushText(features, 'username', username);

    if (displayName) {
      pushNumeric(features, 'display_name_length', displayName.length);
      pushNumeric(features, 'display_name_char_count', [...displayName].length);
    }

    const bio = instagramBio(profile);
    pushText(features, 'bio', bio);
    if (typeof bio === 'string') {
      pushNumeric(features, 'bio_length', bio.length);
      pushNumeric(features, 'bio_hashtag_count', countMatches(bio, /#[\w\u00C0-\uFFFF]+/g));
      pushNumeric(features, 'bio_mention_count', countMatches(bio, /@\w+/g));
      pushNumeric(features, 'bio_link_count', countMatches(bio, /https?:\/\/\S+/gi));
      pushNumeric(features, 'bio_emoji_count', countMatches(bio, /\p{Extended_Pictographic}/gu));
    }

    const externalUrl = profile.externalUrl ?? profile.external_url ?? profile.url;
    pushText(features, 'url', externalUrl);
    pushBool(features, 'has_url', !!(externalUrl && externalUrl.length > 0));

    pushBool(
      features,
      'verified',
      profile.verified ?? profile.is_verified ?? profile.isVerified
    );
    pushBool(features, 'blue_verified', false);
    pushBool(
      features,
      'protected',
      profile.private ?? profile.is_private ?? profile.isPrivate
    );
    pushBool(
      features,
      'is_business_account',
      profile.isBusinessAccount ?? profile.is_business_account ?? profile.is_business
    );

    const followers = pickInstagramNumber(
      profile.followersCount,
      profile.followers_count,
      profile.followers
    );
    const following = pickInstagramNumber(
      profile.followsCount,
      profile.follows_count,
      profile.following_count,
      profile.following
    );
    const posts = pickInstagramNumber(
      profile.postsCount,
      profile.posts_count,
      profile.media_count
    );

    pushNumeric(features, 'follower_count', followers);
    pushNumeric(features, 'following_count', following);
    pushNumeric(features, 'posts_count', posts);

    if (typeof followers === 'number' && typeof following === 'number' && following > 0) {
      pushNumeric(features, 'follower_following_ratio', followers / following);
    }

    pushText(features, 'profile_image_url', instagramProfileImageUrl(profile));

    return features;
  }
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

export type { InstagramProfileLike };

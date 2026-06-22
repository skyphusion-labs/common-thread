/**
 * Reddit account metadata extractor.
 *
 * Reddit's account paradigm differs from Twitter's in important ways:
 *
 *   - No public follower/following counts (Reddit is community-paradigm,
 *     not graph-paradigm). Karma is the social metric.
 *   - Account "name" is the username; there is no separate display name
 *     in the classic model. Newer "name display" features map to
 *     subreddit.title.
 *   - Each account has a personal subreddit (u_username) with optional
 *     public_description that serves the bio role.
 *
 * Features produced:
 *
 *   Identity:           username, platform_id
 *   Karma:              link_karma, comment_karma, total_karma
 *   Status flags:       has_verified_email, is_gold, is_mod,
 *                       is_employee, is_suspended
 *   Creation:           creation_date, creation_year
 *   Personal subreddit: bio, bio_length, bio_hashtag_count,
 *                       bio_mention_count, bio_link_count,
 *                       subreddit_title, subreddit_display_name,
 *                       subreddit_subscribers, subreddit_over_18
 *   Profile images:     icon_url, banner_url, default_profile_image
 *
 * Artifact parsing: shared reddit-profile-fields accepts native API
 * envelopes, nested subreddit objects, Apify basic-profile flat keys
 * (subreddit.public_description), and array wrappers.
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import {
  isDefaultRedditAvatar,
  parseRedditProfileBytes,
  redditProfileBio,
  type RedditProfileLike,
} from '../../ingest/reddit-profile-fields';

const NAME = 'account_metadata_reddit';
const VERSION = '1.1.0';

export class RedditAccountMetadataExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    const tool = entry.collectionMethod.tool.toLowerCase();
    const source = entry.source.toLowerCase();

    if (tool.includes('twitter') || tool.includes('x-com')) return false;
    if (source.includes('twitter.com') || source.includes('x.com')) return false;
    if (tool.includes('instagram')) return false;
    if (source.includes('instagram.com')) return false;

    const looksLikeActivity =
      tool.includes('search-fast') ||
      tool.includes('posts-scraper') ||
      tool.includes('timeline') ||
      tool.includes('comments') ||
      tool.includes('submitted') ||
      source.includes('/comments/');

    if (looksLikeActivity) return false;

    if (tool.includes('profile') || tool.includes('basic-profile')) return true;
    if (source.includes('/user/')) return true;

    if (tool.includes('reddit')) return true;
    if (source.includes('reddit.com') || source.includes('redd.it')) return true;

    return false;
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const profile = parseRedditProfileBytes(input.bytes, input.entry.account);
    if (!profile) return [];

    const features: ExtractedFeature[] = [];

    pushText(features, 'username', profile.name);
    pushText(features, 'platform_id', profile.id);

    pushNumeric(features, 'link_karma', profile.link_karma);
    pushNumeric(features, 'comment_karma', profile.comment_karma);
    pushNumeric(features, 'awardee_karma', profile.awardee_karma);
    pushNumeric(features, 'awarder_karma', profile.awarder_karma);

    const explicitTotal = profile.total_karma;
    if (typeof explicitTotal === 'number') {
      pushNumeric(features, 'total_karma', explicitTotal);
    } else {
      const link = profile.link_karma ?? 0;
      const comment = profile.comment_karma ?? 0;
      if (typeof profile.link_karma === 'number' || typeof profile.comment_karma === 'number') {
        pushNumeric(features, 'total_karma', link + comment);
      }
    }

    if (
      typeof profile.link_karma === 'number' &&
      typeof profile.comment_karma === 'number' &&
      profile.link_karma + profile.comment_karma > 0
    ) {
      pushNumeric(
        features,
        'comment_karma_ratio',
        profile.comment_karma / (profile.link_karma + profile.comment_karma)
      );
    }

    pushBool(features, 'has_verified_email', profile.has_verified_email);
    pushBool(features, 'is_gold', profile.is_gold);
    pushBool(features, 'is_mod', profile.is_mod);
    pushBool(features, 'is_employee', profile.is_employee);
    pushBool(features, 'is_suspended', profile.is_suspended);

    if (typeof profile.created_utc === 'number' && Number.isFinite(profile.created_utc)) {
      const iso = new Date(profile.created_utc * 1000).toISOString();
      pushText(features, 'creation_date', iso);
      pushNumeric(features, 'creation_year', new Date(iso).getUTCFullYear());
    }

    const sub = profile.subreddit;
    const bio = redditProfileBio(profile);
    pushText(features, 'bio', bio);
    if (typeof bio === 'string') {
      pushNumeric(features, 'bio_length', bio.length);
      pushNumeric(features, 'bio_hashtag_count', countMatches(bio, /#[\w\u00C0-\uFFFF]+/g));
      pushNumeric(features, 'bio_mention_count', countMatches(bio, /\bu\/\w+|\br\/\w+/g));
      pushNumeric(features, 'bio_link_count', countMatches(bio, /https?:\/\/\S+/gi));
    }

    if (sub) {
      pushText(features, 'subreddit_title', sub.title);
      pushText(features, 'subreddit_display_name', sub.display_name);
      pushNumeric(features, 'subreddit_subscribers', sub.subscribers);
      pushBool(features, 'subreddit_over_18', sub.over_18);
      pushText(features, 'banner_image_url', sub.banner_img ?? sub.banner_background_image);
    }

    const iconUrl = profile.icon_img ?? profile.snoovatar_img ?? sub?.icon_img;
    pushText(features, 'icon_url', iconUrl);
    pushText(features, 'profile_image_url', iconUrl);
    pushBool(features, 'default_profile_image', isDefaultRedditAvatar(iconUrl));

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

export type { RedditProfileLike };

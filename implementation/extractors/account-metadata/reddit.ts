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
 *   Profile images:     icon_url, banner_url
 */

import type {
  AccountFeatureExtractor,
  ExtractorInput,
  ExtractedFeature,
} from '../types';
import type { ManifestEntry } from '../../archive/types';
import { entryMatchesPlatform } from '../platform';

const NAME = 'account_metadata_reddit';
const VERSION = '1.0.0';

interface RedditProfile {
  id?: string;
  name?: string; // username
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

export class RedditAccountMetadataExtractor implements AccountFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;

  filterEntry(entry: ManifestEntry): boolean {
    return entryMatchesPlatform(entry, 'reddit');
  }

  extract(input: ExtractorInput): ExtractedFeature[] {
    const profile = tryParseProfile(input.bytes);
    if (!profile) return [];
    if (!looksLikeReddit(profile)) return [];

    const features: ExtractedFeature[] = [];

    // Identity
    pushText(features, 'username', profile.name);
    pushText(features, 'platform_id', profile.id);

    // Karma
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

    // Karma ratio (link vs comment): tells you whether they're poster-shaped
    // or commenter-shaped. Highly skewed values can be diagnostic.
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

    // Status flags
    pushBool(features, 'has_verified_email', profile.has_verified_email);
    pushBool(features, 'is_gold', profile.is_gold);
    pushBool(features, 'is_mod', profile.is_mod);
    pushBool(features, 'is_employee', profile.is_employee);
    pushBool(features, 'is_suspended', profile.is_suspended);

    // Creation date (Reddit uses Unix epoch seconds)
    if (typeof profile.created_utc === 'number' && Number.isFinite(profile.created_utc)) {
      const iso = new Date(profile.created_utc * 1000).toISOString();
      pushText(features, 'creation_date', iso);
      pushNumeric(features, 'creation_year', new Date(iso).getUTCFullYear());
    }

    // Personal subreddit (bio-equivalent)
    const sub = profile.subreddit;
    if (sub) {
      const bio = sub.public_description ?? sub.description;
      pushText(features, 'bio', bio);
      if (typeof bio === 'string') {
        pushNumeric(features, 'bio_length', bio.length);
        pushNumeric(features, 'bio_hashtag_count', countMatches(bio, /#[\w\u00C0-\uFFFF]+/g));
        pushNumeric(features, 'bio_mention_count', countMatches(bio, /\bu\/\w+|\br\/\w+/g));
        pushNumeric(features, 'bio_link_count', countMatches(bio, /https?:\/\/\S+/gi));
      }

      pushText(features, 'subreddit_title', sub.title);
      pushText(features, 'subreddit_display_name', sub.display_name);
      pushNumeric(features, 'subreddit_subscribers', sub.subscribers);
      pushBool(features, 'subreddit_over_18', sub.over_18);

      pushText(features, 'banner_image_url', sub.banner_img ?? sub.banner_background_image);
    }

    // Profile images
    pushText(features, 'icon_url', profile.icon_img ?? profile.snoovatar_img);

    return features;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryParseProfile(bytes: Uint8Array): RedditProfile | null {
  try {
    const text = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') {
      // Reddit API often returns { kind: 't2', data: {...} }
      if (parsed.kind === 't2' && parsed.data && typeof parsed.data === 'object') {
        return parsed.data as RedditProfile;
      }
      if (parsed.data && typeof parsed.data === 'object' && !parsed.kind) {
        return parsed.data as RedditProfile;
      }
      return parsed as RedditProfile;
    }
    return null;
  } catch {
    return null;
  }
}

function looksLikeReddit(profile: RedditProfile): boolean {
  // Distinctive Reddit fields: created_utc (number), link_karma, comment_karma,
  // is_employee, snoovatar_img, the subreddit object's display_name_prefixed
  return (
    typeof profile.link_karma === 'number' ||
    typeof profile.comment_karma === 'number' ||
    typeof profile.created_utc === 'number' ||
    profile.is_employee !== undefined ||
    typeof profile.snoovatar_img === 'string' ||
    (profile.subreddit !== undefined &&
      typeof profile.subreddit.display_name_prefixed === 'string')
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

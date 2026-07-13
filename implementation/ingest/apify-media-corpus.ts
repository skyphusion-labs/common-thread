/**
 * Posted-image corpus building for Apify Twitter ingest.
 *
 * Extracts media URLs from timeline tweets and archives a per-account
 * `application/x-image-hash-corpus` artifact. Image bytes are not
 * downloaded in v1; URLs are preserved for URL-level overlap until a
 * collection-layer decoder supplies dHashes.
 */

import { ArchiveStore } from '../archive/store';
import { ManifestStore } from '../archive/manifest';
import { fetchUrlImageFeatures } from '../collection/image-decode';
import type { AccountExifCorpus } from './apify-exif-corpus';
import type { AccountTimeline } from './apify-timeline';

export const APIFY_TWITTER_POSTED_IMAGE_CORPUS_TOOL = 'apify-twitter-posted-image-corpus';
export const APIFY_TWITTER_BANNER_IMAGE_CORPUS_TOOL = 'apify-twitter-banner-image-corpus';
export const POSTED_IMAGE_CORPUS_MIME = 'application/x-image-hash-corpus';

export interface PostedImageCorpusEntry {
  url: string;
  tweet_id?: string;
  dhash?: string;
  sha256?: string;
}

export interface AccountPostedImageCorpus {
  account: string;
  hashes: PostedImageCorpusEntry[];
  imageType?: 'posted' | 'profile' | 'banner';
}

/**
 * Collect unique posted media URLs from an account's tweets.
 */
export function buildPostedImageCorpusFromTweets(
  tweets: unknown[]
): PostedImageCorpusEntry[] {
  const seen = new Set<string>();
  const entries: PostedImageCorpusEntry[] = [];

  for (const tweet of tweets) {
    if (!tweet || typeof tweet !== 'object') continue;
    const obj = tweet as Record<string, unknown>;
    const tweetId =
      obj.id != null ? String(obj.id) : obj.id_str != null ? String(obj.id_str) : undefined;

    for (const url of mediaUrlsFromTweet(obj)) {
      const normalized = normalizeMediaUrl(url);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      entries.push({
        url: normalized,
        tweet_id: tweetId,
      });
    }
  }

  entries.sort((a, b) => a.url.localeCompare(b.url));
  return entries;
}

const MAX_DHASH_FETCHES_PER_ACCOUNT = 12;

export interface EnrichedImageCorporaResult {
  corpora: AccountPostedImageCorpus[];
  exifCorpora: AccountExifCorpus[];
}

/**
 * Best-effort image fetch enrichment: dHash, content SHA-256, and EXIF
 * parsing share one fetch per URL. Failures are skipped per entry.
 */
export async function enrichPostedImageCorpora(
  corpora: AccountPostedImageCorpus[]
): Promise<EnrichedImageCorporaResult> {
  const out: AccountPostedImageCorpus[] = [];
  const exifCorpora: AccountExifCorpus[] = [];

  for (const corpus of corpora) {
    const hashes = [...corpus.hashes];
    const exifImages: AccountExifCorpus['images'] = [];
    let fetches = 0;

    for (const entry of hashes) {
      if (fetches >= MAX_DHASH_FETCHES_PER_ACCOUNT) break;
      if (entry.dhash && entry.sha256) continue;

      fetches++;
      const features = await fetchUrlImageFeatures(entry.url);
      if (!features) continue;

      if (features.dhash) entry.dhash = features.dhash;
      if (features.sha256) entry.sha256 = features.sha256;
      exifImages.push({
        url: entry.url,
        tweet_id: entry.tweet_id,
        exif: features.exif,
      });
    }

    out.push({ account: corpus.account, hashes, imageType: corpus.imageType });
    if (exifImages.length > 0) {
      exifCorpora.push({ account: corpus.account, images: exifImages });
    }
  }

  return { corpora: out, exifCorpora };
}

/** @deprecated Use enrichPostedImageCorpora */
export async function enrichPostedImageCorporaWithDhash(
  corpora: AccountPostedImageCorpus[]
): Promise<AccountPostedImageCorpus[]> {
  const { corpora: enriched } = await enrichPostedImageCorpora(corpora);
  return enriched;
}

export function buildPostedImageCorporaFromTimelines(
  timelines: AccountTimeline[]
): AccountPostedImageCorpus[] {
  const corpora: AccountPostedImageCorpus[] = [];
  for (const { account, tweets } of timelines) {
    const hashes = buildPostedImageCorpusFromTweets(tweets);
    if (hashes.length === 0) continue;
    corpora.push({ account, hashes });
  }
  return corpora;
}

export interface ProfileImageSource {
  account: string;
  profile: Record<string, unknown>;
}

/**
 * Build profile-image corpora from profile snapshots (one URL per account).
 */
export function buildProfileImageCorporaFromProfiles(
  profiles: ProfileImageSource[]
): AccountPostedImageCorpus[] {
  const corpora: AccountPostedImageCorpus[] = [];
  for (const { account, profile } of profiles) {
    const url = profileImageUrlFromSnapshot(profile);
    if (!url) continue;
    corpora.push({ account, hashes: [{ url }], imageType: 'profile' });
  }
  return corpora;
}

/**
 * Build banner-image corpora from profile snapshots (§4.5.2).
 */
export function buildBannerImageCorporaFromProfiles(
  profiles: ProfileImageSource[]
): AccountPostedImageCorpus[] {
  const corpora: AccountPostedImageCorpus[] = [];
  for (const { account, profile } of profiles) {
    const url = bannerImageUrlFromSnapshot(profile);
    if (!url) continue;
    corpora.push({ account, hashes: [{ url }], imageType: 'banner' });
  }
  return corpora;
}

function profileImageUrlFromSnapshot(profile: Record<string, unknown>): string | null {
  const url =
    (typeof profile.profilePicture === 'string' && profile.profilePicture) ||
    (typeof profile.profile_image_url === 'string' && profile.profile_image_url) ||
    (typeof profile.profile_image_url_https === 'string' &&
      profile.profile_image_url_https) ||
    null;
  return url ? normalizeMediaUrl(url) : null;
}

function bannerImageUrlFromSnapshot(profile: Record<string, unknown>): string | null {
  const url =
    (typeof profile.profileBannerUrl === 'string' && profile.profileBannerUrl) ||
    (typeof profile.profile_banner_url === 'string' && profile.profile_banner_url) ||
    (typeof profile.coverPicture === 'string' && profile.coverPicture) ||
    (typeof profile.banner_image_url === 'string' && profile.banner_image_url) ||
    null;
  return url ? normalizeMediaUrl(url) : null;
}

export interface ArchivePostedImageCorporaResult {
  manifestHashes: string[];
  artifactsCreated: number;
}

export async function archivePostedImageCorpora(
  env: { ARCHIVE: R2Bucket; MANIFEST_COORDINATOR?: DurableObjectNamespace },
  options: {
    investigationId: string;
    corpora: AccountPostedImageCorpus[];
    collectedAt: string;
    toolVersion?: string;
  }
): Promise<ArchivePostedImageCorporaResult> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId: options.investigationId, coordinator: env.MANIFEST_COORDINATOR });
  const toolVersion = options.toolVersion ?? '1';
  const manifestHashes: string[] = [];

  for (const { account, hashes, imageType } of options.corpora) {
    const body = { hashes };
    const bytes = new TextEncoder().encode(JSON.stringify(body));
    const { hash } = await archive.put(bytes, {
      mimeType: POSTED_IMAGE_CORPUS_MIME,
      extension: 'json',
    });

    const resolvedType = imageType ?? 'posted';
    const tool =
      resolvedType === 'profile'
        ? 'apify-twitter-profile-image-corpus'
        : resolvedType === 'banner'
          ? APIFY_TWITTER_BANNER_IMAGE_CORPUS_TOOL
          : APIFY_TWITTER_POSTED_IMAGE_CORPUS_TOOL;

    await manifest.append({
      hash,
      account,
      source: `https://x.com/${account}/${
        resolvedType === 'profile' ? 'photo' : resolvedType === 'banner' ? 'header' : 'media'
      }`,
      collectedAt: options.collectedAt,
      investigationId: options.investigationId,
      collectionMethod: {
        tool,
        version: toolVersion,
        platform: 'twitter',
        config: { image_count: hashes.length },
      },
      mimeType: POSTED_IMAGE_CORPUS_MIME,
      platformMetadata: { imageType: resolvedType },
      status: 'present',
    } as never);

    manifestHashes.push(hash);
  }

  return {
    manifestHashes,
    artifactsCreated: manifestHashes.length,
  };
}

function mediaUrlsFromTweet(tweet: Record<string, unknown>): string[] {
  const urls: string[] = [];

  const media = tweet.media;
  if (Array.isArray(media)) {
    pushMediaUrls(urls, media);
  }

  const extended = tweet.extendedEntities;
  if (extended && typeof extended === 'object') {
    pushMediaUrls(urls, (extended as Record<string, unknown>).media);
  }

  const entities = tweet.entities;
  if (entities && typeof entities === 'object') {
    pushMediaUrls(urls, (entities as Record<string, unknown>).media);
  }

  const retweet = tweet.retweet ?? tweet.retweetedTweet ?? tweet.retweeted_status;
  if (retweet && typeof retweet === 'object') {
    urls.push(...mediaUrlsFromTweet(retweet as Record<string, unknown>));
  }

  return urls;
}

function pushMediaUrls(out: string[], value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    for (const key of ['media_url_https', 'mediaUrlHttps', 'url']) {
      const v = obj[key];
      if (typeof v === 'string' && v.length > 0) out.push(v);
    }
  }
}

function normalizeMediaUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith('http')) return null;
  try {
    const parsed = new URL(trimmed);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

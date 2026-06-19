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
import { fetchUrlDhash } from '../collection/image-decode';
import type { AccountTimeline } from './apify-timeline';

export const APIFY_TWITTER_POSTED_IMAGE_CORPUS_TOOL = 'apify-twitter-posted-image-corpus';
export const POSTED_IMAGE_CORPUS_MIME = 'application/x-image-hash-corpus';

export interface PostedImageCorpusEntry {
  url: string;
  tweet_id?: string;
  dhash?: string;
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

/**
 * Best-effort dHash enrichment for corpus entries missing hashes.
 * Failures are skipped; URL-level overlap still works without dHash.
 */
export async function enrichPostedImageCorporaWithDhash(
  corpora: AccountPostedImageCorpus[]
): Promise<AccountPostedImageCorpus[]> {
  const out: AccountPostedImageCorpus[] = [];

  for (const corpus of corpora) {
    const hashes = [...corpus.hashes];
    let fetches = 0;

    for (const entry of hashes) {
      if (entry.dhash || fetches >= MAX_DHASH_FETCHES_PER_ACCOUNT) continue;
      fetches++;
      const hex = await fetchUrlDhash(entry.url);
      if (hex) entry.dhash = hex;
    }

    out.push({ account: corpus.account, hashes, imageType: corpus.imageType });
  }

  return out;
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
    const url =
      (typeof profile.profilePicture === 'string' && profile.profilePicture) ||
      (typeof profile.profile_image_url === 'string' && profile.profile_image_url) ||
      (typeof profile.profile_image_url_https === 'string' &&
        profile.profile_image_url_https) ||
      null;
    if (!url) continue;
    const normalized = normalizeMediaUrl(url);
    if (!normalized) continue;
    corpora.push({ account, hashes: [{ url: normalized }], imageType: 'profile' });
  }
  return corpora;
}

export interface ArchivePostedImageCorporaResult {
  manifestHashes: string[];
  artifactsCreated: number;
}

export async function archivePostedImageCorpora(
  env: { ARCHIVE: R2Bucket },
  options: {
    investigationId: string;
    corpora: AccountPostedImageCorpus[];
    collectedAt: string;
    toolVersion?: string;
  }
): Promise<ArchivePostedImageCorporaResult> {
  const archive = new ArchiveStore({ bucket: env.ARCHIVE });
  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId: options.investigationId });
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
        : APIFY_TWITTER_POSTED_IMAGE_CORPUS_TOOL;

    await manifest.append({
      hash,
      account,
      source: `https://x.com/${account}/${resolvedType === 'profile' ? 'photo' : 'media'}`,
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

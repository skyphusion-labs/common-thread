/**
 * Shared field accessors for Apify Twitter tweet objects.
 *
 * Apify scrapers vary by actor version: camelCase vs snake_case text
 * fields, `retweet` vs `retweetedTweet`, flat `author.*` keys, and
 * status URLs embedded in media expanded_url rather than embedded RT
 * objects. Extractors and the ingest parser use these helpers so
 * real scrape shapes resolve consistently.
 */

export interface ApifyTweetLike {
  id?: string | number;
  id_str?: string;
  tweetId?: string;
  url?: string;
  twitterUrl?: string;
  text?: string;
  full_text?: string;
  fullText?: string;
  createdAt?: string;
  created_at?: string;
  isReply?: boolean;
  isRetweet?: boolean;
  inReplyToId?: string | null;
  inReplyToUsername?: string | null;
  conversationId?: string | null;
  conversation_id?: string | null;
  timestamp?: string;
  in_reply_to_status_id?: string | number | null;
  in_reply_to_status_id_str?: string | null;
  in_reply_to_screen_name?: string | null;
  inReplyToTweetId?: string | null;
  inReplyToStatusId?: string | null;
  in_reply_to_tweet_id?: string | null;
  retweet?: Record<string, unknown> | null;
  retweetedTweet?: Record<string, unknown> | null;
  retweeted_status?: Record<string, unknown> | null;
  quoted_status?: Record<string, unknown> | null;
  quotedTweet?: Record<string, unknown> | null;
  author?: Record<string, unknown>;
  user?: Record<string, unknown>;
  entities?: Record<string, unknown>;
  extendedEntities?: Record<string, unknown>;
}

const STATUS_URL =
  /(?:twitter\.com|x\.com)\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/i;

/** Post body text across Apify / legacy field names. */
export function tweetText(post: ApifyTweetLike): string {
  return post.fullText ?? post.full_text ?? post.text ?? '';
}

export function tweetId(post: ApifyTweetLike): string | null {
  return (
    stringOrNull(post.id_str) ??
    stringOrNull(post.id) ??
    stringOrNull(post.tweetId)
  );
}

/** Author handle from nested author, flat keys, or the tweet status URL. */
export function authorHandleFromTweet(post: ApifyTweetLike): string | null {
  const author = post.author ?? post.user;
  if (author && typeof author === 'object') {
    for (const key of ['userName', 'username', 'screen_name', 'screenName', 'handle']) {
      const v = author[key];
      if (typeof v === 'string') {
        const h = normalizeTwitterHandle(v);
        if (h) return h;
      }
    }
  }

  const flat = (post as Record<string, unknown>)['author.userName'] ??
    (post as Record<string, unknown>)['author.username'];
  if (typeof flat === 'string') {
    const h = normalizeTwitterHandle(flat);
    if (h) return h;
  }

  for (const key of ['userName', 'username', 'handle']) {
    const v = (post as Record<string, unknown>)[key];
    if (typeof v === 'string') {
      const h = normalizeTwitterHandle(v);
      if (h) return h;
    }
  }

  return authorFromStatusUrl(post.url ?? post.twitterUrl);
}

export function authorFromStatusUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const m = STATUS_URL.exec(url);
  return m ? normalizeTwitterHandle(m[1]) : null;
}

export interface StatusUrlRef {
  author: string;
  postId: string;
}

/** Collect x.com/twitter.com status URLs from entities and media. */
export function statusUrlsFromTweet(post: ApifyTweetLike): StatusUrlRef[] {
  const urls: string[] = [];

  const entities = post.entities;
  if (entities && typeof entities === 'object') {
    pushUrlStrings(urls, entities.urls);
    pushUrlStrings(urls, entities.media);
  }

  const extended = post.extendedEntities;
  if (extended && typeof extended === 'object') {
    pushUrlStrings(urls, extended.urls);
    pushUrlStrings(urls, extended.media);
  }

  const media = (post as Record<string, unknown>).media;
  if (Array.isArray(media)) {
    pushUrlStrings(urls, media);
  }

  const seen = new Set<string>();
  const refs: StatusUrlRef[] = [];
  for (const raw of urls) {
    const m = STATUS_URL.exec(raw);
    if (!m) continue;
    const author = normalizeTwitterHandle(m[1]);
    const postId = m[2];
    if (!author) continue;
    const key = `${author}:${postId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push({ author, postId });
  }
  return refs;
}

/** Embedded retweet object across Apify field names. */
export function embeddedRetweet(
  post: ApifyTweetLike
): Record<string, unknown> | null {
  const embedded =
    post.retweet ?? post.retweetedTweet ?? post.retweeted_status ?? null;
  return embedded && typeof embedded === 'object' ? embedded : null;
}

export function firstMentionHandle(post: ApifyTweetLike): string | null {
  const entities = post.entities;
  if (!entities || typeof entities !== 'object') {
    return firstMentionFromText(tweetText(post));
  }
  const mentions = entities.user_mentions;
  if (!Array.isArray(mentions) || mentions.length === 0) {
    return firstMentionFromText(tweetText(post));
  }
  for (const mention of mentions) {
    if (!mention || typeof mention !== 'object') continue;
    const obj = mention as Record<string, unknown>;
    const screenName =
      typeof obj.screen_name === 'string'
        ? obj.screen_name
        : typeof obj.screenName === 'string'
          ? obj.screenName
          : typeof obj.userName === 'string'
            ? obj.userName
            : null;
    const h = normalizeTwitterHandle(screenName);
    if (h) return h;
  }
  return firstMentionFromText(tweetText(post));
}

function firstMentionFromText(text: string): string | null {
  const m = /@([A-Za-z0-9_]{1,15})\b/.exec(text);
  return m ? normalizeTwitterHandle(m[1]) : null;
}

function pushUrlStrings(out: string[], value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    for (const key of ['expanded_url', 'expandedUrl', 'url', 'unwound_url']) {
      const v = obj[key];
      if (typeof v === 'string' && v.length > 0) out.push(v);
    }
  }
}

export function normalizeTwitterHandle(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase().replace(/^@/, '');
  if (trimmed.length === 0) return null;
  if (!/^[a-z0-9_]{1,15}$/.test(trimmed)) return null;
  return trimmed;
}

function stringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

/** Skip Apify placeholder rows when a search returned nothing. */
export function isApifyNoResultsItem(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  return (item as Record<string, unknown>).noResults === true;
}

/** True when the object looks like a tweet/post rather than a wrapper. */
export function isApifyTweetLike(value: unknown): value is ApifyTweetLike {
  if (!value || typeof value !== 'object') return false;
  if (isApifyNoResultsItem(value)) return false;
  const obj = value as Record<string, unknown>;
  if (obj.type === 'user') return false;
  return (
    'text' in obj ||
    'fullText' in obj ||
    'full_text' in obj ||
    'createdAt' in obj ||
    'created_at' in obj ||
    'retweet' in obj ||
    'retweetedTweet' in obj ||
    'retweeted_status' in obj ||
    'quotedTweet' in obj ||
    'quoted_status' in obj ||
    'inReplyToId' in obj ||
    'in_reply_to_status_id' in obj ||
    'isReply' in obj ||
    'isRetweet' in obj
  );
}

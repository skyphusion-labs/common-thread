/**
 * Shared field accessors for Reddit post objects.
 *
 * Reddit artifacts arrive in several shapes: native API Listing envelopes
 * ({ kind: 'Listing', data: { children: [...] } }), bare Pushshift-style
 * objects with created_utc, Apify scraper rows (camelCase createdAt,
 * author, isSelf, permalink), and reddit-scraper-search-fast user
 * activity rows (kind post|comment, ISO created_utc, title + body).
 * Extractors and ingest parsers use these helpers so real scrape shapes
 * resolve consistently.
 */

export interface RedditPostLike {
  title?: string;
  selftext?: string;
  body?: string;
  text?: string;
  author?: string;
  subreddit?: string;
  subreddit_name_prefixed?: string;
  createdAt?: string;
  created_utc?: number | string;
  url?: string;
  permalink?: string;
  domain?: string;
  isSelf?: boolean;
  is_self?: boolean;
  parent_id?: string;
  parentId?: string;
  isComment?: boolean;
  link_flair_text?: string;
  linkFlairText?: string | null;
}

/** Post body text: title + selftext/body/text, in that precedence. */
export function redditPostText(post: RedditPostLike): string {
  const parts: string[] = [];
  if (typeof post.title === 'string' && post.title.length > 0) parts.push(post.title);
  if (typeof post.selftext === 'string' && post.selftext.length > 0) parts.push(post.selftext);
  if (typeof post.body === 'string' && post.body.length > 0) parts.push(post.body);
  if (typeof post.text === 'string' && post.text.length > 0) parts.push(post.text);
  return parts.join(' ').trim();
}

/** Raw timestamp before parseTimestamp (ISO string or Unix seconds). */
export function redditCreatedAtRaw(
  post: RedditPostLike
): string | number | undefined {
  if (typeof post.createdAt === 'string' && post.createdAt.length > 0) {
    return post.createdAt;
  }
  if (typeof post.created_utc === 'number' && Number.isFinite(post.created_utc)) {
    return post.created_utc;
  }
  if (typeof post.created_utc === 'string' && post.created_utc.length > 0) {
    return post.created_utc;
  }
  return undefined;
}

/** Unprefixed subreddit name ("programming", not "r/programming"). */
export function redditSubredditName(post: RedditPostLike): string | undefined {
  if (typeof post.subreddit === 'string' && post.subreddit.length > 0) {
    return post.subreddit.replace(/^r\//i, '');
  }
  if (
    typeof post.subreddit_name_prefixed === 'string' &&
    post.subreddit_name_prefixed.startsWith('r/')
  ) {
    return post.subreddit_name_prefixed.slice(2);
  }
  return undefined;
}

export function redditAuthorHandle(post: RedditPostLike): string | null {
  if (typeof post.author !== 'string' || post.author.length === 0) return null;
  return normalizeRedditUsername(post.author);
}

function normalizeRedditKind(kind: string | undefined): string | undefined {
  if (kind === undefined) return undefined;
  const k = kind.toLowerCase();
  if (k === 't1' || k === 'comment') return 't1';
  if (k === 't3' || k === 'post') return 't3';
  return kind;
}

export function isRedditCommentPost(post: RedditPostLike, kind?: string): boolean {
  const normalizedKind = normalizeRedditKind(kind);
  if (normalizedKind === 't1') return true;
  if (normalizedKind === 't3') return false;
  if (post.isComment === true) return true;
  if (typeof post.parent_id === 'string' && post.parent_id.length > 0) return true;
  if (typeof post.parentId === 'string' && post.parentId.length > 0) return true;
  if (typeof post.body === 'string' && typeof post.title !== 'string') return true;
  return false;
}

export function normalizeRedditUsername(
  raw: string | null | undefined
): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^u\//i, '').replace(/^@/, '');
  if (trimmed.length === 0) return null;
  if (trimmed.toLowerCase() === '[deleted]') return null;
  return trimmed;
}

/** Skip Apify placeholder rows when a search returned nothing. */
export function isApifyNoResultsItem(item: unknown): boolean {
  if (!item || typeof item !== 'object') return false;
  return (item as Record<string, unknown>).noResults === true;
}

/** True when the object looks like a Reddit post/comment rather than a wrapper. */
export function isRedditPostLike(value: unknown): value is RedditPostLike {
  if (!value || typeof value !== 'object') return false;
  if (isApifyNoResultsItem(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    'title' in obj ||
    'selftext' in obj ||
    'body' in obj ||
    'text' in obj ||
    'created_utc' in obj ||
    'createdAt' in obj ||
    'subreddit' in obj ||
    'subreddit_name_prefixed' in obj ||
    'permalink' in obj ||
    'parent_id' in obj ||
    'parentId' in obj
  );
}

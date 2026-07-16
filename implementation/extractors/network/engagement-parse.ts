/**
 * Shared parsing for Twitter engagement events (§4.4.3, §4.4.4).
 *
 * Converts timeline or per-tweet artifact bytes into discrete engagement
 * records (reply, repost, quote) suitable for event_features rows.
 */

import type { EngagementEventData, ExtractedEvent } from '../event-types';
import { engagementTargetKey } from './co-engagement-helpers';
import {
  authorHandleFromTweet,
  embeddedRetweet,
  firstMentionHandle,
  isApifyTweetLike,
  normalizeTwitterHandle,
  statusUrlsFromTweet,
  tweetId as tweetIdFromPost,
  tweetText,
  type ApifyTweetLike,
} from '../../ingest/apify-tweet-fields';

export type TweetLike = ApifyTweetLike;

const ENGAGEMENT_KINDS = new Set(['reply', 'repost', 'quote']);

/**
 * Parse artifact bytes into zero or more post-like objects.
 * Accepts arrays, common wrappers, or a single tweet object (Apify path).
 */
export function parsePosts(bytes: Uint8Array): TweetLike[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) {
    return parsed.filter(isPostLike);
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    for (const key of ['tweets', 'posts', 'statuses', 'data', 'items', 'timeline']) {
      const candidate = obj[key];
      if (Array.isArray(candidate)) {
        return candidate.filter(isPostLike);
      }
    }
    if (isPostLike(parsed)) return [parsed as TweetLike];
  }
  return [];
}

export function isPostLike(value: unknown): value is TweetLike {
  return isApifyTweetLike(value);
}

/**
 * Extract engagement events from posts authored by accountHandle.
 * Skips self-engagement and engagements without a resolvable target author.
 */
export function extractEngagementsFromPosts(
  accountHandle: string,
  posts: TweetLike[],
  options?: { collectionWindow?: string }
): ExtractedEvent[] {
  const actor = normalizeHandle(accountHandle);
  if (!actor) return [];

  const events: ExtractedEvent[] = [];
  for (const post of posts) {
    events.push(...extractEngagementsFromPost(actor, post, options?.collectionWindow));
  }
  return events;
}

function extractEngagementsFromPost(
  actor: string,
  post: TweetLike,
  collectionWindow?: string
): ExtractedEvent[] {
  const ts = parsePostTimestamp(post);
  if (!ts) return [];

  const sourcePostId = tweetIdFromPost(post);
  const conversationId = conversationIdFromPost(post);
  const events: ExtractedEvent[] = [];

  const reply = extractReply(actor, post, ts, sourcePostId, conversationId, collectionWindow);
  if (reply) events.push(reply);

  const repost = extractRepost(actor, post, ts, sourcePostId, conversationId, collectionWindow);
  if (repost) events.push(repost);

  const quote = extractQuote(actor, post, ts, sourcePostId, conversationId, collectionWindow);
  if (quote) events.push(quote);

  return events;
}

function conversationIdFromPost(post: TweetLike): string | null {
  return (
    stringOrNull(post.conversationId) ??
    stringOrNull(post.conversation_id)
  );
}

function extractReply(
  actor: string,
  post: TweetLike,
  eventTimestamp: string,
  sourcePostId: string | null,
  conversationId: string | null,
  collectionWindow?: string
): ExtractedEvent | null {
  let targetPostId =
    stringOrNull(post.in_reply_to_status_id_str) ??
    stringOrNull(post.in_reply_to_status_id) ??
    stringOrNull(post.inReplyToId) ??
    stringOrNull(post.inReplyToTweetId) ??
    stringOrNull(post.inReplyToStatusId) ??
    stringOrNull(post.in_reply_to_tweet_id);

  const isReply =
    post.isReply === true ||
    !!targetPostId ||
    stringOrNull(post.in_reply_to_screen_name) != null ||
    stringOrNull(post.inReplyToUsername) != null;

  if (!isReply) return null;

  if (!targetPostId && conversationId && conversationId !== sourcePostId) {
    targetPostId = conversationId;
  }

  let targetAuthor =
    normalizeTwitterHandle(post.inReplyToUsername) ??
    normalizeTwitterHandle(post.in_reply_to_screen_name) ??
    firstMentionHandle(post);

  if (targetAuthor === actor) return null;

  if (!targetPostId) {
    if (!targetAuthor) return null;
    targetPostId = `reply-mention:${targetAuthor}`;
  } else if (!targetAuthor) {
    targetAuthor = firstMentionHandle(post);
  }

  if (!targetAuthor || targetAuthor === actor) return null;

  return makeEvent('reply', eventTimestamp, {
    target_post_id: targetPostId,
    target_author: targetAuthor,
    source_post_id: sourcePostId,
    engagement_kind: 'reply',
    engagement_target_key: engagementTargetKey(targetAuthor, targetPostId),
    conversation_id: conversationId,
  }, collectionWindow);
}

function extractRepost(
  actor: string,
  post: TweetLike,
  eventTimestamp: string,
  sourcePostId: string | null,
  conversationId: string | null,
  collectionWindow?: string
): ExtractedEvent | null {
  const embedded = embeddedRetweet(post);
  if (embedded) {
    const targetAuthor = authorHandleFromTweet(embedded);
    const targetPostId = tweetIdFromPost(embedded);
    if (!targetAuthor || !targetPostId || targetAuthor === actor) return null;
    return makeEvent('repost', eventTimestamp, {
      target_post_id: targetPostId,
      target_author: targetAuthor,
      source_post_id: sourcePostId,
      engagement_kind: 'repost',
      engagement_target_key: engagementTargetKey(targetAuthor, targetPostId),
      conversation_id: conversationId,
    }, collectionWindow);
  }

  const text = tweetText(post);
  const rtMatch = /^RT @(\w+):/i.exec(text);
  if (!rtMatch && post.isRetweet !== true) return null;

  const targetAuthorFromPrefix = rtMatch
    ? normalizeTwitterHandle(rtMatch[1])
    : null;

  const statusRefs = statusUrlsFromTweet(post);
  const preferred = targetAuthorFromPrefix
    ? statusRefs.find(r => r.author === targetAuthorFromPrefix)
    : null;
  const fallback = statusRefs.find(r => r.author !== actor);
  const resolved = preferred ?? fallback;

  if (resolved && resolved.author !== actor) {
    return makeEvent('repost', eventTimestamp, {
      target_post_id: resolved.postId,
      target_author: resolved.author,
      source_post_id: sourcePostId,
      engagement_kind: 'repost',
      engagement_target_key: engagementTargetKey(resolved.author, resolved.postId),
      conversation_id: conversationId,
    }, collectionWindow);
  }

  if (!targetAuthorFromPrefix || targetAuthorFromPrefix === actor) return null;

  const syntheticId = `rt-prefix:${targetAuthorFromPrefix}`;
  return makeEvent('repost', eventTimestamp, {
    target_post_id: syntheticId,
    target_author: targetAuthorFromPrefix,
    source_post_id: sourcePostId,
    engagement_kind: 'repost',
    engagement_target_key: engagementTargetKey(targetAuthorFromPrefix, syntheticId),
    conversation_id: conversationId,
  }, collectionWindow);
}

function extractQuote(
  actor: string,
  post: TweetLike,
  eventTimestamp: string,
  sourcePostId: string | null,
  conversationId: string | null,
  collectionWindow?: string
): ExtractedEvent | null {
  const embedded = post.quotedTweet ?? post.quoted_status;
  if (!embedded) return null;

  const targetAuthor = authorHandleFromTweet(embedded);
  const targetPostId = tweetIdFromPost(embedded);
  if (!targetAuthor || !targetPostId || targetAuthor === actor) return null;

  return makeEvent('quote', eventTimestamp, {
    target_post_id: targetPostId,
    target_author: targetAuthor,
    source_post_id: sourcePostId,
    engagement_kind: 'quote',
    engagement_target_key: engagementTargetKey(targetAuthor, targetPostId),
    conversation_id: conversationId,
  }, collectionWindow);
}

function makeEvent(
  eventType: EngagementEventData['engagement_kind'],
  eventTimestamp: string,
  data: EngagementEventData,
  collectionWindow?: string
): ExtractedEvent {
  const eventData: EngagementEventData = { ...data };
  if (collectionWindow) {
    eventData.collection_window = collectionWindow;
  }
  return {
    eventType,
    eventTimestamp,
    eventData: { ...eventData },
  };
}

function parsePostTimestamp(post: TweetLike): string | null {
  const raw = post.createdAt ?? post.created_at ?? post.timestamp;
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function stringOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

export function normalizeHandle(raw: string | null | undefined): string | null {
  return normalizeTwitterHandle(raw);
}

export function parseEngagementEventData(
  eventType: string,
  eventDataJson: string | null
): EngagementEventData | null {
  if (!ENGAGEMENT_KINDS.has(eventType)) return null;
  if (!eventDataJson) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(eventDataJson);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const targetPostId = stringOrNull(obj.target_post_id);
  const targetAuthor = normalizeHandle(stringOrNull(obj.target_author));
  const kind = obj.engagement_kind;
  if (!targetPostId || !targetAuthor) return null;
  if (kind !== 'reply' && kind !== 'repost' && kind !== 'quote') return null;
  if (kind !== eventType) return null;

  const engagement_target_key =
    stringOrNull(obj.engagement_target_key) ??
    engagementTargetKey(targetAuthor, targetPostId);

  return {
    target_post_id: targetPostId,
    target_author: targetAuthor,
    source_post_id: stringOrNull(obj.source_post_id),
    engagement_kind: kind,
    engagement_target_key,
    conversation_id: stringOrNull(obj.conversation_id),
    collection_window: stringOrNull(obj.collection_window) ?? undefined,
  };
}

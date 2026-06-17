// implementation/ingest/apify-twitter-parser.ts

export interface ParsedTweet {
  account: string;
  tweet: any;
  collectedAt?: string;
  tweetId?: string;
}

export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let h = raw.trim().toLowerCase().replace(/^@/, '');
  h = h.replace(/[^a-z0-9_]/g, '');
  return h.length >= 1 ? h : null;
}

export function parseApifyTwitterItems(payload: any): ParsedTweet[] {
  const out: ParsedTweet[] = [];

  let items: any[] = [];
  if (Array.isArray(payload)) items = payload;
  else if (Array.isArray(payload?.items)) items = payload.items;
  else if (Array.isArray(payload?.data)) items = payload.data;
  else items = [payload];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;

    const author = item?.author || item?.user || {};
    const authorHandle = normalizeHandle(
      author.userName || author.username || author.handle ||
      item?.userName || item?.username || item?.handle
    );

    if (!authorHandle) continue;

    const collectedAt = item?.createdAt || item?.created_at || item?.timestamp || undefined;
    const tweetId = item?.id || item?.tweetId || undefined;

    out.push({
      account: authorHandle,
      tweet: item,
      collectedAt,
      tweetId,
    });
  }

  return out;
}

export function extractAllHandlesFromApifyTwitter(payload: any): string[] {
  const parsed = parseApifyTwitterItems(payload);
  return Array.from(new Set(parsed.map(p => p.account))).sort();
}

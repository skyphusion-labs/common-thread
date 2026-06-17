// implementation/ingest/apify-twitter-parser.ts
//
// Twitter/X-specific handle extraction for Apify scrape data.
// Other platforms (Reddit, etc.) should get their own parser later.

export function normalizeHandle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let h = raw.trim().toLowerCase().replace(/^@/, '');
  h = h.replace(/[^a-z0-9_]/g, '');
  return h.length >= 1 ? h : null;
}

export function extractHandlesFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();

  // RT @handle:
  const rtMatches = text.match(/RT\s+@([A-Za-z0-9_]+)/gi) || [];
  rtMatches.forEach(m => {
    const h = normalizeHandle(m.replace(/^RT\s+@/i, ''));
    if (h) out.add(h);
  });

  // @mentions
  const mentions = text.match(/@([A-Za-z0-9_]+)/g) || [];
  mentions.forEach(m => {
    const h = normalizeHandle(m);
    if (h) out.add(h);
  });

  return Array.from(out);
}

export function extractHandlesFromApifyTwitterItem(item: any): string[] {
  const out = new Set<string>();

  // === Author / user object (most common in Apify Twitter scrapes) ===
  const author = item?.author || item?.user || item?.profile || {};
  const candidates = [
    author.userName,
    author.username,
    author.handle,
    author.screen_name,
    author.authorUsername,
    item?.userName,
    item?.username,
    item?.handle,
    item?.authorUsername,
  ];
  candidates.forEach(c => {
    const h = normalizeHandle(c);
    if (h) out.add(h);
  });

  // === Text content ===
  const text = item?.fullText || item?.text || item?.tweet?.text || '';
  extractHandlesFromText(text).forEach(h => out.add(h));

  // === Entities / user_mentions ===
  const entities = item?.entities || item?.tweet?.entities || {};
  const userMentions = entities.user_mentions || entities.mentions || [];
  if (Array.isArray(userMentions)) {
    userMentions.forEach((m: any) => {
      const h = normalizeHandle(m.screen_name || m.username || m.userName);
      if (h) out.add(h);
    });
  }

  // === Media feature tags (seen in your sample) ===
  const media = item?.extendedEntities?.media || item?.media || [];
  if (Array.isArray(media)) {
    media.forEach((m: any) => {
      const tags = m?.features?.all?.tags || [];
      if (Array.isArray(tags)) {
        tags.forEach((t: any) => {
          const h = normalizeHandle(t.screen_name || t.name);
          if (h) out.add(h);
        });
      }
    });
  }

  // === Follower / following list style objects ===
  const list = item?.followers || item?.following || item?.friends || [];
  if (Array.isArray(list)) {
    list.forEach((u: any) => {
      const h = normalizeHandle(u.userName || u.username || u.handle);
      if (h) out.add(h);
    });
  }

  return Array.from(out);
}

export function extractAllHandlesFromApifyTwitter(payload: any): string[] {
  const all = new Set<string>();

  let items: any[] = [];

  if (Array.isArray(payload)) {
    items = payload;
  } else if (Array.isArray(payload?.items)) {
    items = payload.items;
  } else if (Array.isArray(payload?.data)) {
    items = payload.data;
  } else {
    items = [payload];
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    extractHandlesFromApifyTwitterItem(item).forEach(h => all.add(h));
  }

  return Array.from(all).sort();
}

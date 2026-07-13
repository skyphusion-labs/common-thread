/**
 * Dominant-language corpus filtering for stylometric extractors (§6.4.2).
 */

export interface DominantLanguageFilterResult<T> {
  dominant_language: string;
  items: T[];
  total_count: number;
  filtered_count: number;
}

/**
 * Keep posts whose language matches the dominant language in the corpus.
 * Posts without a language tag are excluded from the dominant-lang count
 * but included when dominant is unknown.
 */
export function filterByDominantLanguage<T>(
  items: T[],
  getLanguage: (item: T) => string | null | undefined,
  options: { minTaggedPosts?: number } = {}
): DominantLanguageFilterResult<T> {
  const minTagged = options.minTaggedPosts ?? 3;
  const counts = new Map<string, number>();

  for (const item of items) {
    const lang = normalizeLanguageCode(getLanguage(item));
    if (!lang) continue;
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }

  if (counts.size === 0) {
    return {
      dominant_language: 'unknown',
      items,
      total_count: items.length,
      filtered_count: items.length,
    };
  }

  let dominant = 'unknown';
  let best = -1;
  for (const [lang, count] of counts.entries()) {
    if (count > best) {
      dominant = lang;
      best = count;
    }
  }

  if (best < minTagged) {
    return {
      dominant_language: dominant,
      items,
      total_count: items.length,
      filtered_count: items.length,
    };
  }

  const filtered = items.filter((item) => {
    const lang = normalizeLanguageCode(getLanguage(item));
    return !lang || lang === dominant;
  });

  return {
    dominant_language: dominant,
    items: filtered.length > 0 ? filtered : items,
    total_count: items.length,
    filtered_count: filtered.length > 0 ? filtered.length : items.length,
  };
}

export function normalizeLanguageCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

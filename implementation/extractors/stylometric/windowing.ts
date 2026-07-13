/**
 * Corpus windowing for stylometric extractors (§6.4.4).
 */

export interface WindowSelectionResult<T> {
  items: T[];
  window: 'full' | 'recent_third';
  source_count: number;
}

/**
 * Select the most recent third of posts by timestamp (§6.4.4).
 * Requires at least 6 posts to emit a distinct recent window; otherwise
 * returns the full set so _recent features duplicate full-window stats.
 */
export function selectRecentThirdWindow<T>(
  items: T[],
  getTimestamp: (item: T) => string | null | undefined,
  options: { minPostsForWindow?: number } = {}
): WindowSelectionResult<T> {
  const minPosts = options.minPostsForWindow ?? 6;
  if (items.length < minPosts) {
    return { items, window: 'full', source_count: items.length };
  }

  const sorted = [...items].sort((a, b) => {
    const ta = Date.parse(getTimestamp(a) ?? '') || 0;
    const tb = Date.parse(getTimestamp(b) ?? '') || 0;
    return tb - ta;
  });

  const recentCount = Math.max(1, Math.ceil(sorted.length / 3));
  return {
    items: sorted.slice(0, recentCount),
    window: 'recent_third',
    source_count: sorted.length,
  };
}

/** Append `_recent` to stylometric feature names for window variants. */
export function withRecentSuffix(name: string): string {
  return name.endsWith('_recent') ? name : `${name}_recent`;
}

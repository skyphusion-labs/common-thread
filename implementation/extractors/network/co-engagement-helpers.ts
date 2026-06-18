/**
 * Pure helpers for §4.4.3 co-engagement timing pair features.
 */

import type { EngagementEventRecord } from '../event-types';

/** Operator-session heuristic: engagements within 5 minutes (paper §4.4.3). */
export const CO_ENGAGEMENT_TIGHT_WINDOW_MS = 5 * 60 * 1000;

export interface SharedCoEngagementTarget {
  target_key: string;
  target_author: string;
  target_post_id: string;
  delta_ms: number;
}

export function engagementTargetKey(targetAuthor: string, targetPostId: string): string {
  return `${targetAuthor}:${targetPostId}`;
}

/** Weak synthetic keys without a tweet id are excluded from co-engagement grouping. */
export function isCoEngagementEligibleTarget(targetPostId: string): boolean {
  return (
    !targetPostId.startsWith('rt-prefix:') &&
    !targetPostId.startsWith('reply-mention:')
  );
}

/**
 * Index third-party engagements by canonical target key.
 * Keeps the earliest event per (account, target_key) across engagement kinds.
 */
export function buildCoEngagementByTarget(
  seedAccounts: ReadonlyArray<{ account: string; events: EngagementEventRecord[] }>,
  seedSet: ReadonlySet<string>
): Map<string, EngagementEventRecord[]> {
  const earliestByAccountTarget = new Map<string, EngagementEventRecord>();

  for (const { account, events } of seedAccounts) {
    for (const ev of events) {
      if (seedSet.has(ev.targetAuthor)) continue;
      if (!isCoEngagementEligibleTarget(ev.targetPostId)) continue;

      const key = ev.engagementTargetKey;
      const dedupeKey = `${account}|${key}`;
      const existing = earliestByAccountTarget.get(dedupeKey);
      if (!existing || ev.timestampMs < existing.timestampMs) {
        earliestByAccountTarget.set(dedupeKey, ev);
      }
    }
  }

  const byTarget = new Map<string, EngagementEventRecord[]>();
  for (const ev of earliestByAccountTarget.values()) {
    const list = byTarget.get(ev.engagementTargetKey) ?? [];
    list.push(ev);
    byTarget.set(ev.engagementTargetKey, list);
  }

  for (const list of byTarget.values()) {
    list.sort((a, b) => a.timestampMs - b.timestampMs);
  }

  return byTarget;
}

export function pairCoEngagementDeltas(
  accountA: string,
  accountB: string,
  byTarget: ReadonlyMap<string, EngagementEventRecord[]>,
  seedSet: ReadonlySet<string>
): { deltasMs: number[]; sharedTargets: SharedCoEngagementTarget[] } {
  const deltasMs: number[] = [];
  const sharedTargets: SharedCoEngagementTarget[] = [];

  for (const events of byTarget.values()) {
    const seedEngagers = events.filter(e => seedSet.has(e.account));
    const accountsOnTarget = new Set(seedEngagers.map(e => e.account));
    if (!accountsOnTarget.has(accountA) || !accountsOnTarget.has(accountB)) continue;
    if (accountsOnTarget.size < 2) continue;

    const timesA = seedEngagers
      .filter(e => e.account === accountA)
      .map(e => e.timestampMs);
    const timesB = seedEngagers
      .filter(e => e.account === accountB)
      .map(e => e.timestampMs);
    if (timesA.length === 0 || timesB.length === 0) continue;

    const earliestA = Math.min(...timesA);
    const earliestB = Math.min(...timesB);
    const delta = Math.abs(earliestA - earliestB);
    deltasMs.push(delta);

    const sample = seedEngagers[0];
    sharedTargets.push({
      target_key: sample.engagementTargetKey,
      target_author: sample.targetAuthor,
      target_post_id: sample.targetPostId,
      delta_ms: delta,
    });
  }

  deltasMs.sort((a, b) => a - b);
  sharedTargets.sort(
    (a, b) => a.target_key.localeCompare(b.target_key) || a.delta_ms - b.delta_ms
  );

  return { deltasMs, sharedTargets };
}

export function populationMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, x) => s + x, 0) / values.length;
}

export function populationStdev(values: number[], mean?: number): number {
  if (values.length === 0) return 0;
  const m = mean ?? populationMean(values);
  let sumSq = 0;
  for (const v of values) {
    const d = v - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / values.length);
}

export function medianSorted(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

export interface CoEngagementBaseline {
  meanPairMeanDeltaMs: number;
  stdevPairMeanDeltaMs: number;
  pairSampleCount: number;
}

/**
 * Leave-it-in baseline across seed pairs (same conservative pattern as
 * follower_overlap_network §4.4.1).
 */
export function buildCoEngagementBaseline(
  seedAccounts: ReadonlyArray<{ account: string; events: EngagementEventRecord[] }>,
  byTarget: ReadonlyMap<string, EngagementEventRecord[]>
): CoEngagementBaseline {
  const seedSet = new Set(seedAccounts.map(s => s.account));
  const accounts = seedAccounts.map(s => s.account).sort();
  const pairMeans: number[] = [];

  for (let i = 0; i < accounts.length - 1; i++) {
    for (let j = i + 1; j < accounts.length; j++) {
      const { deltasMs } = pairCoEngagementDeltas(accounts[i], accounts[j], byTarget, seedSet);
      if (deltasMs.length === 0) continue;
      pairMeans.push(populationMean(deltasMs));
    }
  }

  if (pairMeans.length === 0) {
    return { meanPairMeanDeltaMs: 0, stdevPairMeanDeltaMs: 0, pairSampleCount: 0 };
  }

  const mean = populationMean(pairMeans);
  return {
    meanPairMeanDeltaMs: mean,
    stdevPairMeanDeltaMs: populationStdev(pairMeans, mean),
    pairSampleCount: pairMeans.length,
  };
}

export function countUnderThreshold(sortedDeltasMs: number[], thresholdMs: number): number {
  let count = 0;
  for (const d of sortedDeltasMs) {
    if (d <= thresholdMs) count++;
    else break;
  }
  return count;
}

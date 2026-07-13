/**
 * Investigation-level cluster composition (§7.3.3).
 *
 * Deterministic post-pass over completed attribution_runs: transitive
 * clusters from pair bands, weakened one level below the weakest link.
 */

import type { ConfidenceBand } from '../schema/db-types';
import {
  ALL_BANDS,
  bandValue,
  clusterBandFromPairBands,
} from './bands';

export interface AccountRef {
  account: string;
  platform: string;
}

export interface ComposedClusterClaim {
  accounts: AccountRef[];
  confidence_band: ConfidenceBand;
  /** Attribution run ids whose pair edges support this cluster. */
  supporting_run_ids: number[];
  /** Constituent target-target pairs and their bands. */
  constituent_pairs: Array<{
    account_a: string;
    account_b: string;
    platform_a: string;
    platform_b: string;
    confidence_band: ConfidenceBand;
    attribution_run_id: number;
  }>;
}

export interface InvestigationComposition {
  composed_at: string;
  cluster_claims: ComposedClusterClaim[];
}

export interface CompositionRunInput {
  id: number;
  account_a: string;
  account_b: string;
  platform_a: string;
  platform_b: string;
  confidence_band: ConfidenceBand;
}

function accountKey(ref: AccountRef): string {
  return `${ref.platform}:${ref.account}`;
}

function parseAccountKey(key: string): AccountRef {
  const idx = key.indexOf(':');
  if (idx < 0) return { platform: 'unknown', account: key };
  return { platform: key.slice(0, idx), account: key.slice(idx + 1) };
}

class UnionFind {
  private parent = new Map<string, string>();

  find(x: string): string {
    const p = this.parent.get(x);
    if (!p || p === x) {
      this.parent.set(x, x);
      return x;
    }
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }

  components(): Map<string, Set<string>> {
    const groups = new Map<string, Set<string>>();
    for (const key of this.parent.keys()) {
      const root = this.find(key);
      if (!groups.has(root)) groups.set(root, new Set());
      groups.get(root)!.add(key);
    }
    return groups;
  }
}

/**
 * Compose cluster claims from attribution run rows.
 *
 * Only target-target pairs with band >= consistent participate. Clusters
 * require three or more accounts (pair-level output already covers pairs).
 */
export function composeInvestigationClusters(
  runs: CompositionRunInput[],
  controlKeys: Set<string>
): InvestigationComposition {
  const uf = new UnionFind();
  const edgeRuns = new Map<string, CompositionRunInput[]>();

  const pairKey = (run: CompositionRunInput) =>
    [
      run.platform_a,
      run.account_a,
      run.platform_b,
      run.account_b,
    ].join('|');

  for (const run of runs) {
    const keyA = `${run.platform_a}:${run.account_a}`;
    const keyB = `${run.platform_b}:${run.account_b}`;
    if (controlKeys.has(keyA) || controlKeys.has(keyB)) continue;
    if (bandValue(run.confidence_band) < bandValue('consistent')) continue;

    uf.find(keyA);
    uf.find(keyB);
    uf.union(keyA, keyB);

    const edge = pairKey(run);
    if (!edgeRuns.has(edge)) edgeRuns.set(edge, []);
    edgeRuns.get(edge)!.push(run);
  }

  const clusterClaims: ComposedClusterClaim[] = [];

  for (const members of uf.components().values()) {
    if (members.size < 3) continue;

    const memberKeys = [...members].sort();
    const accounts = memberKeys.map(parseAccountKey);
    const memberSet = new Set(memberKeys);

    const constituent: ComposedClusterClaim['constituent_pairs'] = [];
    const supportingRunIds = new Set<number>();

    for (const run of runs) {
      const keyA = `${run.platform_a}:${run.account_a}`;
      const keyB = `${run.platform_b}:${run.account_b}`;
      if (!memberSet.has(keyA) || !memberSet.has(keyB)) continue;
      if (controlKeys.has(keyA) || controlKeys.has(keyB)) continue;
      if (bandValue(run.confidence_band) < bandValue('consistent')) continue;

      constituent.push({
        account_a: run.account_a,
        account_b: run.account_b,
        platform_a: run.platform_a,
        platform_b: run.platform_b,
        confidence_band: run.confidence_band,
        attribution_run_id: run.id,
      });
      supportingRunIds.add(run.id);
    }

    if (constituent.length === 0) continue;

    const clusterBand = clusterBandFromPairBands(
      constituent.map((p) => p.confidence_band)
    );

    clusterClaims.push({
      accounts,
      confidence_band: clusterBand,
      supporting_run_ids: [...supportingRunIds].sort((a, b) => a - b),
      constituent_pairs: constituent,
    });
  }

  clusterClaims.sort((a, b) => {
    const ak = a.accounts.map((x) => accountKey(x)).join(',');
    const bk = b.accounts.map((x) => accountKey(x)).join(',');
    return ak.localeCompare(bk);
  });

  return {
    composed_at: new Date().toISOString(),
    cluster_claims: clusterClaims,
  };
}

/** Human-readable band label for packet cover summaries. */
export function formatBandSummary(counts: Record<ConfidenceBand, number>): string {
  return ALL_BANDS.map((band) => `${band}: ${counts[band] ?? 0}`).join(', ');
}

/**
 * Control-account comparison reporting (§5.1.4).
 *
 * Post-reasoning pass: flag claims whose cited pair signals also fire
 * comparably on target-control pairs.
 */

import type { DatabaseClient } from '../db';
import { readFeatureValue } from '../schema/db-types';
import type { FeatureValue } from '../schema/db-types';
import type { ControlComparison, ReasoningClaim, ReasoningOutput } from './types';
import { parseSignalId } from './types';

function numericMagnitude(value: FeatureValue): number | null {
  if (value.kind === 'numeric') return value.value;
  if (value.kind === 'json' && value.value && typeof value.value === 'object') {
    const obj = value.value as Record<string, unknown>;
    if (typeof obj.value === 'number') return obj.value;
    if (typeof obj.similarity === 'number') return obj.similarity;
    if (typeof obj.jaccard === 'number') return obj.jaccard;
  }
  return null;
}

/**
 * True when the control pair shows a pattern as strong as the target pair
 * on the same feature (§5.1.4(c)).
 */
export function signalsComparableOnControl(
  featureName: string,
  targetValue: FeatureValue,
  controlValue: FeatureValue
): boolean {
  const target = numericMagnitude(targetValue);
  const control = numericMagnitude(controlValue);
  if (target === null || control === null) return false;

  const name = featureName.toLowerCase();
  if (name.includes('similarity') || name.includes('jaccard') || name.includes('overlap')) {
    return target >= 0.35 && control >= target * 0.7;
  }
  if (name.includes('distance') || name.includes('jsd')) {
    return target <= 0.6 && control <= Math.max(target * 1.3, target + 0.05);
  }
  return target >= 0.4 && control >= target * 0.7;
}

function canonicalPair(
  accountA: string,
  platformA: string,
  accountB: string,
  platformB: string
): { account_a: string; account_b: string; platform_a: string; platform_b: string } {
  const left = { account: accountA, platform: platformA };
  const right = { account: accountB, platform: platformB };
  const cmp = `${left.platform}:${left.account}`.localeCompare(
    `${right.platform}:${right.account}`
  );
  return cmp <= 0
    ? {
        account_a: left.account,
        platform_a: left.platform,
        account_b: right.account,
        platform_b: right.platform,
      }
    : {
        account_a: right.account,
        platform_a: right.platform,
        account_b: left.account,
        platform_b: left.platform,
      };
}

async function loadPairFeatureById(
  db: DatabaseClient,
  investigationId: string,
  rowId: number
): Promise<{
  feature_name: string;
  value: FeatureValue;
  account_a: string;
  account_b: string;
  platform_a: string;
  platform_b: string;
} | null> {
  const row = await db
    .prepare(
      `SELECT feature_name, feature_value_text, feature_value_numeric, feature_value_json,
              account_a, account_b, platform_a, platform_b
       FROM pair_features
       WHERE id = ? AND investigation_id = ?`
    )
    .bind(rowId, investigationId)
    .first<{
      feature_name: string;
      feature_value_text: string | null;
      feature_value_numeric: number | null;
      feature_value_json: string | null;
      account_a: string;
      account_b: string;
      platform_a: string;
      platform_b: string;
    }>();
  if (!row) return null;
  return {
    feature_name: row.feature_name,
    value: readFeatureValue(row),
    account_a: row.account_a,
    account_b: row.account_b,
    platform_a: row.platform_a,
    platform_b: row.platform_b,
  };
}

async function loadControlPairFeature(
  db: DatabaseClient,
  investigationId: string,
  targetAccount: string,
  targetPlatform: string,
  controlAccount: string,
  controlPlatform: string,
  featureName: string
): Promise<{ id: number; value: FeatureValue } | null> {
  const pair = canonicalPair(
    targetAccount,
    targetPlatform,
    controlAccount,
    controlPlatform
  );
  const row = await db
    .prepare(
      `SELECT id, feature_value_text, feature_value_numeric, feature_value_json
       FROM pair_features
       WHERE investigation_id = ?
         AND account_a = ? AND account_b = ?
         AND platform_a = ? AND platform_b = ?
         AND feature_name = ?
       LIMIT 1`
    )
    .bind(
      investigationId,
      pair.account_a,
      pair.account_b,
      pair.platform_a,
      pair.platform_b,
      featureName
    )
    .first<{
      id: number;
      feature_value_text: string | null;
      feature_value_numeric: number | null;
      feature_value_json: string | null;
    }>();
  if (!row) return null;
  return { id: row.id, value: readFeatureValue(row) };
}

function summarizeValue(value: FeatureValue): string {
  if (value.kind === 'numeric') return String(value.value);
  if (value.kind === 'text') return value.value;
  return JSON.stringify(value.value);
}

/**
 * Annotate reasoning output with control comparisons and unreliable flags.
 */
export async function annotateControlComparisons(
  db: DatabaseClient,
  investigationId: string,
  pair: {
    account_a: string;
    account_b: string;
    platform_a: string;
    platform_b: string;
  },
  controlAccounts: Array<{ account: string; platform: string }>,
  output: ReasoningOutput
): Promise<ReasoningOutput> {
  if (controlAccounts.length === 0 || output.claims.length === 0) {
    return output;
  }

  const comparisons: ControlComparison[] = [];
  const unreliable = new Set<number>();
  const targets = [
    { account: pair.account_a, platform: pair.platform_a },
    { account: pair.account_b, platform: pair.platform_b },
  ];

  for (let claimIndex = 0; claimIndex < output.claims.length; claimIndex++) {
    const claim = output.claims[claimIndex]!;
    if (claim.confidence_band === 'insufficient') continue;

    for (const citation of claim.citations) {
      const parsed = parseSignalId(String(citation.signal_id));
      if (!parsed || parsed.table !== 'pair_features') continue;

      const feature = await loadPairFeatureById(db, investigationId, parsed.rowId);
      if (!feature) continue;

      for (const target of targets) {
        for (const control of controlAccounts) {
          if (target.account === control.account && target.platform === control.platform) {
            continue;
          }

          const controlFeature = await loadControlPairFeature(
            db,
            investigationId,
            target.account,
            target.platform,
            control.account,
            control.platform,
            feature.feature_name
          );
          if (!controlFeature) continue;

          if (
            !signalsComparableOnControl(
              feature.feature_name,
              feature.value,
              controlFeature.value
            )
          ) {
            continue;
          }

          comparisons.push({
            claim_index: claimIndex,
            control_account: control.account,
            control_platform: control.platform,
            target_account: target.account,
            target_platform: target.platform,
            matching_features: [
              {
                feature_name: feature.feature_name,
                target_signal_id: `pair:${parsed.rowId}`,
                control_signal_id: `pair:${controlFeature.id}`,
                target_value_summary: summarizeValue(feature.value),
                control_value_summary: summarizeValue(controlFeature.value),
              },
            ],
          });
          unreliable.add(claimIndex);
        }
      }
    }
  }

  if (comparisons.length === 0) {
    return output;
  }

  const claims: ReasoningClaim[] = output.claims.map((claim, index) => {
    if (!unreliable.has(index)) return claim;
    return {
      ...claim,
      reasoning: `${claim.reasoning} [§5.1.4: flagged unreliable — cited signals also match target-control pairs.]`,
    };
  });

  return {
    ...output,
    claims,
    control_comparisons: comparisons,
    unreliable_claim_indices: [...unreliable].sort((a, b) => a - b),
  };
}

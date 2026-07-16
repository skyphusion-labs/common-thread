/**
 * Pair features for code-switching / register patterns (§4.3.4).
 *
 * Compares register distributions (JSD), switch rates (absolute
 * difference), and optional code-switch pattern distributions.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import { dictJensenShannonDivergence } from '../metadata-leakage/distribution-jsd';

function getNumeric(features: AccountFeatureMap, name: string): number | null {
  const v = features.get(name);
  if (!v || v.kind !== 'numeric') return null;
  if (typeof v.value !== 'number' || !Number.isFinite(v.value)) return null;
  return v.value;
}

function getCountDict(
  features: AccountFeatureMap,
  name: string
): Record<string, number> | null {
  const v = features.get(name);
  if (!v || v.kind !== 'json') return null;
  if (!v.value || typeof v.value !== 'object' || Array.isArray(v.value)) {
    return null;
  }
  const out: Record<string, number> = {};
  for (const [k, c] of Object.entries(v.value as Record<string, unknown>)) {
    if (typeof c !== 'number' || !Number.isFinite(c) || c < 0) return null;
    out[k] = c;
  }
  if (Object.keys(out).length === 0) return null;
  return out;
}

export class RegisterPatternPairExtractor implements PairFeatureExtractor {
  readonly name = 'register_pattern_stylometric';
  readonly version = '1.0.0';
  readonly category = 'stylometric' as const;
  readonly requiredAccountFeatures = [
    'register_distribution',
    'register_switch_rate',
  ] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const distA = getCountDict(featuresA, 'register_distribution');
    const distB = getCountDict(featuresB, 'register_distribution');
    const rateA = getNumeric(featuresA, 'register_switch_rate');
    const rateB = getNumeric(featuresB, 'register_switch_rate');
    if (!distA || !distB || rateA === null || rateB === null) return [];

    return [
      {
        category: 'stylometric',
        name: 'jsd_register',
        value: {
          kind: 'numeric',
          value: dictJensenShannonDivergence(distA, distB),
        },
      },
      {
        category: 'stylometric',
        name: 'register_switch_rate_abs_diff',
        value: { kind: 'numeric', value: Math.abs(rateA - rateB) },
      },
    ];
  }
}

export class CodeSwitchPatternPairExtractor implements PairFeatureExtractor {
  readonly name = 'code_switch_pattern_stylometric';
  readonly version = '1.0.0';
  readonly category = 'stylometric' as const;
  readonly requiredAccountFeatures = ['code_switch_post_rate'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const rateA = getNumeric(featuresA, 'code_switch_post_rate');
    const rateB = getNumeric(featuresB, 'code_switch_post_rate');
    if (rateA === null || rateB === null) return [];

    const features: ExtractedFeature[] = [
      {
        category: 'stylometric',
        name: 'code_switch_post_rate_abs_diff',
        value: { kind: 'numeric', value: Math.abs(rateA - rateB) },
      },
    ];

    const patA = getCountDict(featuresA, 'code_switch_pattern_distribution');
    const patB = getCountDict(featuresB, 'code_switch_pattern_distribution');
    if (patA && patB) {
      features.push({
        category: 'stylometric',
        name: 'jsd_code_switch_pattern',
        value: {
          kind: 'numeric',
          value: dictJensenShannonDivergence(patA, patB),
        },
      });
    }

    const langRateA = getNumeric(featuresA, 'inter_post_language_switch_rate');
    const langRateB = getNumeric(featuresB, 'inter_post_language_switch_rate');
    if (langRateA !== null && langRateB !== null) {
      features.push({
        category: 'stylometric',
        name: 'inter_post_language_switch_rate_abs_diff',
        value: {
          kind: 'numeric',
          value: Math.abs(langRateA - langRateB),
        },
      });
    }

    return features;
  }
}

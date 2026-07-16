/**
 * Pair features for typo / error patterns (§4.3.5).
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

export class TypoErrorPairExtractor implements PairFeatureExtractor {
  readonly name = 'typo_error_stylometric';
  readonly version = '1.0.0';
  readonly category = 'stylometric' as const;
  readonly requiredAccountFeatures = ['typo_error_rate'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const rateA = getNumeric(featuresA, 'typo_error_rate');
    const rateB = getNumeric(featuresB, 'typo_error_rate');
    if (rateA === null || rateB === null) return [];

    const features: ExtractedFeature[] = [
      {
        category: 'stylometric',
        name: 'typo_error_rate_abs_diff',
        value: { kind: 'numeric', value: Math.abs(rateA - rateB) },
      },
    ];

    const errA = getCountDict(featuresA, 'typo_error_distribution');
    const errB = getCountDict(featuresB, 'typo_error_distribution');
    if (errA && errB) {
      features.push({
        category: 'stylometric',
        name: 'jsd_typo_error',
        value: {
          kind: 'numeric',
          value: dictJensenShannonDivergence(errA, errB),
        },
      });
    }

    const confA = getCountDict(featuresA, 'confusion_form_distribution');
    const confB = getCountDict(featuresB, 'confusion_form_distribution');
    if (confA && confB) {
      features.push({
        category: 'stylometric',
        name: 'jsd_confusion_form',
        value: {
          kind: 'numeric',
          value: dictJensenShannonDivergence(confA, confB),
        },
      });
    }

    return features;
  }
}

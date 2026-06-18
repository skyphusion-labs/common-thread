/**
 * Per-feature confidence flags per §6.4.1.
 *
 * Stored on feature rows at extraction time. The reasoner maps
 * sufficient → 'sufficient', marginal/insufficient → 'degraded' for
 * §7.3.1 band rules.
 */

import type { FeatureValue } from '../schema/db-types';

export type StoredFeatureConfidence = 'sufficient' | 'marginal' | 'insufficient';

/**
 * Derive a stored confidence flag from a feature's category, name,
 * and packed value. Extractors may override by setting confidence on
 * ExtractedFeature directly.
 */
export function deriveStoredConfidence(
  category: string,
  name: string,
  value: FeatureValue
): StoredFeatureConfidence {
  if (value.kind === 'json') {
    const v = value.value;
    if (Array.isArray(v) && v.length === 0) {
      if (
        name.endsWith('_set') ||
        name.includes('_top') ||
        name.includes('latencies') ||
        name.includes('ngrams')
      ) {
        return 'insufficient';
      }
      return 'marginal';
    }
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) {
      return 'insufficient';
    }
  }

  if (value.kind === 'numeric') {
    const n = value.value;
    if (name === 'post_count' || name === 'token_count') {
      if (n <= 0) return 'insufficient';
      if (n < 20) return 'marginal';
      return 'sufficient';
    }
    if (name.includes('overlap') && n === 0 && !name.includes('baseline')) {
      return 'marginal';
    }
  }

  if (category === 'temporal' && name.includes('latency') && value.kind === 'json') {
    const arr = value.value;
    if (!Array.isArray(arr) || arr.length === 0) return 'insufficient';
  }

  if (category === 'stylometric' && (name.includes('distinctive') || name.includes('phrase'))) {
    if (value.kind === 'json' && Array.isArray(value.value) && value.value.length < 5) {
      return 'marginal';
    }
  }

  return 'sufficient';
}

/** Map stored §6.4.1 flags to reasoner presentation flags (§7.4.1). */
export function toPresentationConfidence(
  stored: StoredFeatureConfidence | null | undefined,
  extractorRunSufficient: boolean
): 'sufficient' | 'degraded' {
  if (stored === 'sufficient') return 'sufficient';
  if (stored === 'marginal' || stored === 'insufficient') return 'degraded';
  return extractorRunSufficient ? 'sufficient' : 'degraded';
}

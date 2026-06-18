/**
 * Creation-date clustering pair extractor (§4.1.1).
 *
 * Emits pairwise time delta between account creation timestamps.
 * Clustering against community baseline is a reasoning-layer concern;
 * the extractor only materializes the delta.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';

const NAME = 'creation_date_cluster_account_metadata';
const VERSION = '1.0.0';

export class CreationDateClusterExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'account_metadata' as const;
  readonly requiredAccountFeatures = ['creation_date'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const isoA = readIso(featuresA);
    const isoB = readIso(featuresB);
    if (!isoA || !isoB) return [];

    const msA = Date.parse(isoA);
    const msB = Date.parse(isoB);
    if (!Number.isFinite(msA) || !Number.isFinite(msB)) return [];

    const deltaMs = Math.abs(msA - msB);
    const deltaDays = deltaMs / (24 * 60 * 60 * 1000);

    return [
      {
        category: 'account_metadata',
        name: 'creation_date_delta_ms',
        value: { kind: 'numeric', value: deltaMs },
      },
      {
        category: 'account_metadata',
        name: 'creation_date_delta_days',
        value: { kind: 'numeric', value: deltaDays },
      },
      {
        category: 'account_metadata',
        name: 'creation_date_within_7_days',
        value: { kind: 'numeric', value: deltaDays <= 7 ? 1 : 0 },
      },
      {
        category: 'account_metadata',
        name: 'creation_date_within_30_days',
        value: { kind: 'numeric', value: deltaDays <= 30 ? 1 : 0 },
      },
    ];
  }
}

function readIso(features: AccountFeatureMap): string | null {
  const v = features.get('creation_date');
  if (!v || v.kind !== 'text') return null;
  const s = v.value.trim();
  return s.length > 0 ? s : null;
}

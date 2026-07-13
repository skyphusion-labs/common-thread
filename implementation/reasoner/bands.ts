/**
 * Confidence band ordering shared across runner, validator, and composition.
 */

import type { ConfidenceBand } from '../schema/db-types';

export const ALL_BANDS: ConfidenceBand[] = [
  'insufficient',
  'consistent',
  'strongly_consistent',
];

export const BAND_ORDER: Record<ConfidenceBand, number> = {
  insufficient: 0,
  consistent: 1,
  strongly_consistent: 2,
};

export function bandValue(band: ConfidenceBand): number {
  return BAND_ORDER[band];
}

export function bandFromValue(value: number): ConfidenceBand {
  const clamped = Math.max(0, Math.min(2, value));
  return ALL_BANDS[clamped]!;
}

/** §7.6.5: lower achievable band by one level for non-English investigations. */
export function capBandForNonEnglish(
  band: ConfidenceBand,
  isNonEnglish: boolean
): ConfidenceBand {
  if (!isNonEnglish) return band;
  return bandFromValue(bandValue(band) - 1);
}

/** §7.3.3: cluster band is one level below minimum constituent pair band. */
export function clusterBandFromPairBands(pairBands: ConfidenceBand[]): ConfidenceBand {
  if (pairBands.length === 0) return 'insufficient';
  const min = Math.min(...pairBands.map(bandValue));
  return bandFromValue(Math.max(0, min - 1));
}

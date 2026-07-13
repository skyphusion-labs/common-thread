/**
 * Intra-account stylometric variance (§6.4.3).
 *
 * Splits a corpus into chronological chunks and measures mean pairwise
 * Burrows-like distance across chunks. High variance suggests multiple
 * authors sharing one account.
 */

import {
  FUNCTION_WORD_INDEX,
  FUNCTION_WORD_VECTOR_LENGTH,
} from './function-words';
import { tokenize } from './text-helpers';

const DEFAULT_CHUNK_COUNT = 4;
const HIGH_VARIANCE_THRESHOLD = 0.35;

function functionWordVector(tokens: string[]): number[] {
  const counts = new Array(FUNCTION_WORD_VECTOR_LENGTH).fill(0) as number[];
  let total = tokens.length;
  if (total === 0) return counts.map(() => 0);

  for (const tok of tokens) {
    const idx = FUNCTION_WORD_INDEX.get(tok);
    if (idx !== undefined) counts[idx]++;
  }
  return counts.map((c) => c / total);
}

function meanAbsZDiff(a: number[], b: number[]): number {
  let sum = 0;
  let used = 0;
  for (let j = 0; j < FUNCTION_WORD_VECTOR_LENGTH; j++) {
    const mean = (a[j] + b[j]) / 2;
    const diff = Math.abs(a[j] - b[j]);
    if (mean > 0 || diff > 0) {
      sum += diff;
      used++;
    }
  }
  return used > 0 ? sum / used : 0;
}

export interface InternalVarianceResult {
  variance: number;
  chunk_count: number;
  high_internal_variance: boolean;
}

/**
 * Compute intra-account stylometric variance from cleaned post texts.
 */
export function computeInternalStylometricVariance(
  cleanedTexts: string[],
  options: { chunkCount?: number; threshold?: number } = {}
): InternalVarianceResult | null {
  const chunkCount = options.chunkCount ?? DEFAULT_CHUNK_COUNT;
  const threshold = options.threshold ?? HIGH_VARIANCE_THRESHOLD;

  if (cleanedTexts.length < chunkCount * 2) {
    return null;
  }

  const chunkSize = Math.ceil(cleanedTexts.length / chunkCount);
  const vectors: number[][] = [];

  for (let i = 0; i < cleanedTexts.length; i += chunkSize) {
    const slice = cleanedTexts.slice(i, i + chunkSize);
    const tokens = tokenize(slice.join(' '));
    if (tokens.length < 20) continue;
    vectors.push(functionWordVector(tokens));
  }

  if (vectors.length < 2) return null;

  let pairSum = 0;
  let pairCount = 0;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      pairSum += meanAbsZDiff(vectors[i]!, vectors[j]!);
      pairCount++;
    }
  }

  const variance = pairCount > 0 ? pairSum / pairCount : 0;
  return {
    variance,
    chunk_count: vectors.length,
    high_internal_variance: variance >= threshold,
  };
}

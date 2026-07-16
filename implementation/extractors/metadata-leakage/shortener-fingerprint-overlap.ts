/**
 * Link shortener fingerprint pair extractor (§4.7.4).
 *
 * Compares per-account shortener_domain_distribution /
 * shortener_fingerprint_set (emitted alongside posted_urls). Shared
 * uncommon shorteners (commercial or self-hosted) are high-leverage
 * sockpuppet infrastructure signals.
 */

import type {
  PairFeatureExtractor,
  AccountFeatureMap,
  PairContext,
} from '../pair-types';
import type { ExtractedFeature } from '../types';
import {
  dictJensenShannonDivergence,
  dictKeyJaccard,
} from './distribution-jsd';

const NAME = 'shortener_fingerprint_overlap_metadata_leakage';
const VERSION = '1.0.0';

export class ShortenerFingerprintOverlapExtractor implements PairFeatureExtractor {
  readonly name = NAME;
  readonly version = VERSION;
  readonly category = 'metadata_leakage' as const;
  readonly requiredAccountFeatures = ['shortener_domain_distribution'] as const;

  extract(
    _accountA: string,
    _accountB: string,
    featuresA: AccountFeatureMap,
    featuresB: AccountFeatureMap,
    _context?: PairContext
  ): ExtractedFeature[] {
    const distA = parseDistribution(featuresA, 'shortener_domain_distribution');
    const distB = parseDistribution(featuresB, 'shortener_domain_distribution');
    if (!distA || !distB) return [];

    const fpsA = parseStringSet(featuresA, 'shortener_fingerprint_set');
    const fpsB = parseStringSet(featuresB, 'shortener_fingerprint_set');
    const pathsA = parseStringSet(featuresA, 'shortener_path_tokens');
    const pathsB = parseStringSet(featuresB, 'shortener_path_tokens');

    const jaccard = dictKeyJaccard(distA, distB);
    const jsd =
      Object.keys(distA).length === 0 && Object.keys(distB).length === 0
        ? 0
        : dictJensenShannonDivergence(distA, distB);

    const sharedHosts = sharedKeys(distA, distB);
    const sharedFingerprints =
      fpsA && fpsB ? [...intersect(fpsA, fpsB)].sort() : [];
    const sharedPathTokens =
      pathsA && pathsB ? [...intersect(pathsA, pathsB)].sort() : [];

    const cat = 'metadata_leakage' as const;
    const features: ExtractedFeature[] = [
      {
        category: cat,
        name: 'shortener_domain_jaccard',
        value: { kind: 'numeric', value: jaccard },
      },
      {
        category: cat,
        name: 'shortener_domain_jsd',
        value: { kind: 'numeric', value: jsd },
      },
      {
        category: cat,
        name: 'shortener_domain_similarity',
        value: { kind: 'numeric', value: 1 - jsd },
      },
      {
        category: cat,
        name: 'shortener_fingerprint_jaccard',
        value: {
          kind: 'numeric',
          value: fpsA && fpsB ? setJaccard(fpsA, fpsB) : 0,
        },
      },
    ];

    if (sharedHosts.length > 0) {
      features.push({
        category: cat,
        name: 'shortener_shared_hosts',
        value: { kind: 'json', value: sharedHosts },
      });
    }
    if (sharedFingerprints.length > 0) {
      features.push({
        category: cat,
        name: 'shortener_shared_fingerprints',
        value: { kind: 'json', value: sharedFingerprints },
      });
    }
    if (sharedPathTokens.length > 0) {
      features.push({
        category: cat,
        name: 'shortener_shared_path_tokens',
        value: { kind: 'json', value: sharedPathTokens },
      });
    }

    return features;
  }
}

function parseDistribution(
  features: AccountFeatureMap,
  name: string
): Record<string, number> | null {
  const v = features.get(name);
  if (!v || v.kind !== 'json') return null;
  if (!v.value || typeof v.value !== 'object' || Array.isArray(v.value)) return null;
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v.value as Record<string, unknown>)) {
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) out[k] = val;
  }
  return out;
}

function parseStringSet(
  features: AccountFeatureMap,
  name: string
): Set<string> | null {
  const v = features.get(name);
  if (!v || v.kind !== 'json') return null;
  if (!Array.isArray(v.value)) return null;
  return new Set(v.value.filter((x): x is string => typeof x === 'string'));
}

function sharedKeys(
  a: Record<string, number>,
  b: Record<string, number>
): string[] {
  return Object.keys(a)
    .filter((k) => k in b)
    .sort();
}

function intersect(a: Set<string>, b: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const x of a) if (b.has(x)) out.add(x);
  return out;
}

function setJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

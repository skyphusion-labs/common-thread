/**
 * Pure unit tests for #189 resource caps (no MySQL / Workers pool).
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAX_ATTRIBUTION_PAIRS,
  DEFAULT_MAX_INGEST_ITEMS,
  DEFAULT_MAX_SEED_ACCOUNTS,
  canonicalPairCount,
  ingestCapExceeded,
  pairCapExceeded,
  parsePositiveIntCap,
  resolveResourceCaps,
  seedCapExceeded,
} from '../../implementation/workers/resource-caps';

describe('parsePositiveIntCap', () => {
  it('uses fallback when unset, empty, or invalid', () => {
    expect(parsePositiveIntCap(undefined, 10)).toBe(10);
    expect(parsePositiveIntCap('', 10)).toBe(10);
    expect(parsePositiveIntCap('  ', 10)).toBe(10);
    expect(parsePositiveIntCap('0', 10)).toBe(10);
    expect(parsePositiveIntCap('-3', 10)).toBe(10);
    expect(parsePositiveIntCap('1.5', 10)).toBe(10);
    expect(parsePositiveIntCap('nope', 10)).toBe(10);
  });

  it('accepts positive integers (trimmed)', () => {
    expect(parsePositiveIntCap('1', 10)).toBe(1);
    expect(parsePositiveIntCap(' 50 ', 10)).toBe(50);
    expect(parsePositiveIntCap('5000', 10)).toBe(5000);
  });
});

describe('resolveResourceCaps', () => {
  it('defaults when env vars are absent', () => {
    expect(resolveResourceCaps({})).toEqual({
      maxSeedAccounts: DEFAULT_MAX_SEED_ACCOUNTS,
      maxIngestItems: DEFAULT_MAX_INGEST_ITEMS,
      maxAttributionPairs: DEFAULT_MAX_ATTRIBUTION_PAIRS,
    });
  });

  it('overrides from wrangler string vars', () => {
    expect(
      resolveResourceCaps({
        MAX_SEED_ACCOUNTS: '10',
        MAX_INGEST_ITEMS: '100',
        MAX_ATTRIBUTION_PAIRS: '45',
      })
    ).toEqual({
      maxSeedAccounts: 10,
      maxIngestItems: 100,
      maxAttributionPairs: 45,
    });
  });
});

describe('canonicalPairCount', () => {
  it('matches n choose 2 (reasoner / pair-runner loop)', () => {
    expect(canonicalPairCount(0)).toBe(0);
    expect(canonicalPairCount(1)).toBe(0);
    expect(canonicalPairCount(2)).toBe(1);
    expect(canonicalPairCount(3)).toBe(3);
    expect(canonicalPairCount(50)).toBe(1225);
  });

  it('default pair cap equals C(default seed cap, 2)', () => {
    expect(canonicalPairCount(DEFAULT_MAX_SEED_ACCOUNTS)).toBe(
      DEFAULT_MAX_ATTRIBUTION_PAIRS
    );
  });
});

describe('error bodies', () => {
  it('emit stable machine-readable codes', () => {
    expect(seedCapExceeded(50, 50).error).toBe('seed_cap_exceeded');
    expect(ingestCapExceeded(5000, 5001).error).toBe('ingest_cap_exceeded');
    expect(pairCapExceeded(1225, 2000).error).toBe('pair_cap_exceeded');
    expect(seedCapExceeded(50, 50).limit).toBe(50);
    expect(ingestCapExceeded(5000, 5001).attempted).toBe(5001);
  });
});

import { describe, it, expect } from 'vitest';

/**
 * Contract for PUBLIC_BYOK_ONLY (#201): web and backend must agree.
 * Backend: implementation/workers/index.ts isTruthyFlag
 * Web: web/worker.js isTruthyFlag (same semantics; cannot share TS into the
 * single-file Worker without a build step).
 */
function isTruthyFlag(value: string | undefined): boolean {
  const flag = (value ?? '').trim().toLowerCase();
  return flag === 'true' || flag === '1';
}

describe('isTruthyFlag contract (#201)', () => {
  it('accepts 1 and true (case-insensitive, trimmed)', () => {
    expect(isTruthyFlag('1')).toBe(true);
    expect(isTruthyFlag('true')).toBe(true);
    expect(isTruthyFlag('TRUE')).toBe(true);
    expect(isTruthyFlag(' True ')).toBe(true);
  });

  it('rejects other values', () => {
    expect(isTruthyFlag(undefined)).toBe(false);
    expect(isTruthyFlag('')).toBe(false);
    expect(isTruthyFlag('0')).toBe(false);
    expect(isTruthyFlag('false')).toBe(false);
    expect(isTruthyFlag('yes')).toBe(false);
  });
});

/**
 * Unit tests for the encryption-aware feature/payload cell seam (§3.5).
 * Pure Web Crypto; no database. Runs in the workers pool.
 */

import { describe, expect, it } from 'vitest';

import { deriveInvestigationKey, isEncryptedCell } from '../../implementation/crypto/investigation-key';
import {
  packFeatureCell,
  readFeatureCell,
  packTextCell,
  readTextCell,
  type CellContext,
} from '../../implementation/crypto/feature-cells';
import type { FeatureValue, FeatureValueColumns } from '../../implementation/schema/db-types';

const TOKEN = 'ct_feature_cells_token_BBBBBBBBBBBBBBBBBBBB';
const INV = 'inv-feat-1';

async function ctxWithKey(column: string): Promise<CellContext> {
  return { key: await deriveInvestigationKey(TOKEN, INV), investigationId: INV, column };
}
function ctxNoKey(column: string): CellContext {
  return { key: null, investigationId: INV, column };
}

function asColumns(p: {
  feature_value_text: string | null;
  feature_value_numeric: number | null;
  feature_value_json: string | null;
}): FeatureValueColumns {
  return p;
}

describe('packFeatureCell / readFeatureCell (encrypted)', () => {
  const cases: FeatureValue[] = [
    { kind: 'text', value: 'a stylometric string' },
    { kind: 'numeric', value: 42.5 },
    { kind: 'json', value: { burrows_delta: 0.12, terms: ['a', 'b'] } },
  ];

  it('encrypts every value kind into the text column and restores its kind', async () => {
    const ctx = await ctxWithKey('account_features.value');
    for (const value of cases) {
      const packed = await packFeatureCell(value, ctx);
      // Only the text column carries the ciphertext; the one-of-three CHECK holds.
      expect(isEncryptedCell(packed.feature_value_text)).toBe(true);
      expect(packed.feature_value_numeric).toBeNull();
      expect(packed.feature_value_json).toBeNull();

      const restored = await readFeatureCell(asColumns(packed), ctx);
      expect(restored).toEqual(value);
    }
  });

  it('cannot be read under a different column context (AAD binding)', async () => {
    const ctx = await ctxWithKey('account_features.value');
    const packed = await packFeatureCell({ kind: 'numeric', value: 7 }, ctx);
    const otherCtx: CellContext = { ...ctx, column: 'pair_features.value' };
    await expect(readFeatureCell(asColumns(packed), otherCtx)).rejects.toThrow();
  });

  it('throws when an encrypted cell is read without a key', async () => {
    const ctx = await ctxWithKey('account_features.value');
    const packed = await packFeatureCell({ kind: 'text', value: 'secret' }, ctx);
    await expect(
      readFeatureCell(asColumns(packed), ctxNoKey('account_features.value'))
    ).rejects.toThrow();
  });
});

describe('packFeatureCell / readFeatureCell (legacy plaintext, key null)', () => {
  it('packs into the native columns and reads back unchanged', async () => {
    const ctx = ctxNoKey('account_features.value');
    const num = await packFeatureCell({ kind: 'numeric', value: 3 }, ctx);
    expect(num.feature_value_numeric).toBe(3);
    expect(num.feature_value_text).toBeNull();
    expect(await readFeatureCell(asColumns(num), ctx)).toEqual({ kind: 'numeric', value: 3 });

    const json = await packFeatureCell({ kind: 'json', value: { x: 1 } }, ctx);
    expect(json.feature_value_json).toBe('{"x":1}');
    expect(await readFeatureCell(asColumns(json), ctx)).toEqual({ kind: 'json', value: { x: 1 } });
  });

  it('reads a legacy plaintext row even when a key is present (mixed vintage)', async () => {
    const legacy = asColumns({ feature_value_text: 'legacy', feature_value_numeric: null, feature_value_json: null });
    const ctx = await ctxWithKey('account_features.value');
    expect(await readFeatureCell(legacy, ctx)).toEqual({ kind: 'text', value: 'legacy' });
  });
});

describe('packTextCell / readTextCell', () => {
  it('round-trips a payload string when a key is present', async () => {
    const ctx = await ctxWithKey('attribution_runs.output');
    const cell = await packTextCell('{"claim":"strongly_consistent"}', ctx);
    expect(isEncryptedCell(cell)).toBe(true);
    expect(await readTextCell(cell, ctx)).toBe('{"claim":"strongly_consistent"}');
  });

  it('passes through and reads plaintext when the key is null (legacy)', async () => {
    const ctx = ctxNoKey('attribution_runs.output');
    expect(await packTextCell('plain', ctx)).toBe('plain');
    expect(await readTextCell('plain', ctx)).toBe('plain');
    expect(await readTextCell(null, ctx)).toBeNull();
  });

  it('reads a legacy plaintext cell even on an encrypted investigation', async () => {
    const ctx = await ctxWithKey('attribution_runs.output');
    expect(await readTextCell('legacy-plaintext', ctx)).toBe('legacy-plaintext');
  });
});

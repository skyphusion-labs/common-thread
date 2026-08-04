/**
 * #228: feature cells + basis statements encrypt at rest when encKey is set.
 * Pure node unit tests against feature-cells + a minimal pack/read round-trip
 * that mirrors extractor write + reasoner/API read.
 */
import { describe, it, expect } from 'vitest';
import {
  packFeatureCell,
  readFeatureCell,
  packTextCell,
  readTextCell,
} from '../../implementation/crypto/feature-cells';
import {
  deriveInvestigationKey,
  isEncryptedCell,
} from '../../implementation/crypto/investigation-key';

describe('encrypt features + basis (#228)', () => {
  it('account feature values round-trip under encKey and store as enc:1 cells', async () => {
    const key = await deriveInvestigationKey('ct_test_token_features_basis', 'inv-228');
    const ctx = {
      key,
      investigationId: 'inv-228',
      column: 'account_features.value',
    };
    const packed = await packFeatureCell(
      { kind: 'json', value: { the: 0.1, a: 0.05 } },
      ctx
    );
    expect(packed.feature_value_numeric).toBeNull();
    expect(packed.feature_value_json).toBeNull();
    expect(packed.feature_value_text).toBeTruthy();
    expect(isEncryptedCell(packed.feature_value_text!)).toBe(true);

    const restored = await readFeatureCell(
      {
        feature_value_text: packed.feature_value_text,
        feature_value_numeric: packed.feature_value_numeric,
        feature_value_json: packed.feature_value_json,
      },
      ctx
    );
    expect(restored).toEqual({ kind: 'json', value: { the: 0.1, a: 0.05 } });
  });

  it('basis_statement and metadata_json pack as encrypted text cells', async () => {
    const key = await deriveInvestigationKey('ct_test_token_basis_meta', 'inv-228-b');
    const basis = await packTextCell('Seed reason: known associates', {
      key,
      investigationId: 'inv-228-b',
      column: 'seed_accounts.basis_statement',
    });
    expect(isEncryptedCell(basis)).toBe(true);
    expect(
      await readTextCell(basis, {
        key,
        investigationId: 'inv-228-b',
        column: 'seed_accounts.basis_statement',
      })
    ).toBe('Seed reason: known associates');

    const meta = await packTextCell(JSON.stringify({ time_bounds: { start: 'a', end: 'b' } }), {
      key,
      investigationId: 'inv-228-b',
      column: 'investigations.metadata_json',
    });
    expect(isEncryptedCell(meta)).toBe(true);
    const plain = await readTextCell(meta, {
      key,
      investigationId: 'inv-228-b',
      column: 'investigations.metadata_json',
    });
    expect(JSON.parse(plain!)).toEqual({ time_bounds: { start: 'a', end: 'b' } });
  });

  it('legacy plaintext rows still read without a key', async () => {
    const ctx = {
      key: null as CryptoKey | null,
      investigationId: 'legacy',
      column: 'account_features.value',
    };
    const packed = await packFeatureCell({ kind: 'numeric', value: 42 }, ctx);
    expect(packed.feature_value_numeric).toBe(42);
    expect(await readFeatureCell(packed, ctx)).toEqual({ kind: 'numeric', value: 42 });
  });

  it('readTextCell fails closed: never returns enc:1 ciphertext without a key', async () => {
    const key = await deriveInvestigationKey('ct_fail_closed', 'inv-fc');
    const cell = await packTextCell('secret basis', {
      key,
      investigationId: 'inv-fc',
      column: 'seed_accounts.basis_statement',
    });
    expect(isEncryptedCell(cell)).toBe(true);

    await expect(
      readTextCell(cell, {
        key: null,
        investigationId: 'inv-fc',
        column: 'seed_accounts.basis_statement',
      })
    ).rejects.toThrow(/no investigation key/);

    const otherKey = await deriveInvestigationKey('ct_other_token', 'inv-fc');
    await expect(
      readTextCell(cell, {
        key: otherKey,
        investigationId: 'inv-fc',
        column: 'seed_accounts.basis_statement',
      })
    ).rejects.toThrow();
  });
});

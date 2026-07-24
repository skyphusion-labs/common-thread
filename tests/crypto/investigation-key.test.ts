/**
 * Unit tests for per-investigation encryption at rest (§3.5).
 * Pure Web Crypto; no database or network. Runs in the workers pool.
 */

import { describe, expect, it } from 'vitest';

import {
  CRYPTO_VERSION,
  computeKeyCheck,
  decryptCell,
  deriveInvestigationKey,
  encryptCell,
  isEncryptedCell,
  verifyKeyCheck,
} from '../../implementation/crypto/investigation-key';

const TOKEN = 'ct_test_secret_token_AAAAAAAAAAAAAAAAAAAAAAA';
const INV = 'inv-abc-123';
const AAD = 'inv-abc-123|attribution_runs.output';

describe('deriveInvestigationKey', () => {
  it('is deterministic for the same (token, investigation)', async () => {
    const k1 = await deriveInvestigationKey(TOKEN, INV);
    const k2 = await deriveInvestigationKey(TOKEN, INV);
    const c1 = await encryptCell(k1, 'hello', AAD);
    // A cell encrypted under k1 must decrypt under a freshly derived k2.
    expect(await decryptCell(k2, c1, AAD)).toBe('hello');
  });

  it('derives a different key for a different investigation id (salt)', async () => {
    const k1 = await deriveInvestigationKey(TOKEN, INV);
    const k2 = await deriveInvestigationKey(TOKEN, 'other-investigation');
    const c1 = await encryptCell(k1, 'hello', AAD);
    await expect(decryptCell(k2, c1, AAD)).rejects.toThrow();
  });

  it('derives a different key for a different token', async () => {
    const k1 = await deriveInvestigationKey(TOKEN, INV);
    const k2 = await deriveInvestigationKey('ct_a_totally_different_token', INV);
    const c1 = await encryptCell(k1, 'hello', AAD);
    await expect(decryptCell(k2, c1, AAD)).rejects.toThrow();
  });
});

describe('encryptCell / decryptCell', () => {
  it('round-trips arbitrary strings', async () => {
    const key = await deriveInvestigationKey(TOKEN, INV);
    for (const pt of ['', 'a', 'unicode ☃ 🔒', JSON.stringify({ a: [1, 2, 3] })]) {
      const cell = await encryptCell(key, pt, AAD);
      expect(isEncryptedCell(cell)).toBe(true);
      expect(cell.startsWith('enc:1:')).toBe(true);
      expect(await decryptCell(key, cell, AAD)).toBe(pt);
    }
  });

  it('uses a fresh nonce so identical plaintext yields distinct ciphertext', async () => {
    const key = await deriveInvestigationKey(TOKEN, INV);
    const a = await encryptCell(key, 'same', AAD);
    const b = await encryptCell(key, 'same', AAD);
    expect(a).not.toBe(b);
    expect(await decryptCell(key, a, AAD)).toBe('same');
    expect(await decryptCell(key, b, AAD)).toBe('same');
  });

  it('fails to decrypt under a mismatched AAD (cannot relocate a cell)', async () => {
    const key = await deriveInvestigationKey(TOKEN, INV);
    const cell = await encryptCell(key, 'bound', AAD);
    await expect(
      decryptCell(key, cell, 'inv-abc-123|seed_accounts.basis')
    ).rejects.toThrow();
  });

  it('fails to decrypt a tampered cell (GCM tag)', async () => {
    const key = await deriveInvestigationKey(TOKEN, INV);
    const cell = await encryptCell(key, 'authentic', AAD);
    const flipped = cell.slice(0, -2) + (cell.endsWith('A') ? 'B' : 'A');
    await expect(decryptCell(key, flipped, AAD)).rejects.toThrow();
  });

  it('rejects decrypting a non-encrypted value', async () => {
    const key = await deriveInvestigationKey(TOKEN, INV);
    await expect(decryptCell(key, 'plaintext', AAD)).rejects.toThrow();
  });
});

describe('isEncryptedCell', () => {
  it('recognizes only the enc:1: prefix', () => {
    expect(isEncryptedCell('enc:1:abc')).toBe(true);
    expect(isEncryptedCell('plaintext')).toBe(false);
    expect(isEncryptedCell('')).toBe(false);
    expect(isEncryptedCell(null)).toBe(false);
    expect(isEncryptedCell(undefined)).toBe(false);
  });
});

describe('key check', () => {
  it('verifies the correct token and rejects a wrong one', async () => {
    const key = await deriveInvestigationKey(TOKEN, INV);
    const stored = await computeKeyCheck(key);

    expect(await verifyKeyCheck(key, stored)).toBe(true);

    const wrong = await deriveInvestigationKey('ct_wrong_token', INV);
    expect(await verifyKeyCheck(wrong, stored)).toBe(false);
    expect(await verifyKeyCheck(key, null)).toBe(false);
    expect(await verifyKeyCheck(key, undefined)).toBe(false);
  });
});

describe('CRYPTO_VERSION', () => {
  it('is the stable v1 tag', () => {
    expect(CRYPTO_VERSION).toBe('v1');
  });
});

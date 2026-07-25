/**
 * Encryption-aware packing/reading of feature values and other analytic-payload
 * cells (paper §3.5). This is the single seam between the plaintext feature model
 * (db-types.ts `FeatureValue`, `packFeatureValue`, `readFeatureValue`) and the
 * per-investigation encryption key (crypto/investigation-key.ts).
 *
 * When a key is present (an encrypted investigation), a FeatureValue is wrapped
 * in a typed envelope, encrypted, and stored ENTIRELY in feature_value_text as
 * a single ciphertext cell (numeric and json columns NULL). This keeps the
 * schema's one-of-three CHECK satisfied while allowing numeric and JSON values
 * to be encrypted, and preserves the original type on read. When the key is
 * null (a legacy plaintext investigation, crypto_version absent), packing and
 * reading fall through to the plaintext db-types helpers unchanged.
 *
 * Reads are tolerant in both directions: an encrypted cell is decrypted even if
 * no key was expected-only-if it can be, and a plaintext row is read as-is even
 * on an encrypted investigation, so mixed-vintage rows never crash a reader.
 */

import {
  packFeatureValue,
  readFeatureValue,
  type FeatureValue,
  type FeatureValueColumns,
} from '../schema/db-types';
import { decryptCell, encryptCell, isEncryptedCell } from './investigation-key';

/** Typed envelope serialized before encryption so read restores the kind. */
type FeatureEnvelope =
  | { k: 'text'; v: string }
  | { k: 'numeric'; v: number }
  | { k: 'json'; v: unknown };

/** Context binding a cell to its logical location for AES-GCM AAD. */
export interface CellContext {
  /** The per-investigation key, or null for a legacy plaintext investigation. */
  key: CryptoKey | null;
  investigationId: string;
  /** Stable column/family tag, e.g. 'account_features.value'. */
  column: string;
}

function aadFor(ctx: CellContext): string {
  return `${ctx.investigationId}|${ctx.column}`;
}

type PackedColumns = {
  feature_value_text: string | null;
  feature_value_numeric: number | null;
  feature_value_json: string | null;
};

/**
 * Pack a FeatureValue for INSERT. With a key, returns a single encrypted text
 * cell; without a key, delegates to the plaintext packer.
 */
export async function packFeatureCell(
  value: FeatureValue,
  ctx: CellContext
): Promise<PackedColumns> {
  if (!ctx.key) return packFeatureValue(value);
  const envelope: FeatureEnvelope =
    value.kind === 'numeric'
      ? { k: 'numeric', v: value.value }
      : value.kind === 'json'
        ? { k: 'json', v: value.value }
        : { k: 'text', v: value.value };
  const cell = await encryptCell(ctx.key, JSON.stringify(envelope), aadFor(ctx));
  return { feature_value_text: cell, feature_value_numeric: null, feature_value_json: null };
}

/**
 * Read a feature row's value, decrypting when the text column holds an
 * encrypted cell. Falls through to the plaintext reader for legacy rows.
 */
export async function readFeatureCell(
  row: FeatureValueColumns,
  ctx: CellContext
): Promise<FeatureValue> {
  if (row.feature_value_text !== null && isEncryptedCell(row.feature_value_text)) {
    if (!ctx.key) {
      throw new Error(
        `Encrypted feature cell for ${ctx.column} but no investigation key was provided`
      );
    }
    const json = await decryptCell(ctx.key, row.feature_value_text, aadFor(ctx));
    const env = JSON.parse(json) as FeatureEnvelope;
    switch (env.k) {
      case 'numeric':
        return { kind: 'numeric', value: env.v };
      case 'json':
        return { kind: 'json', value: env.v };
      case 'text':
        return { kind: 'text', value: env.v };
    }
  }
  return readFeatureValue(row);
}

/**
 * Encrypt a free-text/JSON payload string (attribution output, basis
 * statement, event_data_json, metadata_json) when a key is present; pass
 * through unchanged for legacy plaintext investigations. `column` binds AAD.
 */
export async function packTextCell(
  plaintext: string,
  ctx: CellContext
): Promise<string> {
  if (!ctx.key) return plaintext;
  return encryptCell(ctx.key, plaintext, aadFor(ctx));
}

/**
 * Decrypt a payload string produced by packTextCell. Legacy plaintext (not an
 * encrypted cell) is returned as-is, so mixed-vintage rows read cleanly.
 */
export async function readTextCell(
  stored: string | null,
  ctx: CellContext
): Promise<string | null> {
  if (stored === null || !isEncryptedCell(stored)) return stored;
  if (!ctx.key) {
    throw new Error(
      `Encrypted cell for ${ctx.column} but no investigation key was provided`
    );
  }
  return decryptCell(ctx.key, stored, aadFor(ctx));
}

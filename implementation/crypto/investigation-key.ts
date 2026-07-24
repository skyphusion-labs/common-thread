/**
 * Per-investigation encryption at rest (paper §3.5).
 *
 * The investigation access token (the `ct_...` capability secret returned once
 * at creation) is the SINGLE secret. It is used two ways, under domain-separated
 * derivations so neither reveals the other:
 *
 *   - authentication:  SHA-256(token) -> investigations.access_token_hash
 *                      (unchanged; see investigations/access.ts)
 *   - encryption:      HKDF-SHA256(token, salt=investigation_id,
 *                      info="ct/inv-enc/v1") -> AES-256-GCM key
 *
 * The encryption key is derived in Worker memory for the lifetime of a request
 * that presents the token, and is NEVER persisted. The server stores only
 * ciphertext plus the auth hash, so an at-rest dump of the database yields no
 * plaintext of the encrypted analytic payload, and losing the token makes an
 * encrypted investigation permanently unrecoverable by design (zero-knowledge;
 * no operator escrow). This protects against database exfiltration; it does NOT
 * protect against a compromised live Worker while a request holds the key, and
 * it deliberately leaves structural metadata (account identifiers, platforms,
 * timestamps, coarse confidence band) queryable in plaintext. See §3.5 and §10.
 *
 * Threat boundary and rationale are documented in
 * docs/ENCRYPTION-AT-REST.md and paper/03-evidentiary-framework.md §3.5.
 */

/** Marker on every encrypted cell. Version so the format can evolve. */
const CELL_PREFIX = 'enc:1:';

/** HKDF info string; bump the trailing version if the derivation changes. */
const HKDF_INFO = 'ct/inv-enc/v1';

/** Fixed sentinel encrypted under the key to prove a token decrypts an
 * investigation (fail-fast on a wrong secret before touching real data). */
const KEY_CHECK_SENTINEL = 'ct/inv-enc/key-check/v1';
const KEY_CHECK_AAD = 'ct/inv-enc/key-check';

/**
 * The crypto scheme version stamped on investigations.crypto_version at
 * creation. A NULL/absent value means the investigation predates encryption
 * (or was created without it) and its payload columns are plaintext.
 */
export const CRYPTO_VERSION = 'v1';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Derive the AES-256-GCM encryption key for an investigation from its access
 * token. Pure function of (token, investigationId); never persisted.
 */
export async function deriveInvestigationKey(
  token: string,
  investigationId: string
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey(
    'raw',
    encoder.encode(token),
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(investigationId),
      info: encoder.encode(HKDF_INFO),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** True if a stored string is an encrypted cell (vs legacy plaintext). */
export function isEncryptedCell(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(CELL_PREFIX);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Encrypt a plaintext string into a self-describing `enc:1:<b64url>` cell.
 * The AAD binds the ciphertext to a logical location (investigation + column)
 * so a dumped cell cannot be relocated to another column or investigation.
 * A fresh random 96-bit nonce is prepended to the ciphertext+tag.
 */
export async function encryptCell(
  key: CryptoKey,
  plaintext: string,
  aad: string
): Promise<string> {
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(aad) },
      key,
      encoder.encode(plaintext)
    )
  );
  const packed = new Uint8Array(nonce.length + ct.length);
  packed.set(nonce, 0);
  packed.set(ct, nonce.length);
  return CELL_PREFIX + toBase64Url(packed);
}

/**
 * Decrypt a `enc:1:<b64url>` cell produced by encryptCell. The AAD must match
 * the value used at encryption time. Throws on tag mismatch (wrong key,
 * tampering, or wrong AAD).
 */
export async function decryptCell(
  key: CryptoKey,
  cell: string,
  aad: string
): Promise<string> {
  if (!isEncryptedCell(cell)) {
    throw new Error('decryptCell called on a non-encrypted value');
  }
  const packed = fromBase64Url(cell.slice(CELL_PREFIX.length));
  const nonce = packed.subarray(0, 12);
  const body = packed.subarray(12);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: encoder.encode(aad) },
    key,
    body
  );
  return decoder.decode(pt);
}

/**
 * Produce the key-check token stored on investigations.key_check at creation.
 * Verifiable later with verifyKeyCheck to fail fast when a presented token
 * derives the wrong key, without decrypting any real payload.
 */
export async function computeKeyCheck(key: CryptoKey): Promise<string> {
  return encryptCell(key, KEY_CHECK_SENTINEL, KEY_CHECK_AAD);
}

/** True if `key` decrypts the stored key-check to the expected sentinel. */
export async function verifyKeyCheck(
  key: CryptoKey,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;
  try {
    const pt = await decryptCell(key, stored, KEY_CHECK_AAD);
    return pt === KEY_CHECK_SENTINEL;
  } catch {
    return false;
  }
}

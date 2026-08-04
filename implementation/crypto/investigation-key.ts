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
  // extractable:false for the request-scoped key held in Worker/container
  // memory. VPC handoff uses a *separate* extractable derivation only inside
  // sealInvestigationKeyForVpcHandoff (#246 audit: do not leave every key
  // extractable for the whole request).
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

/**
 * Wire prefix for VPC handoff payloads. The investigation key is envelope-
 * encrypted under a key derived from the container shared secret
 * (INGEST_SECRET / ATTRIBUTION_SECRET) so cleartext AES material never rides
 * the VPC body (#246 adversarial audit critical).
 */
const HANDOFF_PREFIX = 'inv-enc-handoff:v1:';
const HANDOFF_WRAP_INFO = 'ct/vpc-handoff-wrap/v1';

async function deriveHandoffWrappingKey(
  wrappingSecret: string,
  investigationId: string
): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey(
    'raw',
    encoder.encode(wrappingSecret),
    'HKDF',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(investigationId),
      info: encoder.encode(HANDOFF_WRAP_INFO),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Seal the investigation encryption key for a one-shot VPC handoff (#246).
 *
 * Re-derives an extractable copy from the access token (request-scoped
 * CryptoKey stays non-extractable), then envelope-encrypts the raw AES-256
 * bytes under a key derived from `wrappingSecret` (the container bearer
 * secret). NEVER log, persist, or return the sealed blob to public HTTP.
 */
export async function sealInvestigationKeyForVpcHandoff(
  accessToken: string,
  investigationId: string,
  wrappingSecret: string
): Promise<string> {
  if (!wrappingSecret) {
    throw new Error('sealInvestigationKeyForVpcHandoff: wrappingSecret required');
  }
  // Temporary extractable derivation solely for export; not the request key.
  const ikm = await crypto.subtle.importKey(
    'raw',
    encoder.encode(accessToken),
    'HKDF',
    false,
    ['deriveKey']
  );
  const extractable = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: encoder.encode(investigationId),
      info: encoder.encode(HKDF_INFO),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const raw = new Uint8Array(
    (await crypto.subtle.exportKey('raw', extractable)) as ArrayBuffer
  );
  if (raw.byteLength !== 32) {
    throw new Error(
      `sealInvestigationKeyForVpcHandoff: expected 32-byte key, got ${raw.byteLength}`
    );
  }

  const wrapKey = await deriveHandoffWrappingKey(wrappingSecret, investigationId);
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: encoder.encode(`${investigationId}|vpc-handoff`),
      },
      wrapKey,
      raw
    )
  );
  const packed = new Uint8Array(nonce.length + ct.length);
  packed.set(nonce, 0);
  packed.set(ct, nonce.length);
  // Zero the temporary raw buffer best-effort.
  raw.fill(0);
  return HANDOFF_PREFIX + toBase64Url(packed);
}

/**
 * Unseal a VPC handoff blob produced by {@link sealInvestigationKeyForVpcHandoff}.
 * Used by containers that share the wrapping secret (INGEST_SECRET /
 * ATTRIBUTION_SECRET). Returns a non-extractable CryptoKey for pack/write.
 */
export async function unsealInvestigationKeyFromVpcHandoff(
  sealed: string,
  wrappingSecret: string,
  investigationId: string
): Promise<CryptoKey> {
  if (!sealed.startsWith(HANDOFF_PREFIX)) {
    throw new Error(
      'unsealInvestigationKeyFromVpcHandoff: unknown handoff format (expected inv-enc-handoff:v1:)'
    );
  }
  if (!wrappingSecret) {
    throw new Error('unsealInvestigationKeyFromVpcHandoff: wrappingSecret required');
  }
  const packed = fromBase64Url(sealed.slice(HANDOFF_PREFIX.length));
  const nonce = packed.subarray(0, 12);
  const body = packed.subarray(12);
  const wrapKey = await deriveHandoffWrappingKey(wrappingSecret, investigationId);
  const raw = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: encoder.encode(`${investigationId}|vpc-handoff`),
      },
      wrapKey,
      body
    )
  );
  if (raw.byteLength !== 32) {
    throw new Error(
      `unsealInvestigationKeyFromVpcHandoff: expected 32-byte key, got ${raw.byteLength}`
    );
  }
  const key = await crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  raw.fill(0);
  return key;
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

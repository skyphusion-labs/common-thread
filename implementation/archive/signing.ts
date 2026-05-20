/**
 * Ed25519 signing for Common Thread manifests.
 *
 * Implements detached signatures over the manifest, per methodology
 * paper §3.1.3. Signatures bind the manifest hash to a timestamp and
 * optional signer identity, preventing replay of an old signature
 * against a different manifest or a different time.
 *
 * Deployment model:
 *
 *   1. Practitioner generates an Ed25519 keypair offline using
 *      `generateKeyPair()`. The private key is held in a password
 *      manager, hardware token, or equivalent. The public key is
 *      published as part of the investigation's evidence record.
 *
 *   2. Signing happens offline (CLI, local Node script) using
 *      `signManifest()` or the `ManifestSigner` class. The private
 *      key never enters Worker memory in this model.
 *
 *   3. The Worker verifies signatures using only the public key,
 *      via `verifyManifestSignature()` or the `ManifestSigner`
 *      class.
 *
 * If you need in-Worker signing (less secure, simpler), the same
 * functions work; just provide the private key as a Worker secret.
 *
 * Signature storage: signatures live in a sidecar file alongside
 * the manifest (default: `manifest.jsonl.sigs.jsonl`), append-only,
 * one JSON signature record per line. Multiple practitioners can
 * countersign the same manifest by appending their own signature
 * records.
 */

import type { R2BucketLike } from './store';

/** An Ed25519 keypair, with keys encoded as base64 strings. */
export interface KeyPair {
  /** Public key, 32 bytes encoded as base64. */
  publicKey: string;

  /** Private key (seed), 32 bytes encoded as base64. */
  privateKey: string;
}

/** The structured payload that gets canonically encoded and signed. */
export interface SignaturePayload {
  /** Algorithm identifier. Only 'ed25519' supported in v1. */
  algorithm: 'ed25519';

  /** Signer's public key, base64. */
  publicKey: string;

  /** SHA-256 hash of the manifest being signed, lowercase hex. */
  manifestHash: string;

  /** Timestamp when the signature was created, ISO 8601 UTC. */
  signedAt: string;

  /** Optional signer identifier (free-form string, e.g. email or DID). */
  signerId?: string;

  /** Optional signer note. */
  note?: string;
}

/** A complete signature record: payload plus the signature bytes. */
export interface ManifestSignature extends SignaturePayload {
  /** The Ed25519 signature, 64 bytes encoded as base64. */
  signature: string;
}

/** Result of verifying a signature. */
export interface VerificationResult {
  /** True if the signature is cryptographically valid AND the manifestHash matches. */
  valid: boolean;

  /** The signature that was verified. */
  signature: ManifestSignature;

  /** Human-readable reason for failure, if any. */
  reason?: string;
}

// ---------------------------------------------------------------------------
// Base64 helpers (portable across Workers and Node.js)
// ---------------------------------------------------------------------------

function bytesToBase64(bytes: Uint8Array): string {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str);
}

function base64ToBytes(b64: string): Uint8Array {
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Canonical JSON encoding
// ---------------------------------------------------------------------------

/**
 * Canonical JSON encoding: keys sorted recursively, no insignificant
 * whitespace. Used to produce deterministic bytes for signing and
 * verification.
 *
 * This is not a general-purpose canonical JSON implementation; it is
 * sufficient for the fixed-schema SignaturePayload values used here.
 * Specifically: it handles strings, numbers, booleans, null, arrays,
 * and plain objects. It does not handle Date, BigInt, undefined, or
 * non-plain objects (these will throw or produce nonsense).
 */
function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Cannot canonicalize non-finite number');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
      .filter(k => obj[k] !== undefined)
      .sort();
    return (
      '{' +
      keys
        .map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k]))
        .join(',') +
      '}'
    );
  }
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}

// ---------------------------------------------------------------------------
// Low-level primitives: Ed25519 sign / verify over bytes
// ---------------------------------------------------------------------------

/**
 * Generate a fresh Ed25519 keypair.
 *
 * The private key returned here is the 32-byte seed encoded as base64.
 * Store it securely; anyone with the seed can produce valid signatures
 * indistinguishable from yours.
 */
export async function generateKeyPair(): Promise<KeyPair> {
  const cryptoKey = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  ) as CryptoKeyPair;

  // Export the private key as PKCS8 and extract the 32-byte seed.
  // The PKCS8 encoding wraps the seed in ASN.1 DER; the seed is the
  // last 32 bytes of the encoding for Ed25519.
  const pkcs8 = new Uint8Array(
    await crypto.subtle.exportKey('pkcs8', cryptoKey.privateKey)
  );
  const seed = pkcs8.slice(pkcs8.length - 32);

  const rawPublic = new Uint8Array(
    await crypto.subtle.exportKey('raw', cryptoKey.publicKey)
  );

  return {
    publicKey: bytesToBase64(rawPublic),
    privateKey: bytesToBase64(seed),
  };
}

/**
 * Sign bytes with an Ed25519 private key.
 *
 * @param privateKeyB64 - 32-byte Ed25519 seed, base64-encoded
 * @param bytes - Bytes to sign
 * @returns 64-byte Ed25519 signature, base64-encoded
 */
export async function signBytes(
  privateKeyB64: string,
  bytes: Uint8Array
): Promise<string> {
  const seed = base64ToBytes(privateKeyB64);
  if (seed.length !== 32) {
    throw new Error(`Ed25519 private key must be 32 bytes, got ${seed.length}`);
  }

  // Wrap the seed in a PKCS8 envelope so Web Crypto can import it.
  // The envelope is a fixed 16-byte prefix followed by the 32-byte seed.
  const pkcs8 = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
    ...seed,
  ]);

  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8.buffer,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign(
    { name: 'Ed25519' },
    privateKey,
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );

  return bytesToBase64(new Uint8Array(sigBuffer));
}

/**
 * Verify a signature against bytes and a public key.
 *
 * Returns false for any verification failure (bad signature, wrong key,
 * tampered bytes). Throws only if the inputs are structurally invalid
 * (wrong-length key, wrong-length signature, invalid base64).
 *
 * @param publicKeyB64 - 32-byte Ed25519 public key, base64-encoded
 * @param signatureB64 - 64-byte Ed25519 signature, base64-encoded
 * @param bytes - The bytes that were supposedly signed
 * @returns true if the signature is valid for these bytes and this key
 */
export async function verifyBytes(
  publicKeyB64: string,
  signatureB64: string,
  bytes: Uint8Array
): Promise<boolean> {
  const rawPublic = base64ToBytes(publicKeyB64);
  if (rawPublic.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${rawPublic.length}`);
  }

  const signature = base64ToBytes(signatureB64);
  if (signature.length !== 64) {
    throw new Error(`Ed25519 signature must be 64 bytes, got ${signature.length}`);
  }

  const publicKey = await crypto.subtle.importKey(
    'raw',
    rawPublic.buffer,
    { name: 'Ed25519' },
    false,
    ['verify']
  );

  return crypto.subtle.verify(
    { name: 'Ed25519' },
    publicKey,
    signature.buffer,
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
}

// ---------------------------------------------------------------------------
// Manifest-level signing
// ---------------------------------------------------------------------------

/**
 * Produce the canonical bytes that get signed for a given payload.
 * The signature field, if present, is excluded from the canonical form.
 */
function payloadBytes(payload: SignaturePayload): Uint8Array {
  // Strip any 'signature' field defensively, in case a caller passes
  // a ManifestSignature where a SignaturePayload was expected.
  const stripped: Record<string, unknown> = { ...payload };
  delete stripped.signature;
  return new TextEncoder().encode(canonicalJson(stripped));
}

/**
 * Sign a manifest hash with metadata.
 *
 * @param privateKeyB64 - The signer's Ed25519 private key seed (base64)
 * @param manifestHash - SHA-256 hex of the manifest being signed
 * @param options - Optional signer ID and note
 * @returns A ManifestSignature ready to be stored
 */
export async function signManifest(
  privateKeyB64: string,
  manifestHash: string,
  options: { signerId?: string; note?: string } = {}
): Promise<ManifestSignature> {
  if (!/^[0-9a-f]{64}$/.test(manifestHash)) {
    throw new Error(`manifestHash must be lowercase SHA-256 hex: ${manifestHash}`);
  }

  // Derive the public key from the private key so the payload can be
  // self-contained (verifiers don't need to be told the public key
  // out-of-band).
  const seed = base64ToBytes(privateKeyB64);
  if (seed.length !== 32) {
    throw new Error(`Ed25519 private key must be 32 bytes, got ${seed.length}`);
  }
  const pkcs8 = new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
    ...seed,
  ]);
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8.buffer,
    { name: 'Ed25519' },
    true,
    ['sign']
  );
  // Web Crypto doesn't expose private-to-public derivation directly.
  // We work around it by exporting the key as JWK, which includes the
  // public key portion 'x'.
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  if (!jwk.x) {
    throw new Error('Could not derive public key from private key');
  }
  // JWK 'x' field is base64url; convert to base64.
  const publicKeyB64 = base64UrlToBase64(jwk.x);

  const payload: SignaturePayload = {
    algorithm: 'ed25519',
    publicKey: publicKeyB64,
    manifestHash,
    signedAt: new Date().toISOString(),
    signerId: options.signerId,
    note: options.note,
  };

  const bytes = payloadBytes(payload);
  const signature = await signBytes(privateKeyB64, bytes);

  return { ...payload, signature };
}

/**
 * Verify a manifest signature against an expected manifest hash.
 *
 * Returns a VerificationResult with `valid: true` only if BOTH:
 *   - The signature is cryptographically valid for the embedded payload, AND
 *   - The embedded manifestHash matches the expected hash
 *
 * @param signature - The signature record to verify
 * @param expectedManifestHash - The hash the manifest currently has
 * @returns VerificationResult with valid flag and optional failure reason
 */
export async function verifyManifestSignature(
  signature: ManifestSignature,
  expectedManifestHash: string
): Promise<VerificationResult> {
  if (signature.algorithm !== 'ed25519') {
    return {
      valid: false,
      signature,
      reason: `Unsupported algorithm: ${signature.algorithm}`,
    };
  }

  if (signature.manifestHash !== expectedManifestHash) {
    return {
      valid: false,
      signature,
      reason: `Manifest hash mismatch: signature is for ${signature.manifestHash}, current manifest hashes to ${expectedManifestHash}`,
    };
  }

  let cryptoValid: boolean;
  try {
    const bytes = payloadBytes(signature);
    cryptoValid = await verifyBytes(signature.publicKey, signature.signature, bytes);
  } catch (err) {
    return {
      valid: false,
      signature,
      reason: `Cryptographic verification threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (!cryptoValid) {
    return {
      valid: false,
      signature,
      reason: 'Signature does not verify against the embedded payload',
    };
  }

  return { valid: true, signature };
}

function base64UrlToBase64(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return b64;
}

// ---------------------------------------------------------------------------
// ManifestSigner: high-level integration with R2-stored manifests
// ---------------------------------------------------------------------------

export interface ManifestSignerOptions {
  /** R2 bucket binding. */
  bucket: R2BucketLike;

  /** Path to the manifest JSONL file. Default: 'manifest.jsonl'. */
  manifestPath?: string;

  /** Path to the signatures sidecar JSONL file. Default: '<manifestPath>.sigs.jsonl'. */
  signaturesPath?: string;
}

export class ManifestSigner {
  private readonly manifestPath: string;
  private readonly signaturesPath: string;

  constructor(private readonly options: ManifestSignerOptions) {
    this.manifestPath = options.manifestPath ?? 'manifest.jsonl';
    this.signaturesPath =
      options.signaturesPath ?? `${this.manifestPath}.sigs.jsonl`;
  }

  /**
   * Sign the current state of the manifest and append the signature to
   * the signatures sidecar file.
   *
   * @param privateKeyB64 - The signer's private key (base64 seed)
   * @param options - Optional signer ID and note
   * @returns The ManifestSignature that was appended
   * @throws If the manifest doesn't exist or is empty
   */
  async sign(
    privateKeyB64: string,
    options: { signerId?: string; note?: string } = {}
  ): Promise<ManifestSignature> {
    const manifest = await this.options.bucket.get(this.manifestPath);
    if (!manifest) {
      throw new Error(`Manifest not found at ${this.manifestPath}`);
    }
    const manifestBytes = new Uint8Array(await manifest.arrayBuffer());
    if (manifestBytes.length === 0) {
      throw new Error(`Manifest at ${this.manifestPath} is empty; nothing to sign`);
    }

    // Compute the hash of the current manifest bytes.
    const hashBuffer = await crypto.subtle.digest('SHA-256', manifestBytes.buffer.slice(manifestBytes.byteOffset, manifestBytes.byteOffset + manifestBytes.byteLength));
    const manifestHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const signature = await signManifest(privateKeyB64, manifestHash, options);

    // Append the signature to the sidecar file.
    await this.appendSignature(signature);

    return signature;
  }

  /**
   * List all signatures recorded for the current manifest.
   */
  async listSignatures(): Promise<ManifestSignature[]> {
    const object = await this.options.bucket.get(this.signaturesPath);
    if (!object) return [];

    const text = await object.text();
    const lines = text.split('\n').filter(line => line.trim().length > 0);

    const signatures: ManifestSignature[] = [];
    for (const line of lines) {
      try {
        signatures.push(JSON.parse(line) as ManifestSignature);
      } catch {
        // Skip malformed lines.
      }
    }
    return signatures;
  }

  /**
   * Verify all signatures against the current state of the manifest.
   *
   * @returns An array of VerificationResults, one per recorded signature
   */
  async verifyAll(): Promise<VerificationResult[]> {
    const manifest = await this.options.bucket.get(this.manifestPath);
    if (!manifest) return [];

    const manifestBytes = new Uint8Array(await manifest.arrayBuffer());
    const hashBuffer = await crypto.subtle.digest('SHA-256', manifestBytes.buffer.slice(manifestBytes.byteOffset, manifestBytes.byteOffset + manifestBytes.byteLength));
    const expectedHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const signatures = await this.listSignatures();
    const results: VerificationResult[] = [];
    for (const sig of signatures) {
      results.push(await verifyManifestSignature(sig, expectedHash));
    }
    return results;
  }

  /**
   * Filter signatures by public key. Useful when multiple practitioners
   * have countersigned and you want to confirm a specific practitioner's
   * signature is present and valid.
   */
  async verifyBySigner(publicKeyB64: string): Promise<VerificationResult[]> {
    const all = await this.verifyAll();
    return all.filter(r => r.signature.publicKey === publicKeyB64);
  }

  private async appendSignature(signature: ManifestSignature): Promise<void> {
    const line = JSON.stringify(signature) + '\n';

    const existing = await this.options.bucket.get(this.signaturesPath);
    const existingBytes = existing
      ? new Uint8Array(await existing.arrayBuffer())
      : new Uint8Array(0);

    const newLineBytes = new TextEncoder().encode(line);
    const combined = new Uint8Array(existingBytes.length + newLineBytes.length);
    combined.set(existingBytes, 0);
    combined.set(newLineBytes, existingBytes.length);

    await this.options.bucket.put(this.signaturesPath, combined, {
      httpMetadata: { contentType: 'application/x-ndjson' },
    });
  }
}

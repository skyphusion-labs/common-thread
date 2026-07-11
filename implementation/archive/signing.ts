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
 * Signature storage: signatures live in a sidecar file alongside the
 * per-investigation manifest (`investigations/<id>/manifest.jsonl.sigs.jsonl`),
 * append-only, one JSON signature record per line. Multiple practitioners can
 * countersign the same manifest by appending their own signature records.
 */

import type { R2BucketLike } from './store';
import { bytesToHex } from './hash';
import {
  investigationManifestPath,
  investigationSignaturesPath,
} from './paths';

/** An Ed25519 keypair, with keys encoded as base64 strings. */
export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface SignaturePayload {
  algorithm: 'ed25519';
  publicKey: string;
  manifestHash: string;
  signedAt: string;
  signerId?: string;
  note?: string;
}

export interface ManifestSignature extends SignaturePayload {
  signature: string;
}

export interface VerificationResult {
  valid: boolean;
  signature: ManifestSignature;
  reason?: string;
}

/**
 * Detached signature over an evidence packet (methodology paper 8.1.3). The
 * signed content is the canonical Markdown form of the packet; packetSha256 is
 * its SHA-256, bound into the signed payload alongside the signer identity and
 * timestamp so metadata cannot be swapped under a valid signature.
 */
export interface PacketSignaturePayload {
  algorithm: 'ed25519';
  publicKey: string;
  /** SHA-256 (lowercase hex) of the canonical packet Markdown. */
  packetSha256: string;
  signedAt: string;
  signerId?: string;
  note?: string;
}

export interface PacketSignature extends PacketSignaturePayload {
  signature: string;
}

export interface PacketVerificationResult {
  valid: boolean;
  signature: PacketSignature;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Base64 helpers
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

function base64UrlToBase64(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  return b64;
}

// ---------------------------------------------------------------------------
// Canonical JSON encoding
// ---------------------------------------------------------------------------

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
      keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') +
      '}'
    );
  }
  throw new Error(`Cannot canonicalize value of type ${typeof value}`);
}

// ---------------------------------------------------------------------------
// Low-level Ed25519 primitives
// ---------------------------------------------------------------------------

export async function generateKeyPair(): Promise<KeyPair> {
  const cryptoKey = (await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;

  const pkcs8Raw = await crypto.subtle.exportKey('pkcs8', cryptoKey.privateKey);
  const pkcs8 = new Uint8Array(pkcs8Raw as ArrayBuffer);
  const seed = pkcs8.slice(pkcs8.length - 32);

  const rawPublicRaw = await crypto.subtle.exportKey('raw', cryptoKey.publicKey);
  const rawPublic = new Uint8Array(rawPublicRaw as ArrayBuffer);

  return {
    publicKey: bytesToBase64(rawPublic),
    privateKey: bytesToBase64(seed),
  };
}

export async function signBytes(
  privateKeyB64: string,
  bytes: Uint8Array
): Promise<string> {
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
    pkcs8,
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign(
    { name: 'Ed25519' },
    privateKey,
    bytes
  );

  return bytesToBase64(new Uint8Array(sigBuffer));
}

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
    rawPublic,
    { name: 'Ed25519' },
    false,
    ['verify']
  );

  return crypto.subtle.verify(
    { name: 'Ed25519' },
    publicKey,
    signature,
    bytes
  );
}

// ---------------------------------------------------------------------------
// Helper: derive public key from private key seed
// ---------------------------------------------------------------------------

async function derivePublicKey(privateKeyB64: string): Promise<string> {
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
    pkcs8,
    { name: 'Ed25519' },
    true,
    ['sign']
  );

  const jwkRaw = await crypto.subtle.exportKey('jwk', privateKey);
  const jwk = jwkRaw as JsonWebKey;

  if (!jwk.x) {
    throw new Error('Could not derive public key from private key');
  }
  return base64UrlToBase64(jwk.x);
}

// ---------------------------------------------------------------------------
// Manifest-level signing
// ---------------------------------------------------------------------------

function payloadBytes(payload: SignaturePayload | PacketSignaturePayload): Uint8Array {
  const stripped: Record<string, unknown> = { ...payload };
  delete stripped.signature;
  return new TextEncoder().encode(canonicalJson(stripped));
}

export async function signManifest(
  privateKeyB64: string,
  manifestHash: string,
  options: { signerId?: string; note?: string } = {}
): Promise<ManifestSignature> {
  if (!/^[0-9a-f]{64}$/.test(manifestHash)) {
    throw new Error(`manifestHash must be lowercase SHA-256 hex: ${manifestHash}`);
  }

  const publicKeyB64 = await derivePublicKey(privateKeyB64);

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

  try {
    const bytes = payloadBytes(signature);
    const cryptoValid = await verifyBytes(
      signature.publicKey,
      signature.signature,
      bytes
    );

    if (!cryptoValid) {
      return {
        valid: false,
        signature,
        reason: 'Signature does not verify against the embedded payload',
      };
    }

    return { valid: true, signature };
  } catch (err) {
    return {
      valid: false,
      signature,
      reason: `Cryptographic verification threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Packet-level signing (paper 8.1.3)
// ---------------------------------------------------------------------------

/**
 * Produce a detached Ed25519 signature over an evidence packet, given the
 * SHA-256 (lowercase hex) of the packet canonical Markdown. Mirrors
 * signManifest: the signature is over the canonical JSON of the payload, which
 * embeds packetSha256, so a verifier that recomputes the Markdown hash can
 * confirm both the content and the bound metadata.
 */
export async function signPacket(
  privateKeyB64: string,
  packetSha256: string,
  options: { signerId?: string; note?: string } = {}
): Promise<PacketSignature> {
  if (!/^[0-9a-f]{64}$/.test(packetSha256)) {
    throw new Error(`packetSha256 must be lowercase SHA-256 hex: ${packetSha256}`);
  }

  const publicKeyB64 = await derivePublicKey(privateKeyB64);

  const payload: PacketSignaturePayload = {
    algorithm: 'ed25519',
    publicKey: publicKeyB64,
    packetSha256,
    signedAt: new Date().toISOString(),
    signerId: options.signerId,
    note: options.note,
  };

  const bytes = payloadBytes(payload);
  const signature = await signBytes(privateKeyB64, bytes);

  return { ...payload, signature };
}

/**
 * Verify a detached packet signature against the expected canonical-Markdown
 * SHA-256. Fails closed on algorithm mismatch, hash mismatch, or a bad
 * signature; never throws (crypto errors are captured as an invalid result).
 */
export async function verifyPacketSignature(
  signature: PacketSignature,
  expectedPacketSha256: string
): Promise<PacketVerificationResult> {
  if (signature.algorithm !== 'ed25519') {
    return { valid: false, signature, reason: `Unsupported algorithm: ${signature.algorithm}` };
  }

  if (signature.packetSha256 !== expectedPacketSha256) {
    return {
      valid: false,
      signature,
      reason: `Packet hash mismatch: signature is for ${signature.packetSha256}, packet hashes to ${expectedPacketSha256}`,
    };
  }

  try {
    const bytes = payloadBytes(signature);
    const cryptoValid = await verifyBytes(signature.publicKey, signature.signature, bytes);
    if (!cryptoValid) {
      return { valid: false, signature, reason: 'Signature does not verify against the embedded payload' };
    }
    return { valid: true, signature };
  } catch (err) {
    return {
      valid: false,
      signature,
      reason: `Cryptographic verification threw: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// ManifestSigner
// ---------------------------------------------------------------------------

export interface ManifestSignerOptions {
  bucket: R2BucketLike;
  /** Scope signing to one investigation's manifest. */
  investigationId?: string;
  manifestPath?: string;
  signaturesPath?: string;
}

export class ManifestSigner {
  private readonly manifestPath: string;
  private readonly signaturesPath: string;

  constructor(private readonly options: ManifestSignerOptions) {
    if (options.manifestPath && options.investigationId) {
      throw new Error('ManifestSigner: pass investigationId or manifestPath, not both');
    }
    if (options.signaturesPath && options.investigationId && !options.manifestPath) {
      throw new Error(
        'ManifestSigner: signaturesPath with investigationId requires an explicit manifestPath'
      );
    }
    this.manifestPath =
      options.manifestPath ??
      (options.investigationId
        ? investigationManifestPath(options.investigationId)
        : 'manifest.jsonl');
    this.signaturesPath =
      options.signaturesPath ??
      (options.investigationId
        ? investigationSignaturesPath(options.investigationId)
        : `${this.manifestPath}.sigs.jsonl`);
  }

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

    const hashBuffer = await crypto.subtle.digest('SHA-256', manifestBytes);
    const manifestHash = bytesToHex(new Uint8Array(hashBuffer));

    const signature = await signManifest(privateKeyB64, manifestHash, options);
    await this.appendSignature(signature);

    return signature;
  }

  async listSignatures(): Promise<ManifestSignature[]> {
    const object = await this.options.bucket.get(this.signaturesPath);
    if (!object) return [];

    const text = await object.text();
    return text
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line) as ManifestSignature);
  }

  async verifyAll(): Promise<VerificationResult[]> {
    const manifest = await this.options.bucket.get(this.manifestPath);
    if (!manifest) return [];

    const manifestBytes = new Uint8Array(await manifest.arrayBuffer());
    const hashBuffer = await crypto.subtle.digest('SHA-256', manifestBytes);
    const expectedHash = bytesToHex(new Uint8Array(hashBuffer));

    const signatures = await this.listSignatures();
    return Promise.all(
      signatures.map(sig => verifyManifestSignature(sig, expectedHash))
    );
  }

  async verifyBySigner(publicKeyB64: string): Promise<VerificationResult[]> {
    const all = await this.verifyAll();
    return all.filter(r => r.signature.publicKey === publicKeyB64);
  }

  private async appendSignature(signature: ManifestSignature): Promise<void> {
    const line = JSON.stringify(signature) + '\n';
    const newLineBytes = new TextEncoder().encode(line);

    const existing = await this.options.bucket.get(this.signaturesPath);
    const existingBytes = existing
      ? new Uint8Array(await existing.arrayBuffer())
      : new Uint8Array(0);

    const combined = new Uint8Array(existingBytes.length + newLineBytes.length);
    combined.set(existingBytes, 0);
    combined.set(newLineBytes, existingBytes.length);

    await this.options.bucket.put(this.signaturesPath, combined, {
      httpMetadata: { contentType: 'application/x-ndjson' },
    });
  }
}

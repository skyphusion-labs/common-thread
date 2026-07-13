/**
 * Canonical JSON + Ed25519 packet crypto (mirrors implementation/archive/signing.ts).
 */

import { webcrypto } from 'node:crypto';

export function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return (
      '{' +
      keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') +
      '}'
    );
  }
  throw new Error('cannot canonicalize ' + typeof value);
}

export function base64ToBytes(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export async function sha256Hex(bytes) {
  const buf = await webcrypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyBytes(publicKeyB64, signatureB64, bytes) {
  const rawPublic = base64ToBytes(publicKeyB64);
  if (rawPublic.length !== 32) throw new Error('public key must be 32 bytes');
  const signature = base64ToBytes(signatureB64);
  if (signature.length !== 64) throw new Error('signature must be 64 bytes');
  const key = await webcrypto.subtle.importKey(
    'raw',
    rawPublic,
    { name: 'Ed25519' },
    false,
    ['verify']
  );
  return webcrypto.subtle.verify({ name: 'Ed25519' }, key, signature, bytes);
}

export async function verifyEvidencePacket(packet) {
  const sig = packet.packet_signature;
  if (!sig) {
    return { ok: false, reason: 'UNSIGNED: packet has no packet_signature' };
  }
  if (typeof packet.markdown !== 'string') {
    throw new Error('Packet has no markdown field to verify against');
  }
  if (sig.algorithm !== 'ed25519') {
    return { ok: false, reason: 'INVALID: unsupported algorithm ' + sig.algorithm };
  }

  const expected = await sha256Hex(new TextEncoder().encode(packet.markdown));
  if (sig.packetSha256 !== expected) {
    return {
      ok: false,
      reason:
        'INVALID: packet hash mismatch (signature ' +
        sig.packetSha256 +
        ', packet ' +
        expected +
        ')',
    };
  }

  const payload = { ...sig };
  delete payload.signature;
  const payloadBytes = new TextEncoder().encode(canonicalJson(payload));

  try {
    const valid = await verifyBytes(sig.publicKey, sig.signature, payloadBytes);
    if (!valid) {
      return { ok: false, reason: 'INVALID: signature does not verify against payload' };
    }
  } catch (err) {
    return { ok: false, reason: 'INVALID: crypto verification failed: ' + err.message };
  }

  return { ok: true, signature: sig };
}

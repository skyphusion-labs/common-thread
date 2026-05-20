/**
 * SHA-256 hashing and hex encoding utilities.
 *
 * Uses the Web Crypto API, available in Cloudflare Workers, browsers,
 * and modern Node.js. No external dependencies.
 */

/**
 * Compute SHA-256 of bytes, return lowercase hex string (64 chars).
 */
export async function sha256(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const buffer = bytes instanceof Uint8Array ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : bytes;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Convert bytes to lowercase hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  const out = new Array<string>(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i].toString(16).padStart(2, '0');
  }
  return out.join('');
}

/**
 * Convert lowercase hex string to bytes.
 * Throws if the string is not valid hex or has odd length.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.substring(i, i + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`Invalid hex character at position ${i}`);
    }
    bytes[i / 2] = byte;
  }
  return bytes;
}

/**
 * Validate that a string is a SHA-256 hex digest (64 lowercase hex chars).
 */
export function isValidSha256Hex(hex: string): boolean {
  return /^[0-9a-f]{64}$/.test(hex);
}

/**
 * SHA-256 hashing and hex encoding utilities.
 *
 * Uses the Web Crypto API, available in Cloudflare Workers, browsers,
 * and modern Node.js. No external dependencies.
 */

const HEX_CHARS = '0123456789abcdef';
const byteToHex: string[] = new Array(256);

for (let i = 0; i < 256; i++) {
  byteToHex[i] = HEX_CHARS[i >> 4] + HEX_CHARS[i & 0x0f];
}

/**
 * Compute SHA-256 of bytes, return lowercase hex string (64 chars).
 */
export async function sha256(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hashBuffer));
}

/**
 * Convert bytes to lowercase hex string (fast lookup table version).
 */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += byteToHex[bytes[i]];
  }
  return hex;
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
    const byteStr = hex.substring(i, i + 2);
    if (!/^[0-9a-f]{2}$/i.test(byteStr)) {
      throw new Error(`Invalid hex character at position ${i}`);
    }
    bytes[i / 2] = parseInt(byteStr, 16);
  }

  return bytes;
}

/**
 * Validate that a string is a SHA-256 hex digest (64 lowercase hex chars).
 */
export function isValidSha256Hex(hex: string): boolean {
  return /^[0-9a-f]{64}$/.test(hex);
}

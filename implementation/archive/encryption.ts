/**
 * Archive object envelope (paper §3.5).
 *
 * Artifact bytes are encrypted under the same per-investigation AES-256-GCM
 * key as the analytic payload (implementation/crypto/investigation-key.ts).
 * The content address stays the SHA-256 of the plaintext. The R2 object is
 * ciphertext, so a bucket read without the investigation secret does not
 * yield the bytes.
 *
 * Wire format, version 1:
 *   magic "ctae1" || nonce[12] || AES-256-GCM(ciphertext || tag)
 *
 * AAD is `${investigationId}|archive|${plaintextHash}|${extension}`.
 * Extension is empty when the object has no suffix. A dumped object cannot
 * be moved to another investigation, another hash, or another extension and
 * still decrypt.
 *
 * Manifest lines use the string cell format (`enc:1:`) instead of this
 * envelope, so the append coordinator can keep treating a line as opaque text.
 */

const MAGIC = new TextEncoder().encode('ctae1');
const NONCE_LEN = 12;
const TAG_LEN = 16;

const textEncoder = new TextEncoder();

export function archiveObjectAad(
  investigationId: string,
  plaintextHash: string,
  extension?: string
): string {
  const ext = extension ? extension.replace(/^\./, '') : '';
  return `${investigationId}|archive|${plaintextHash}|${ext}`;
}

export function manifestLineAad(investigationId: string): string {
  return `ct/manifest-line/${investigationId}`;
}

export function isEncryptedArchiveObject(bytes: Uint8Array): boolean {
  if (bytes.byteLength < MAGIC.length + NONCE_LEN + TAG_LEN) return false;
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC[i]) return false;
  }
  return true;
}

export async function encryptArchiveObject(
  key: CryptoKey,
  investigationId: string,
  plaintextHash: string,
  extension: string | undefined,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  const nonce = new Uint8Array(NONCE_LEN);
  crypto.getRandomValues(nonce);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: textEncoder.encode(
          archiveObjectAad(investigationId, plaintextHash, extension)
        ),
      },
      key,
      plaintext
    )
  );
  const out = new Uint8Array(MAGIC.length + nonce.length + ct.length);
  out.set(MAGIC, 0);
  out.set(nonce, MAGIC.length);
  out.set(ct, MAGIC.length + nonce.length);
  return out;
}

export async function decryptArchiveObject(
  key: CryptoKey,
  investigationId: string,
  plaintextHash: string,
  extension: string | undefined,
  stored: Uint8Array
): Promise<Uint8Array> {
  if (!isEncryptedArchiveObject(stored)) {
    throw new Error('decryptArchiveObject: not an encrypted archive object');
  }
  const nonce = stored.subarray(MAGIC.length, MAGIC.length + NONCE_LEN);
  const body = stored.subarray(MAGIC.length + NONCE_LEN);
  const pt = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: textEncoder.encode(
        archiveObjectAad(investigationId, plaintextHash, extension)
      ),
    },
    key,
    body
  );
  return new Uint8Array(pt);
}

/**
 * Usage examples for the signing module.
 *
 * Two patterns are demonstrated:
 *
 *   1. Offline signing (recommended). Practitioner runs this locally
 *      against the production R2 bucket; the private key never enters
 *      the Worker. Suitable for CLI scripts run from a workstation
 *      with appropriate R2 credentials.
 *
 *   2. In-Worker verification. The Worker holds only the public key
 *      and confirms that the manifest it serves is signed by the
 *      expected practitioner.
 */

import {
  generateKeyPair,
  signManifest,
  verifyManifestSignature,
  ManifestSigner,
} from './signing';
import type { R2BucketLike } from './store';

// ---------------------------------------------------------------------------
// Pattern 1: Offline signing workflow
// ---------------------------------------------------------------------------

/**
 * Step 1: Generate a keypair once, at the start of an investigation.
 * Run this from a Node.js CLI or local script. Save the private key
 * to a password manager or hardware key. Publish the public key as
 * part of the investigation's evidence record (e.g. in the investigation
 * metadata, in a paper appendix, in a court filing exhibit).
 */
export async function generateInvestigationKeyPair(): Promise<void> {
  const kp = await generateKeyPair();
  console.log('Public key  (publish this):', kp.publicKey);
  console.log('Private key (store securely):', kp.privateKey);
  // Recommended next steps:
  //   - Save the private key in a password manager
  //   - Save the public key in the investigation metadata
  //   - Never commit the private key to version control
}

/**
 * Step 2: Sign the current manifest. Run this from the practitioner's
 * workstation. Requires R2 credentials with read/write access to the
 * investigation bucket.
 *
 * @param bucket - R2 bucket binding (in a Node script, use the @cloudflare/r2 SDK)
 * @param privateKeyB64 - The signer's private key, base64
 * @param signerId - A free-form signer identifier (e.g. email, name)
 * @param note - Optional note about this signing event
 */
export async function signCurrentManifest(
  bucket: R2BucketLike,
  investigationId: string,
  privateKeyB64: string,
  signerId?: string,
  note?: string
): Promise<void> {
  const signer = new ManifestSigner({ bucket, investigationId });
  const signature = await signer.sign(privateKeyB64, { signerId, note });
  console.log(`Signed manifest hash: ${signature.manifestHash}`);
  console.log(`Signed at: ${signature.signedAt}`);
  console.log(`Signer: ${signature.signerId ?? '(anonymous)'}`);
  console.log(`Signatures sidecar updated.`);
}

// ---------------------------------------------------------------------------
// Pattern 2: In-Worker verification
// ---------------------------------------------------------------------------

/**
 * Verify that the manifest is signed by the expected practitioner.
 * Run this in a Worker handler that needs to confirm manifest provenance
 * before serving evidence data.
 *
 * @param bucket - R2 bucket binding
 * @param expectedPublicKey - The public key of the practitioner who should
 *                            have signed this manifest
 * @returns true if a valid signature from the expected practitioner is present
 */
export async function verifyExpectedSigner(
  bucket: R2BucketLike,
  investigationId: string,
  expectedPublicKey: string
): Promise<boolean> {
  const signer = new ManifestSigner({ bucket, investigationId });
  const results = await signer.verifyBySigner(expectedPublicKey);
  return results.some(r => r.valid);
}

/**
 * Get a detailed report of all signatures on the current manifest.
 * Useful for an investigation status endpoint that wants to show
 * who has countersigned and whether the signatures still verify.
 */
export async function reportSignatureStatus(
  bucket: R2BucketLike,
  investigationId: string
): Promise<{
  totalSignatures: number;
  validSignatures: number;
  signers: Array<{
    publicKey: string;
    signerId?: string;
    signedAt: string;
    valid: boolean;
    reason?: string;
  }>;
}> {
  const signer = new ManifestSigner({ bucket, investigationId });
  const results = await signer.verifyAll();

  return {
    totalSignatures: results.length,
    validSignatures: results.filter(r => r.valid).length,
    signers: results.map(r => ({
      publicKey: r.signature.publicKey,
      signerId: r.signature.signerId,
      signedAt: r.signature.signedAt,
      valid: r.valid,
      reason: r.reason,
    })),
  };
}

// ---------------------------------------------------------------------------
// Pattern 3: Bytes-level signing (lower-level use)
// ---------------------------------------------------------------------------

/**
 * Sign and verify arbitrary bytes (not just manifests).
 * Useful if you want to sign evidence packets, attribution reports,
 * or other artifacts that the methodology produces.
 *
 * The low-level primitives (signBytes, verifyBytes) take a private key
 * and bytes, return base64 signatures, and don't impose any payload
 * structure. Use them when you have your own structured payload format.
 */
export async function demonstrateBytesLevelSigning(): Promise<void> {
  const { signBytes, verifyBytes } = await import('./signing');

  const kp = await generateKeyPair();
  const payload = new TextEncoder().encode('arbitrary bytes to sign');

  const sig = await signBytes(kp.privateKey, payload);
  const valid = await verifyBytes(kp.publicKey, sig, payload);

  console.log(`Signature: ${sig}`);
  console.log(`Verifies: ${valid}`);

  // Tampering with the bytes invalidates the signature.
  const tampered = new TextEncoder().encode('arbitrary bytes to sign!');
  const tamperedValid = await verifyBytes(kp.publicKey, sig, tampered);
  console.log(`Verifies after tampering: ${tamperedValid}`); // false
}

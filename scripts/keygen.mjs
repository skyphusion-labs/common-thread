#!/usr/bin/env node
/**
 * Common Thread keypair generator.
 *
 * Run with `npm run keygen` to generate a fresh Ed25519 keypair.
 *
 * Output:
 *   - Public key, base64, 32 bytes. Publish this in the investigation
 *     evidence record. Add to .dev.vars as SIGNER_PUBLIC_KEY for the
 *     Worker to use during signature verification.
 *
 *   - Private key, base64, 32 bytes (the seed). Store in a password
 *     manager, hardware key, or equivalent. The private key signs
 *     manifests; anyone with it can produce signatures indistinguishable
 *     from yours. Never commit it to version control.
 *
 * This script runs locally on Node.js (>= 18) using the standard
 * webcrypto module. It does not require Wrangler or a Worker.
 */

import { webcrypto } from 'node:crypto';

async function main() {
  const cryptoKey = await webcrypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  );

  // Extract the 32-byte seed from the PKCS8 encoding.
  const pkcs8 = new Uint8Array(
    await webcrypto.subtle.exportKey('pkcs8', cryptoKey.privateKey)
  );
  const seed = pkcs8.slice(pkcs8.length - 32);

  // Extract the 32-byte public key.
  const rawPublic = new Uint8Array(
    await webcrypto.subtle.exportKey('raw', cryptoKey.publicKey)
  );

  const publicKey = Buffer.from(rawPublic).toString('base64');
  const privateKey = Buffer.from(seed).toString('base64');

  console.log('Common Thread keypair generated.');
  console.log('');
  console.log('Public key  (publish this, add to .dev.vars as SIGNER_PUBLIC_KEY):');
  console.log(`  ${publicKey}`);
  console.log('');
  console.log('Private key (store securely, never commit):');
  console.log(`  ${privateKey}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Save the private key in a password manager or hardware token.');
  console.log('  2. Add the public key to .dev.vars:');
  console.log(`     SIGNER_PUBLIC_KEY=${publicKey}`);
  console.log('  3. For production, set the public key as a Worker secret:');
  console.log(`     echo "${publicKey}" | wrangler secret put SIGNER_PUBLIC_KEY --env production`);
  console.log('  4. Sign manifests using the private key via a local CLI script.');
}

main().catch(err => {
  console.error('keygen failed:', err);
  process.exit(1);
});

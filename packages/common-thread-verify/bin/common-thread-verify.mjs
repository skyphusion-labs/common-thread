#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { verifyEvidencePacket } from '../lib/crypto.mjs';

function readInput(path) {
  return readFileSync(path ? path : 0, 'utf8');
}

function usage() {
  console.error('Usage: common-thread-verify <packet.json>');
  console.error('       cat packet.json | common-thread-verify');
  process.exit(1);
}

async function main() {
  const file = process.argv[2];
  if (process.argv.length > 3) usage();

  let packet;
  try {
    packet = JSON.parse(readInput(file));
  } catch (err) {
    console.error('Could not read or parse packet JSON:', err.message);
    process.exit(1);
  }

  const result = await verifyEvidencePacket(packet);
  if (!result.ok) {
    console.log(result.reason);
    process.exit(result.reason.startsWith('UNSIGNED') ? 2 : 2);
  }

  console.log('VALID: evidence packet signature verifies.');
  console.log('  signer:    ' + (result.signature.signerId ? result.signature.signerId : '(unnamed)'));
  console.log('  signed at: ' + result.signature.signedAt);
  console.log('  publicKey: ' + result.signature.publicKey);
  console.log('  sha256:    ' + result.signature.packetSha256);
  process.exit(0);
}

main().catch((err) => {
  console.error('verify failed:', err);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Verify a Common Thread evidence-packet detached signature (paper section 8.1.3).
 *
 * Usage:
 *   node scripts/verify-packet.mjs path/to/packet.json
 *   cat packet.json | node scripts/verify-packet.mjs
 *
 * Reads an exported JSON evidence packet, recomputes SHA-256 over its canonical
 * `markdown`, and verifies the detached Ed25519 `packet_signature` over the
 * canonical signed payload. Exit code: 0 valid, 2 invalid or unsigned, 1 usage.
 *
 * Self-contained (Node webcrypto); mirrors implementation/archive/signing.ts so
 * a packet can be verified without the Worker, the archive, or this repo build.
 */
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";

// Canonical JSON: identical encoding to implementation/archive/signing.ts.
function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value)
      .filter((k) => value[k] !== undefined)
      .sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
  }
  throw new Error("cannot canonicalize " + typeof value);
}

function base64ToBytes(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function sha256Hex(bytes) {
  const buf = await webcrypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyBytes(publicKeyB64, signatureB64, bytes) {
  const rawPublic = base64ToBytes(publicKeyB64);
  if (rawPublic.length !== 32) throw new Error("public key must be 32 bytes");
  const signature = base64ToBytes(signatureB64);
  if (signature.length !== 64) throw new Error("signature must be 64 bytes");
  const key = await webcrypto.subtle.importKey("raw", rawPublic, { name: "Ed25519" }, false, ["verify"]);
  return webcrypto.subtle.verify({ name: "Ed25519" }, key, signature, bytes);
}

function readInput() {
  const file = process.argv[2];
  return readFileSync(file ? file : 0, "utf8");
}

async function main() {
  let packet;
  try {
    packet = JSON.parse(readInput());
  } catch (err) {
    console.error("Could not read or parse packet JSON:", err.message);
    process.exit(1);
  }

  const sig = packet.packet_signature;
  if (!sig) {
    console.log("UNSIGNED: packet has no packet_signature (no signing key configured at export).");
    process.exit(2);
  }
  if (typeof packet.markdown !== "string") {
    console.error("Packet has no markdown field to verify against.");
    process.exit(1);
  }

  const expected = await sha256Hex(new TextEncoder().encode(packet.markdown));
  if (sig.algorithm !== "ed25519") {
    console.log("INVALID: unsupported algorithm " + sig.algorithm);
    process.exit(2);
  }
  if (sig.packetSha256 !== expected) {
    console.log("INVALID: packet hash mismatch (signature " + sig.packetSha256 + ", packet " + expected + ")");
    process.exit(2);
  }

  const payload = { ...sig };
  delete payload.signature;
  const payloadBytes = new TextEncoder().encode(canonicalJson(payload));

  let ok = false;
  try {
    ok = await verifyBytes(sig.publicKey, sig.signature, payloadBytes);
  } catch (err) {
    console.log("INVALID: crypto verification failed:", err.message);
    process.exit(2);
  }
  if (!ok) {
    console.log("INVALID: signature does not verify against the embedded payload.");
    process.exit(2);
  }

  console.log("VALID: evidence packet signature verifies.");
  console.log("  signer:    " + (sig.signerId ? sig.signerId : "(unnamed)"));
  console.log("  signed at: " + sig.signedAt);
  console.log("  publicKey: " + sig.publicKey);
  console.log("  sha256:    " + sig.packetSha256);
  process.exit(0);
}

main().catch((err) => {
  console.error("verify-packet failed:", err);
  process.exit(1);
});

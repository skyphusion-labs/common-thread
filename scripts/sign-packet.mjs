#!/usr/bin/env node
/**
 * Sign a Common Thread evidence packet offline (paper section 8.1.3).
 *
 * Usage:
 *   node scripts/sign-packet.mjs --key key.txt packet.json
 *   node scripts/sign-packet.mjs --key key.txt < packet.json > signed.json
 *   SIGNER_PRIVATE_KEY=<base64 seed> node scripts/sign-packet.mjs packet.json
 *
 * Options:
 *   --key <file>      File holding the base64 Ed25519 private-key seed (the
 *                     value scripts/keygen.mjs prints). If omitted, the
 *                     SIGNER_PRIVATE_KEY environment variable is used.
 *   --signer-id <id>  Optional signer identity bound into the signature.
 *   --note <text>     Optional free-text note bound into the signature.
 *   --out <file>      Write the signed packet here (default: stdout).
 *   --force           Re-sign a packet that already carries a packet_signature.
 *
 * Reads an exported JSON evidence packet, computes SHA-256 over its canonical
 * `markdown`, and populates the detached Ed25519 `packet_signature` field with a
 * record identical in shape to what the Worker produces when SIGNER_PRIVATE_KEY
 * is set (implementation/archive/signing.ts signPacket). The signed packet
 * verifies with scripts/verify-packet.mjs. Exit code: 0 signed, 2 refused
 * (already signed without --force), 1 usage or IO error.
 *
 * The private key is read from a file or environment variable and is never
 * written to stdout, stderr, or the signed packet; only the derived public key
 * appears in the signature record. The signed packet JSON is written to stdout
 * (or --out); human-readable confirmation goes to stderr, so the output pipes
 * straight into scripts/verify-packet.mjs.
 *
 * Self-contained (Node webcrypto); mirrors implementation/archive/signing.ts so
 * a packet can be signed without the Worker, the archive, or this repo build.
 */
import { webcrypto } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const USAGE =
  "Usage: node scripts/sign-packet.mjs [--key <file>] [--signer-id <id>] " +
  "[--note <text>] [--out <file>] [--force] [packet.json]\n" +
  "       (packet on stdin if no path; key via --key <file> or SIGNER_PRIVATE_KEY)";

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

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function base64UrlToBase64(b64url) {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  return b64;
}

async function sha256Hex(bytes) {
  const buf = await webcrypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Wrap a 32-byte Ed25519 seed as a PKCS8 key (same prefix as signing.ts).
function seedToPkcs8(seed) {
  return new Uint8Array([
    0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
    0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
    ...seed,
  ]);
}

async function derivePublicKey(privateKeyB64) {
  const seed = base64ToBytes(privateKeyB64);
  if (seed.length !== 32) throw new Error("private key must be 32 bytes, got " + seed.length);
  const key = await webcrypto.subtle.importKey("pkcs8", seedToPkcs8(seed), { name: "Ed25519" }, true, ["sign"]);
  const jwk = await webcrypto.subtle.exportKey("jwk", key);
  if (!jwk.x) throw new Error("could not derive public key from private key");
  return base64UrlToBase64(jwk.x);
}

async function signBytes(privateKeyB64, bytes) {
  const seed = base64ToBytes(privateKeyB64);
  if (seed.length !== 32) throw new Error("private key must be 32 bytes, got " + seed.length);
  const key = await webcrypto.subtle.importKey("pkcs8", seedToPkcs8(seed), { name: "Ed25519" }, false, ["sign"]);
  const sig = await webcrypto.subtle.sign({ name: "Ed25519" }, key, bytes);
  return bytesToBase64(new Uint8Array(sig));
}

function parseArgs(argv) {
  const opts = { key: null, signerId: null, note: null, out: null, force: false, help: false, packet: null };
  const needsValue = (flag, val) => {
    if (val === undefined) throw new Error("option " + flag + " requires a value");
    return val;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--key") opts.key = needsValue(a, argv[++i]);
    else if (a === "--signer-id") opts.signerId = needsValue(a, argv[++i]);
    else if (a === "--note") opts.note = needsValue(a, argv[++i]);
    else if (a === "--out") opts.out = needsValue(a, argv[++i]);
    else if (a === "--force") opts.force = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else if (a.startsWith("--")) throw new Error("unknown option " + a);
    else if (opts.packet === null) opts.packet = a;
    else throw new Error("unexpected extra argument " + a);
  }
  return opts;
}

function loadPrivateKey(opts) {
  if (opts.key) return readFileSync(opts.key, "utf8").trim();
  const env = process.env.SIGNER_PRIVATE_KEY;
  if (env && env.trim()) return env.trim();
  return null;
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(USAGE);
    process.exit(1);
  }
  if (opts.help) {
    console.error(USAGE);
    process.exit(1);
  }

  const privateKeyB64 = loadPrivateKey(opts);
  if (!privateKeyB64) {
    console.error("No private key: pass --key <file> or set SIGNER_PRIVATE_KEY.");
    console.error(USAGE);
    process.exit(1);
  }

  let packet;
  try {
    packet = JSON.parse(readFileSync(opts.packet ? opts.packet : 0, "utf8"));
  } catch (err) {
    console.error("Could not read or parse packet JSON:", err.message);
    process.exit(1);
  }

  if (typeof packet.markdown !== "string") {
    console.error("Packet has no markdown field to sign.");
    process.exit(1);
  }

  if (packet.packet_signature && !opts.force) {
    console.error("REFUSED: packet already carries a packet_signature; pass --force to re-sign.");
    process.exit(2);
  }

  let signature;
  try {
    const packetSha256 = await sha256Hex(new TextEncoder().encode(packet.markdown));
    const publicKey = await derivePublicKey(privateKeyB64);
    const payload = {
      algorithm: "ed25519",
      publicKey,
      packetSha256,
      signedAt: new Date().toISOString(),
    };
    if (opts.signerId) payload.signerId = opts.signerId;
    if (opts.note) payload.note = opts.note;
    const sigB64 = await signBytes(privateKeyB64, new TextEncoder().encode(canonicalJson(payload)));
    signature = { ...payload, signature: sigB64 };
  } catch (err) {
    console.error("Signing failed:", err.message);
    process.exit(1);
  }

  const output = JSON.stringify({ ...packet, packet_signature: signature }, null, 2) + "\n";
  if (opts.out) {
    writeFileSync(opts.out, output);
    console.error("SIGNED: wrote " + opts.out);
  } else {
    process.stdout.write(output);
    console.error("SIGNED: evidence packet signed.");
  }
  console.error("  signer:    " + (signature.signerId ? signature.signerId : "(unnamed)"));
  console.error("  signed at: " + signature.signedAt);
  console.error("  publicKey: " + signature.publicKey);
  console.error("  sha256:    " + signature.packetSha256);
  process.exit(0);
}

main().catch((err) => {
  console.error("sign-packet failed:", err);
  process.exit(1);
});

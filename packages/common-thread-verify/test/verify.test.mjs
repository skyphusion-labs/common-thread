/**
 * Tests for @skyphusion/common-thread-verify (issue #188 A2).
 *
 * Coverage:
 *  - Library verdicts over the 4 synthetic fixtures (valid/unsigned/tampered/bad-signature).
 *  - keygen -> sign -> verify round-trip with a TEMP key (seed never committed / never logged).
 *  - Parity: scripts/verify-packet.mjs (repo twin) and the package bin agree on every fixture
 *    (same exit code AND same verdict class).
 *  - Clean-room lint self-test (positive control) passes.
 *
 * Pure node:test + node:assert; no external deps, runs on a clean machine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyEvidencePacket } from "../lib/crypto.mjs";
import { selfTest as cleanroomSelfTest } from "../scripts/cleanroom-check.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, "..");
const REPO = join(HERE, "..", "..", "..");
const FIX = join(HERE, "fixtures");
const BIN = join(PKG, "bin", "common-thread-verify.mjs");
const SCRIPT = join(REPO, "scripts", "verify-packet.mjs");

const readFixture = (name) => JSON.parse(readFileSync(join(FIX, name), "utf8"));
const runNode = (file, args) => spawnSync("node", [file, ...args], { encoding: "utf8" });
const verdictClass = (out) => (out.match(/\b(VALID|UNSIGNED|INVALID)\b/) || [])[1] || "NONE";

// ---- library verdicts over fixtures --------------------------------------
test("valid fixture verifies (ok:true)", async () => {
  const r = await verifyEvidencePacket(readFixture("valid.json"));
  assert.equal(r.ok, true);
  assert.ok(r.signature && r.signature.algorithm === "ed25519");
});

test("unsigned fixture fails closed (UNSIGNED)", async () => {
  const r = await verifyEvidencePacket(readFixture("unsigned.json"));
  assert.equal(r.ok, false);
  assert.match(r.reason, /^UNSIGNED/);
});

test("tampered fixture fails closed (hash mismatch)", async () => {
  const r = await verifyEvidencePacket(readFixture("tampered.json"));
  assert.equal(r.ok, false);
  assert.match(r.reason, /hash mismatch/);
});

test("bad-signature fixture fails closed (does not verify)", async () => {
  const r = await verifyEvidencePacket(readFixture("bad-signature.json"));
  assert.equal(r.ok, false);
  assert.match(r.reason, /does not verify/);
});

// ---- keygen -> sign -> verify round-trip (temp key) ----------------------
test("round-trip: keygen -> sign -> verify (temp key, seed never persisted)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ct-verify-rt-"));
  try {
    const kg = runNode(join(REPO, "scripts", "keygen.mjs"), []);
    assert.equal(kg.status, 0, "keygen should exit 0");
    // seed = the indented line after the "Private key" label
    const lines = kg.stdout.split("\n");
    const idx = lines.findIndex((l) => l.startsWith("Private key"));
    const seed = (lines[idx + 1] || "").trim();
    assert.ok(seed.length > 0, "seed extracted");
    const seedFile = join(dir, "seed");
    writeFileSync(seedFile, seed, { mode: 0o600 });

    const packetFile = join(dir, "packet.json");
    writeFileSync(packetFile, JSON.stringify({ markdown: "# Evidence Packet\n\nround-trip." }));
    const signedFile = join(dir, "signed.json");
    const sign = runNode(join(REPO, "scripts", "sign-packet.mjs"), ["--key", seedFile, "--signer-id", "test", packetFile]);
    assert.equal(sign.status, 0, "sign should exit 0");
    writeFileSync(signedFile, sign.stdout);

    const good = await verifyEvidencePacket(JSON.parse(readFileSync(signedFile, "utf8")));
    assert.equal(good.ok, true, "freshly signed packet verifies");

    // negative half: tamper the freshly signed packet -> must reject
    const obj = JSON.parse(readFileSync(signedFile, "utf8"));
    obj.markdown += " TAMPER";
    const bad = await verifyEvidencePacket(obj);
    assert.equal(bad.ok, false, "tampered round-trip packet rejected");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- parity: repo script twin vs package bin -----------------------------
const PARITY = [
  ["valid.json", 0, "VALID"],
  ["unsigned.json", 2, "UNSIGNED"],
  ["tampered.json", 2, "INVALID"],
  ["bad-signature.json", 2, "INVALID"],
];
for (const [name, wantExit, wantClass] of PARITY) {
  test(`parity: script and bin agree on ${name} (exit ${wantExit}, ${wantClass})`, () => {
    const s = runNode(SCRIPT, [join(FIX, name)]);
    const b = runNode(BIN, [join(FIX, name)]);
    assert.equal(s.status, wantExit, "script exit code");
    assert.equal(b.status, wantExit, "bin exit code");
    assert.equal(s.status, b.status, "script and bin exit codes agree");
    const sc = verdictClass(s.stdout + s.stderr);
    const bc = verdictClass(b.stdout + b.stderr);
    assert.equal(sc, wantClass, "script verdict class");
    assert.equal(bc, wantClass, "bin verdict class");
    assert.equal(sc, bc, "script and bin verdict classes agree");
  });
}

test("parity: non-JSON input -> both exit 1", () => {
  const dir = mkdtempSync(join(tmpdir(), "ct-verify-badjson-"));
  try {
    const f = join(dir, "bad.json");
    writeFileSync(f, "not json");
    assert.equal(runNode(SCRIPT, [f]).status, 1);
    assert.equal(runNode(BIN, [f]).status, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- clean-room lint positive control ------------------------------------
test("clean-room lint self-test (positive control) passes", () => {
  const silent = { log() {} };
  assert.equal(cleanroomSelfTest(silent), true);
});

#!/usr/bin/env node
/**
 * Clean-room import lint for @skyphusion/common-thread-verify (issue #188 B1).
 *
 * The verify package is MIT; the Worker in implementation/ is AGPL-3.0. This
 * lint FAILS the publish if any file that ACTUALLY SHIPS imports code outside
 * the package (e.g. ../../implementation) or any external dependency. It keeps
 * the MIT/AGPL boundary true on the shipped artifact, not just on inspection.
 *
 * Un-stubbable seam: the file list comes from `npm pack --dry-run --json` (the
 * exact tarball contents), never a hand-maintained list. Positive control:
 * the self-test plants forbidden imports and asserts the scanner flags them, so
 * a vacuously-passing lint cannot slip through (a lint over a dead check passes).
 *
 * Exit 0 clean; exit 1 on any violation or self-test failure.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Extract every static/dynamic import + require specifier from a source string.
function extractSpecifiers(source) {
  const specs = [];
  const patterns = [
    /\bimport\b[^;]*?\bfrom\s*["\x27]([^"\x27]+)["\x27]/g,
    /\bimport\s*["\x27]([^"\x27]+)["\x27]/g,
    /\bimport\s*\(\s*["\x27]([^"\x27]+)["\x27]\s*\)/g,
    /\brequire\s*\(\s*["\x27]([^"\x27]+)["\x27]\s*\)/g,
    /\bexport\b[^;]*?\bfrom\s*["\x27]([^"\x27]+)["\x27]/g,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(source)) !== null) specs.push(m[1]);
  }
  return specs;
}

// Classify one specifier. Returns null if OK, or a violation reason string.
function violationFor(specifier, fileAbsPath) {
  if (/implementation|agpl/i.test(specifier)) return "imports AGPL/implementation path";
  if (specifier.startsWith("node:")) return null;
  if (specifier.startsWith(".") || isAbsolute(specifier)) {
    const target = resolve(dirname(fileAbsPath), specifier);
    const rel = relative(PKG_ROOT, target);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      return "relative import escapes the package root -> " + rel;
    }
    return null;
  }
  return "external/bare dependency \"" + specifier + "\" (package must be dependency-free)";
}

function scanSource(source, fileAbsPath) {
  const out = [];
  for (const spec of extractSpecifiers(source)) {
    const v = violationFor(spec, fileAbsPath);
    if (v) out.push({ specifier: spec, reason: v });
  }
  return out;
}

function shippedFiles() {
  const raw = execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: PKG_ROOT, encoding: "utf8" });
  const meta = JSON.parse(raw);
  return meta[0].files.map((f) => f.path).filter((p) => /\.(mjs|cjs|js)$/.test(p));
}

// Positive control: planted forbidden imports MUST be flagged; a clean source MUST NOT be.
export function selfTest(logger = console) {
  const binDir = join(PKG_ROOT, "bin", "planted.mjs");
  const planted = {
    "AGPL implementation import": "import { x } from \"../../implementation/archive/signing.ts\";",
    "external dependency": "import _ from \"lodash\";",
    "dynamic require escape": "const s = require(\"../../../implementation/x.js\");",
  };
  let ok = true;
  for (const [label, src] of Object.entries(planted)) {
    const caught = scanSource(src, binDir).length > 0;
    logger.log("  self-test [" + label + "]: " + (caught ? "CAUGHT" : "MISSED"));
    if (!caught) ok = false;
  }
  const cleanSrc = "import { readFileSync } from \"node:fs\";\nimport { c } from \"../lib/crypto.mjs\";";
  const cleanViol = scanSource(cleanSrc, binDir).length;
  logger.log("  self-test [clean control]: " + (cleanViol === 0 ? "PASS (no false positive)" : "FAIL (false positive)"));
  return ok && cleanViol === 0;
}

export { scanSource, shippedFiles };

function main() {
  const selfOnly = process.argv.includes("--self-test");
  console.log("clean-room lint: @skyphusion/common-thread-verify (MIT) must not import AGPL/implementation or external deps");
  if (!selfTest(console)) {
    console.error("FAIL: self-test (positive control) did not catch a planted violation.");
    process.exit(1);
  }
  if (selfOnly) {
    console.log("self-test only: PASS");
    process.exit(0);
  }
  const files = shippedFiles();
  console.log("scanning " + files.length + " shipped JS file(s): " + files.join(", "));
  let violations = 0;
  for (const rel of files) {
    const abs = join(PKG_ROOT, rel);
    let src;
    try {
      src = readFileSync(abs, "utf8");
    } catch (err) {
      console.error("FAIL: shipped file not readable: " + rel + " (" + err.message + ")");
      process.exit(1);
    }
    for (const v of scanSource(src, abs)) {
      console.error("  VIOLATION " + rel + ": " + v.reason + " [" + v.specifier + "]");
      violations++;
    }
  }
  if (violations > 0) {
    console.error("FAIL: " + violations + " clean-room violation(s).");
    process.exit(1);
  }
  console.log("PASS: shipped artifact imports only node: builtins and in-package files.");
  process.exit(0);
}

// Run main only when invoked directly, not when imported by the test suite.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

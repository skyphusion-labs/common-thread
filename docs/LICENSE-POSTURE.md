# License posture: npm packages vs the AGPL implementation

**DRAFT memo for Conrad's review. Ernst (legal-affairs helper), not a practicing
lawyer. This is structure and research, not legal advice.** Conrad, and where
noted licensed counsel, make the calls. Open questions are flagged **OPEN**.

## Question

Common Thread is dual-licensed (see [NOTICE](../NOTICE)):

- `implementation/` (the Worker, extractors, reasoner, archive) -- **AGPL-3.0-only**.
- `paper/` -- **CC-BY-4.0**.

Issue #188 proposes publishing offline CLI **components** to npm under
`@skyphusion` so courts, journalists, and OSINT practitioners can run the
evidence toolchain **without cloning the AGPL Worker monorepo**:

- `@skyphusion/common-thread-verify` -- already prepared, **MIT**, verifies signed
  packets (`packages/common-thread-verify/`).
- `keygen` (`scripts/keygen.mjs`) -- generate an Ed25519 keypair.
- `sign-packet` (`scripts/sign-packet.mjs`) -- sign an evidence packet offline.

Two sub-questions:

1. **Is a MIT carve-out correct** for the keygen/sign CLIs (matching the already-MIT
   verifier), sitting in the same repo as the AGPL implementation?
2. **Is the NOTICE clear enough** for a third party who installs
   `@skyphusion/common-thread-verify` (or the future keygen/sign packages) from
   npm without ever seeing the repo?

## Short answer

1. **Yes, MIT is defensible** for keygen/sign on the same basis as the verifier,
   **provided** each published package stays a **clean-room slice**: self-contained
   crypto/format helpers with **no import of, and no copied code from,
   `implementation/` (the AGPL tree)**. The copyright holder (Conrad) may license
   his own extracted code under MIT regardless of the repo's AGPL default; the
   only real risk is a package that is actually a *derivative* of AGPL code.
2. **Not yet.** The root NOTICE describes the repo-level dual license but says
   **nothing** about the MIT npm carve-out. A third party installing the package
   in isolation sees the package's own MIT `LICENSE` and README, which is
   adequate, but the repo NOTICE should name the published MIT packages so the
   boundary is unambiguous from either direction. A **draft NOTICE addition** is
   below.

## 1. Why MIT is correct for the CLIs

### The copyright holder controls the license

AGPL-3.0 on `implementation/` is a license **Conrad grants to others** for that
code. It does not bind Conrad's own future licensing of code **he authored**. As
the sole copyright holder he can publish an extracted, self-contained piece under
MIT, AGPL, both, or anything else. There is no "AGPL contamination" of the
author's own separately-distributed work; copyleft binds downstream redistributors,
not the original licensor.

So the question is not "may he" (he may) but "is each package genuinely
separable, or is it a derivative of the AGPL Worker code?" Separability is what
keeps the MIT grant honest and keeps a downstream user from later arguing the MIT
package was really AGPL-derived.

### The CLIs are separable by construction

Reviewed the three CLIs and the packaged verifier:

- **`scripts/verify-packet.mjs`** and **`packages/common-thread-verify/`** --
  self-contained Node `webcrypto`. The package header states it "mirrors
  `implementation/archive/signing.ts` so a packet can be verified without the
  Worker, the archive, or this repo build." It reimplements the **canonical JSON
  encoding and Ed25519 verify**; it does not import the AGPL module.
- **`scripts/keygen.mjs`** -- standard `node:crypto` `webcrypto` Ed25519 keypair
  generation. No project-specific logic beyond key extraction; nothing
  AGPL-derived.
- **`scripts/sign-packet.mjs`** -- self-contained Node `webcrypto`; the header
  states it "mirrors `implementation/archive/signing.ts`" to produce a signature
  "identical in shape to what the Worker produces," again **without** importing
  the Worker code.

The load-bearing distinction: these files reimplement a **format/protocol** (the
canonical-JSON-over-SHA-256, detached-Ed25519 packet signature) that
`signing.ts` also implements. **A wire format / interoperability protocol is not
itself copyrightable**; independently written code that produces the same bytes
is not a derivative work of the AGPL implementation merely because the two agree
on the format. That is exactly what makes an interoperable third-party verifier
legitimate.

### The clean-room condition (the one caveat)

The MIT grant stays clean **only while the packages do not pull in AGPL code**.
Concretely, for each published package:

- **No `import` from `implementation/`** (or any AGPL-licensed module), direct or
  transitive.
- **No copy-paste of AGPL source** into the package; reimplement the format, do
  not lift the file.
- If multiple CLIs need shared logic (packet schema types, canonical hashing),
  extract a **small dedicated MIT package** (#188 proposes
  `@skyphusion/common-thread-packet`) rather than importing from the AGPL tree.
  This keeps the toolchain MIT end-to-end and avoids one CLI quietly becoming an
  AGPL derivative.

**OPEN / verification for the dive (Rollins/Strummer or CI):** confirm by
inspection or a lint that the published `files` allowlist for each package
contains **no** path under `implementation/` and that the built package has **no**
require/import resolving into the AGPL tree. This is the single un-stubbable check
that keeps the posture true in the shipped artifact, not just on paper. The
existing verifier `package.json` `files` allowlist is `["bin","lib","README.md",
"LICENSE"]` -- self-contained, good; apply the same shape to keygen/sign.

### Consistency

The verifier is already MIT. Publishing keygen and sign as MIT makes the **whole
offline evidence toolchain** uniformly MIT and installable by a court or
journalist who must never touch AGPL code. That is the stated #188 goal and it is
coherent: the AGPL network-service copyleft protects the **hosted Worker commons**;
the offline verify/sign/keygen tools are **client-side utilities** whose value is
maximized by the most permissive license.

### License decision is independent of package names

#188 B2 leaves the keygen/sign package **names** to Conrad. The license analysis
does not depend on the names; MIT applies to whichever names are chosen, as long
as the clean-room condition holds.

## 2. NOTICE clarity for a third party

### What a third party actually sees

Installing `@skyphusion/common-thread-verify` from npm, a court/journalist gets
the package tarball: `bin/`, `lib/`, `README.md`, `LICENSE`. That `LICENSE` is
**MIT** (Copyright (c) 2026 Conrad Rockenhaus) and the README states plainly:
"This npm package is **MIT licensed**; the main repository remains **AGPL-3.0**."
**In isolation this is adequate** -- the installed artifact self-describes as MIT.

### The gap

The **repo root [NOTICE](../NOTICE)** documents only the two in-repo licenses
(AGPL implementation, CC-BY paper). It does **not** mention that a subset of the
code is **also distributed on npm under MIT**. So someone reading the repo cannot
tell, from NOTICE alone, that the packages carry a different license; and the
reverse reader (npm to repo) lands on an AGPL repo with no NOTICE pointer back to
the MIT carve-out. The boundary is only stated in the package README, which is
easy to miss.

### Recommendation: name the MIT packages in NOTICE

Add a short paragraph to the root NOTICE that (a) names the published MIT
packages and (b) states the boundary explicitly. Draft:

```
Offline client tools published to npm under the @skyphusion scope are licensed
MIT, not AGPL-3.0. These are self-contained utilities that interoperate with the
Common Thread evidence-packet format without incorporating the AGPL Worker code:

  - @skyphusion/common-thread-verify   (packages/common-thread-verify/, MIT)
  - @skyphusion/common-thread-keygen   (from scripts/keygen.mjs, MIT)     [when published]
  - @skyphusion/common-thread-sign     (from scripts/sign-packet.mjs, MIT) [when published]

Each MIT package ships its own LICENSE. Installing these packages does not
require cloning or complying with the AGPL-3.0 terms that govern the rest of this
repository. The AGPL-3.0 terms continue to govern the reference implementation in
implementation/ and everything else not explicitly published under a separate
license.
```

Keep the `[when published]` markers until keygen/sign actually ship, then drop
them; do not list a package in NOTICE before it is on the registry (a NOTICE that
promises an MIT package that does not exist is its own small defect). **OPEN for
Conrad:** approve the wording and the final package names before this lands.

### Secondary clarity items (low)

- **Per-package `LICENSE` + README boundary line:** the verifier already has both.
  Give keygen/sign the same two files (their own MIT `LICENSE`, a README line
  "MIT package; main repository is AGPL-3.0") so each is self-describing in
  isolation, matching the verifier.
- **`author` field:** the verifier `package.json` lists
  `Conrad Rockenhaus <conrad@skyphusion.org>`. Consistent and correct (Conrad is
  the copyright holder; crew commit attribution is a separate matter and does not
  change package authorship). No change needed.
- **SPDX:** each MIT `package.json` carries `"license": "MIT"` (verifier does).
  Keep that on keygen/sign; it is what tooling and registries read.

## Summary for Conrad

| Item | Read | Action |
|---|---|---|
| MIT for keygen/sign CLIs | Correct, same basis as verifier | Publish MIT, **keep each package a clean-room slice** (no `implementation/` imports) |
| Clean-room verification | Not yet confirmed on the built artifact | Add a `files`/import check in the dive or CI (the un-stubbable seam) |
| Root NOTICE clarity | Gap -- no mention of the MIT npm carve-out | Add the draft NOTICE paragraph above (name packages when they ship) |
| Per-package LICENSE/README | Verifier good; keygen/sign TBD | Mirror the verifier's two-file self-description |
| Package names | Conrad's call (#188 B2) | Independent of the license analysis |
| Shared logic across CLIs | Risk if imported from AGPL tree | Extract a small MIT `@skyphusion/common-thread-packet` rather than import AGPL |

**Open questions for Conrad:** (1) approve the NOTICE addition and final package
names; (2) confirm whether counsel review is wanted before the first
keygen/sign publish (the verifier is already MIT and out, so the incremental
risk is low, but the call is Conrad's).

---

**Status:** DRAFT (Ernst, #188). Structure and research, not legal advice.

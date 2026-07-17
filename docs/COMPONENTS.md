# Common Thread components

A map of every distributable component: what it is, how you install/run it, its
license, and when you'd reach for it. Companion to the hosted-release readiness
report (`docs/PUBLIC-RELEASE.md`) and the deep-dive tracked in
[#188](https://github.com/skyphusion-labs/common-thread/issues/188).

Common Thread is dual-licensed: the methodology paper (`paper/`) is **CC-BY-4.0**,
the reference implementation (`implementation/`) is **AGPL-3.0** (see `NOTICE`).
The offline evidence toolchain is carved out as **MIT** so courts, journalists,
and OSINT practitioners can verify packets without adopting the AGPL network
service.

## Offline evidence toolchain (third-party facing)

These let a stranger validate a Common Thread evidence packet with no clone, no
Worker, no database — just Node ≥ 18.

| Component | Install / run | License | When to use |
|---|---|---|---|
| `@skyphusion/common-thread-verify` | `npx @skyphusion/common-thread-verify <packet.json>` | MIT | Verify a signed evidence packet's Ed25519 signature offline. The canonical third-party path (courts, journalists). |
| `scripts/verify-packet.mjs` | `node scripts/verify-packet.mjs <packet.json>` (repo) / `npm run verify:packet` | AGPL repo, MIT-mirrored logic | Monorepo twin of the package; same output. For repo devs. |
| `scripts/keygen.mjs` | `npm run keygen` (repo) | git-only | Generate an Ed25519 signer keypair (32-byte base64 seed + public key). |
| `scripts/sign-packet.mjs` | `node scripts/sign-packet.mjs --key <seed> <packet.json>` (repo) | git-only | Offline-sign a packet's `packet_signature` with a held private key. |

**Verifier contract** (`bin/common-thread-verify.mjs`): reads packet JSON from a
path or stdin; recomputes SHA-256 over the packet's canonical `markdown`;
verifies the detached Ed25519 `packet_signature` over the canonical-JSON payload.
Exit codes: **0** valid, **2** invalid/unsigned, **1** usage error. Never prints
or requires a private key.

**Parity guarantee.** `packages/common-thread-verify/lib/crypto.mjs`,
`scripts/verify-packet.mjs`, and `implementation/archive/signing.ts` share one
canonical-JSON encoding and one signed-payload shape. Verified end-to-end
(keygen → sign → verify) across the repo script and the package bin, plus the
three negative cases (tampered / unsigned / bad-signature); fixtures live in
`packages/common-thread-verify/test/fixtures/`.

**Registry status (2026-07-17):** `@skyphusion/common-thread-verify` is prepared
(`package.json` `publishConfig`, workflow `publish-verify-npm.yml` on `verify-v*`
tags) but **not yet on npm** (`npm view` → 404). Publishing is #188 workstream B1.

## Reference implementation (self-host / adopt the service)

AGPL-3.0. Deploy from git + wrangler; not npm libraries.

| Component | Path | Notes |
|---|---|---|
| Backend Worker | `implementation/workers/` | HTTP surface (`docs/API.md`); capability-token auth; archive → extract → reason pipeline. |
| Web UI | `web/` | Vanilla JS/HTML/CSS planner; BYOK attribution (visitor-supplied Anthropic key / AI Gateway). |
| Deterministic extractors | `implementation/extractors/` | Stylometric, temporal, network, visual, metadata-leakage, cross-platform, account-metadata. No LLM. |
| Attribution reasoner | `implementation/reasoner/` | §7 triage + reasoning; citation-required; declines rather than guesses. |
| Archive / signing | `implementation/archive/` | Content-addressed R2 store; append-only manifest; Ed25519 manifest + packet signing. |
| MySQL schema | `mysql-schema.sql`, `mysql-migrations/` | Applied via `npm run db:migrate`. |

## Containers (deploy-from-git, GHCR)

Private images, not npm. `containers/ingest-worker`, `containers/attribution-worker`,
`containers/pdf-worker` — VPC-reached from the Worker (`VPC_INGEST`, `VPC_PDF`),
bearer-authed. Adopters need these only for the VPC ingest/PDF path; the inline
Worker path runs the pipeline without them for small exports.

## Explicit non-publish (unless Conrad expands scope)

- Full Worker / web UI / MySQL schema — git + wrangler (AGPL network service).
- Apify scrapers / `twitter_scrapes` fixtures — not npm libraries.
- Container images — GHCR, not npm.

If multiple CLIs come to need shared types (packet schema, canonical hash), the
right move is a small `@skyphusion/common-thread-packet` MIT library rather than
publishing the `implementation/` tree.

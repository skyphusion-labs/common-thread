# Common Thread

This file is the guide for any coding agent and any contributor. Follow it.

## What this project is

Common Thread is a methodology paper plus a reference implementation.
It attributes coordinated inauthentic behavior from public signals.
You give it a seed set of accounts.
It emits a claim in one of three bands: `insufficient`, `consistent`, or `strongly_consistent`.
It stops at cluster-level attribution.
It does not identify a natural person.

There is no hosted service.
Hosting ended on 2026-11-09.
Self-host only.
See [README.md](README.md) and [docs/TERMS.md](docs/TERMS.md).

The version is root `package.json`.
Do not copy a version into this file.
See the latest `v*` tag.

Two licenses apply.

- `paper/` is the methodology paper (CC-BY-4.0). The paper is the spec.
- `implementation/` is the reference implementation (AGPL-3.0). `web/` is part of that product.

When you change behavior that a paper section governs, keep the code consistent with that section.
Cite the section in the code and in the commit body.

[docs/PAPER-GAPS.md](docs/PAPER-GAPS.md) says what is shipped and what is still a paper gap.
[docs/PRIVACY-COMMITMENT.md](docs/PRIVACY-COMMITMENT.md) is the privacy posture.
Privacy is primary.
When a feature conflicts with that posture, the feature yields.

The MCP door is a separate repo, [common-thread-mcp](https://github.com/skyphusion-labs/common-thread-mcp).
The package is `@skyphusion/common-thread-mcp`.
It requires `COMMON_THREAD_API_URL`.
It has no default host.
Point it at your own deployment.

## How to work

```bash
npm test
npm run typecheck
npm run dev
npm run keygen
```

`npm test` runs Vitest.
One project uses the Workers pool.
One project uses MySQL.
`npm run typecheck` is not part of the test run.
Run it before you commit.
There is no lint script.

Copy the Wrangler templates before the first deploy.

```bash
cp wrangler.toml.example wrangler.toml
cp web/wrangler.toml.example web/wrangler.toml
```

`wrangler.toml` and `web/wrangler.toml` are gitignored.
They hold local resource ids.
Database, bucket, and key commands are in root `package.json`.
Setup steps are in [docs/SETUP.md](docs/SETUP.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

CI is [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Architecture

The target is the Cloudflare Workers runtime.
Use Web APIs in `implementation/`.
`node:*` imports belong in `scripts/` and in the Vitest config only.

A document follows three stages, in this order: archive, extract, reason.
Each stage writes rows that the next stage reads.

Archive (`implementation/archive/`) stores raw bytes in R2 by SHA-256.
The manifest is an append-only log.
Ed25519 signs the manifest hash.
Appends serialize per investigation when the `MANIFEST_COORDINATOR` binding is present.

Extract (`implementation/extractors/`) writes deterministic features.
Account extractors read artifact bytes.
Pair extractors read features that already exist.

Reason (`implementation/reasoner/`) calls a model.
Triage escalates when it is unsure.
Reasoning declines instead of guessing.
The runner writes provenance.
Do not trust provenance that the model reports.
Prompt versions live in `implementation/reasoner/prompts.ts`.

The HTTP surface is [docs/API.md](docs/API.md).
The Worker entry is `implementation/workers/index.ts`.
Creating an investigation returns an access token once.
Later calls require that token.
A sealed investigation is read-only.

Optional VPC containers ingest and render PDF.
Without them, a small ingest can run inside the Worker.
Encryption at rest is [docs/ENCRYPTION-AT-REST.md](docs/ENCRYPTION-AT-REST.md).

The MySQL schema is `mysql-schema.sql`.
Later changes are in `mysql-migrations/`.
Use the helpers in `implementation/schema/db-types.ts` for pair order and feature packing.

Integration tests need MySQL.
The default URL is in `tests/helpers/mysql.ts`.
Use a unique `investigation_id` in each test.
LLM tests must not call the network.
`fetchMock` intercepts the stubbed gateway.

## Release

A merge to `main` does not deploy.
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) runs on a `v*` tag (`v` plus digits).
The tag should match root `package.json`.
Read [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before you tag.
Self-host deploys leave `HOSTED_MAINTENANCE` unset.

Image workflows publish container images on a `v*` tag or on `workflow_dispatch`.
A bare push to `main` does not publish them.
The npm verify package, if you use it, uses a `verify-v*` tag.
See `.github/workflows/publish-verify-npm.yml`.

## Versions

A version changes only in a release pull request.
Feature and fix pull requests do not bump it.
Put the tag on that pull request's merge commit.
The version of record is root `package.json` and `package-lock.json`.
The tag shape is `v*`.
If that version already has a tag, the cycle is closed.
The next release pull request bumps.
If the manifest version has no tag, stop.
Find why before you bump again.

## Docs

Write Simplified Technical English.
Use short sentences.
Use one idea per sentence.
Use the active present tense.
Use plain words.
Use the same word every time.

Do not use an em dash (U+2014) or an en dash (U+2013).
Use a comma, a semicolon, parentheses, or two hyphens (`--`).

State the limit next to the capability.
Do not turn a measured result into a promise.
Failure stays conservative.
Triage escalates on uncertainty.
Reasoning declines rather than guesses.

Use Conventional Commits.
The body says why.

## Safety

Do not put a secret in a tracked file.
Do not put a secret in a log.
Do not put a secret in an issue.
Local secrets go in `.dev.vars`, which is gitignored.
`AI_GATEWAY_URL` and `ANTHROPIC_API_KEY` are optional when the caller brings a key.
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) states when a host key is required.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Common Thread is a **methodology paper plus a Cloudflare Workers reference
implementation** for sockpuppet attribution from public behavioral signals.
Given a seed set of accounts, it attributes coordinated inauthentic behavior to
a common operator and emits **calibrated probabilistic claims at three coarse
confidence bands** -- `insufficient`, `consistent`, `strongly_consistent`. It
stops at cluster-level attribution by design; it never identifies natural
persons.

Two halves, two licenses:

- `paper/` -- the twelve-section methodology paper (CC-BY-4.0). **The paper is the
  spec.** The implementation realizes it; code comments and prompts cite paper
  sections (e.g. `§7.4`, `§3.4`). When changing behavior governed by a section,
  keep the code consistent with the paper.
- `implementation/` -- the reference implementation (AGPL-3.0).

## Commands

```bash
npm test                 # vitest (one-shot) via @cloudflare/vitest-pool-workers
npx vitest run tests/reasoner/runner.test.ts   # single test file
npm run typecheck        # tsc --noEmit  (NOT run by vitest -- esbuild skips types)

npm run dev              # wrangler dev (local Worker on :8787)
npm run deploy           # wrangler deploy (default env)
npm run deploy:prod      # wrangler deploy --env production

npm run db:migrate         # apply mysql-schema.sql (set MYSQL_URL)
npm run db:hyperdrive:create  # create Hyperdrive → paste id into wrangler.toml
npm run r2:create          # create R2 bucket
npm run keygen           # generate an Ed25519 signer keypair (scripts/keygen.mjs)
```

Copy templates before first deploy:

```bash
cp wrangler.toml.example wrangler.toml
cp web/wrangler.toml.example web/wrangler.toml
```

`wrangler.toml` and `web/wrangler.toml` are gitignored (local resource IDs).

There is **no build step** and **no lint script**. `tsc` is not part of the test
run, so type errors pass tests silently -- run `npm run typecheck` before
committing (an `investigationId`/`investigation_id` mismatch slipped past tests
once for exactly this reason; see `TODO.md`).

## Runtime & bindings

Targets the **Cloudflare Workers runtime**, not Node. In `implementation/` use
only Web/Workers APIs (Web Crypto, `fetch`, etc.); `node:*` imports appear only
in `scripts/` and `vitest.config.mts`, which run on the host.

Bindings (`wrangler.toml`): `DB` (Hyperdrive → MySQL), `ARCHIVE` (R2). Optional:
`VPC_INGEST`, `VPC_PDF` for VPC containers. Web Worker (`web/wrangler.toml`):
`BACKEND` service binding → backend Worker. Vars: `ENVIRONMENT`,
`TRIAGE_MODEL` (default `claude-haiku-4-5`), `REASONING_MODEL` (default
`claude-opus-4-8`). Secrets (never committed; local via `.dev.vars`):
`AI_GATEWAY_URL` and `ANTHROPIC_API_KEY` are **optional** when users BYOK via
the web UI; otherwise required for server-side attribution.

`wrangler.toml`'s `main` is `implementation/workers/index.ts`. Apply
`mysql-schema.sql` to your MySQL instance and configure Hyperdrive `binding = "DB"`.

## Architecture

A document flows through three deterministic-then-probabilistic stages. The
ordering is a hard pipeline: **archive → extract → reason**, each writing MySQL
rows that the next stage reads.

### 1. Archive (`implementation/archive/`) -- content-addressed, signed

Raw artifacts are stored in R2 by SHA-256 content address before any
transformation (§3.1). `ArchiveStore` (`store.ts`) keys objects at
`sha256/AB/CD/<hash>`; `put` is idempotent and race-safe (R2 `onlyIf`), `get`
re-verifies the hash on read. `ManifestStore` (`manifest.ts`) is an append-only
JSONL log of `ManifestEntry` rows (source, collection method, investigation,
account, `status: present|absent` tombstones, `supersedes`). `ManifestSigner`
(`signing.ts`) signs the manifest hash with **Ed25519** via Web Crypto; `keygen`
produces the keypair. The `manifestHash()` is captured into every extractor and
attribution run for reproducibility (§3.4).

> Manifest append is read-modify-write. To close the last-write-wins race,
> appends are serialized per investigation through the `MANIFEST_COORDINATOR`
> Durable Object (`archive/manifest-coordinator.ts`, issue #70): `ManifestStore`
> routes appends there by `investigationId` when the binding is present. Without
> the binding (tests, local dev, migration tooling) it falls back to a
> non-serialized inline read-modify-write. The manifest bytes are identical
> either way, so `manifestHash()` and the §3.4 reproducibility contract are
> unaffected. Note: the DO serializes the inline-Worker ingest path; the VPC
> ingest container is a separate deployable and is out of the DO scope.

### 2. Extract (`implementation/extractors/`) -- deterministic features

Two extractor kinds, two runners:

- **Account extractors** (`runner.ts` → `runAccountExtractors`) read artifact
  bytes from R2 and write `account_features` (+ `account_feature_provenance`).
- **Pair extractors** (`pair-runner.ts` → `runPairExtractors`) read *already
  computed* account features for a canonical account pair and write
  `pair_features` (+ `pair_feature_provenance`). These are the "overlap"/distance
  signals.

Both log an `extractor_runs` row (manifest hash, status, counts; partial work is
preserved on failure). Extractors are registered by signal category in
subdirectories under `extractors/` -- `stylometric` (paper §4.3
"linguistic"), `temporal`, `network`,
`visual`, `metadata-leakage`, `cross-platform`, `account-metadata` -- and
aggregated in `index.ts` (`ALL_ACCOUNT_EXTRACTORS`, `ALL_PAIR_EXTRACTORS`, and
`*_BY_CATEGORY` maps). Each extractor carries a `name` + `version`; the version
is recorded per run and is part of the reproducibility contract. Concrete
examples: stylometric `burrows-delta` / `jsd-bigrams`, visual `dhash` /
`color-palette`, cross-platform `handle-reuse`.

`event_features` are populated by engagement event extractors (§4.4.3,
§4.4.4) when the ingest pipeline archives per-account timelines with
reply/repost/quote posts. Response-latency features (§4.2.2) and color-
palette features (§4.5.6) are dormant on the default v1 path; see paper
§6.4.6.

### 3. Reason (`implementation/reasoner/`) -- LLM, citation-required

`runner.ts` → `runAttribution(env, options)` is the entry point. For every
canonical ordered pair of seed accounts it:

1. **Builds a signal table** (`buildSignalTable`) from that pair's
   `pair_features` plus each account's `account_features`, joining
   `extractor_runs` to flag each signal `sufficient`/`degraded`, attaching an
   8-hex-char provenance fingerprint, and **randomizing signal order** with
   `seededShuffle` (deterministic djb2→xorshift32; the seed is recorded so a
   reviewer can reproduce the order -- §7.4.1).
2. **Triage** (`triage.ts` → `runTriage`, cheap `TRIAGE_MODEL`) returns
   `obviously_not_coordinated` (filtered out) or `warrants_further_analysis`
   (escalate). On any parse/JSON failure it **conservatively escalates** (§7.5.2).
   `skipTriage` bypasses this.
3. **Reasoning** (`reasoner.ts` → `runReasoning`, `REASONING_MODEL`) runs the
   §7.4 prompt, then validates (`validator.ts`, `validateReasoningOutput`) over a
   **format layer** (citations parse, cited signals exist, alternatives present,
   cluster composition) and a **content layer** (category coverage §7.3.1,
   citation directionality). On failure it **retries up to `maxRetries`
   (default 3)** appending retry feedback; on exhaustion it returns the §7.2.3
   **declination** default (no claims, `declined_pairs` populated).
4. **Writes one `attribution_runs` row per pair regardless of outcome**, with the
   band chosen by `derivePairBand` (highest band among matching pair-scope
   claims; cluster claims are ignored for the pair row but kept in
   `output_json`).

`ai-gateway.ts` (`callLLM`, `extractJSONObject`) is the shared transport to the
AI Gateway. **Provenance metadata on outputs is authored by the runner, never
trusted from the model** -- model self-reported `methodology_metadata` is
overwritten. Prompt versions live in `prompts.ts` (`triage-v1`, `reasoning-v1`)
and are written to each run row.

`derivePairBand` and `seededShuffle` are exported from `runner.ts` solely for
unit testing (`tests/reasoner/runner-internals.test.ts`).

### HTTP surface (`implementation/workers/index.ts`)

Full route reference: **`docs/API.md`**.

The Worker exposes health, capability-gated investigations (no public listing),
seeds (including soft-delete), features, Apify Twitter ingest (+ job status),
attribution, attribution runs, evidence packets (JSON / Markdown / PDF), seal,
manifest/signature endpoints, and debug routes.

Creating an investigation returns a one-time `access_token`; all
`/investigations/:id` routes require it (`Authorization: Bearer`, `X-Investigation-Token`, or `?access_token=` on GET). `sealed` investigations are read-only.

When `VPC_INGEST` is configured, ingest archives raw JSON once and dispatches
to `containers/ingest-worker/`; PDF export (`?format=pdf`) uses `VPC_PDF` to
reach `containers/pdf-worker/`. Without VPC, ingest runs the
full pipeline inline in the Worker (local dev on small exports).

## Data model (`implementation/schema/`)

MySQL schema in `mysql-schema.sql` at the repo root (incremental changes in
`mysql-migrations/`). Core tables: `investigations` (with `access_token_hash`
for capability tokens; `status` includes `sealed` for read-only),
`seed_accounts` (with
`basis_statement`, `is_control`, soft-deleted via `removed_at`),
`account_features` / `pair_features` / `event_features` (each stores a value in
exactly one of `feature_value_text|numeric|json`, enforced by CHECK), parallel
`*_provenance` tables linking features → `artifact_hash`, `extractor_runs`, and
`attribution_runs`. Pair tables use `platform_a`/`platform_b`; the CHECK orders
by account identifier only, so same-identifier-cross-platform pairs are
unsupported (noted in `TODO.md`).

`db-types.ts` holds row/insert types and the canonicalization + value helpers
the runners depend on: `canonicalPair`, `canonicalPlatformedPair`,
`packFeatureValue`, `readFeatureValue`. Use these rather than re-deriving pair
ordering or column packing.

## Testing conventions

Integration tests use **MySQL** (`TEST_MYSQL_URL`, default
`mysql://root@127.0.0.1:3306/common_thread_test`) via `tests/helpers/mysql.ts`.
`tests/setup.ts` applies `mysql-schema.sql` once before tests run. R2 and
`fetchMock` still use `@cloudflare/vitest-pool-workers` / `cloudflare:test`.

- LLM calls never hit the network: `fetchMock` intercepts the stubbed gateway.
  Helpers: `tests/helpers/db.ts`, `llm.ts`, `test-env.ts`.
- Use a **unique `investigation_id` per test** -- MySQL state is shared across a
  vitest run.
- Pure exported helpers (`derivePairBand`, `seededShuffle`) are tested directly
  without any binding.

The reasoner layer has full coverage; extractor integration tests seed MySQL +
R2 and assert feature rows.

## Conventions

- Code comments and prompts cite methodology paper sections (`§N.N`). Preserve
  these references and keep them accurate when you touch the governed behavior.
- Failure modes are deliberately conservative: triage escalates on uncertainty,
  reasoning declines rather than guesses, extractors preserve partial work.
- Runner internals are bundled with their entry point (signal-table assembly
  lives in `reasoner/runner.ts`, not a sibling) because they are tightly coupled
  to the pair-iteration loop -- follow that pattern rather than splitting helpers
  that just re-take the same `DatabaseClient` handle.

## Crew + identity

- Crew members work as their own Unix + gh identity. The FIRST command in any op is the member's own
  login shell: `sudo -u <member> bash -lc '<ops>'` (loads their `$HOME`, their `~/dev/common-thread`
  clone, their gh/CF creds).
- Crew commits land under the member's own `skyphusion-<member>` identity, never Conrad's. (Conrad
  devs ONLY on his laptop, where his commits author as `Conrad Rockenhaus <conrad@skyphusion.org>`
  -- his real name kept, the in-house `@skyphusion.org` email; his name is never scrubbed and his
  history never rewritten. On the crew host the `conrad` user is the god process and commits as
  `Mackaye <mackaye@skyphusion.org>`.)
- This repo lives on two licenses: `paper/` is CC-BY-4.0, `implementation/` is AGPL-3.0 (see
  `NOTICE`). Cross-project operating context lives in the main auto-memory
  (`~/.claude/projects/-home-conrad/memory/`); load it before acting.

## Commits & versioning

Conventional Commits (`feat(scope):` / `fix(scope):` / `docs:` / `ci:`); the body explains the why.
When a change is governed by a paper section, cite it (`§N.N`) in the commit body as well as the
code. SemVer-style `0.MINOR.PATCH` while pre-1.0.

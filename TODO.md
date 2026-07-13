# TODO

Planned and queued work for Common Thread. Items grouped by area; within each area, roughly ordered by priority. Session-by-session context (what got done when, what's mid-flight) lives in commit messages and the working notes, not here. This file is the durable backlog.

## Implementation

### Test coverage, extractor layer

The reasoner module has full coverage in `tests/reasoner/`. Extractor integration suites exist for account-metadata-pair, engagement, engagement-parse, priority-features, runner, apify-tweet-fields, and twitter-scrapes (see `tests/extractors/`). Per-extractor checkbox coverage below reflects what is still missing beyond those suites.

- [x] Stylometric account extractor: `tests/extractors/stylometric-twitter.test.ts` (+ burrows delta in `pair-extractors.test.ts`)
- [x] Temporal extractors: burst, cadence-jsd, active-hour-jsd, quiet-period (partial; see `tests/extractors/`)
- [x] Network extractors: follower-overlap, mutual-follow (partial; see engagement + runner suites)
- [x] Visual extractors: profile, banner, posted (`profile-banner-visual.test.ts`); color-palette via ingest wiring in sprint tests
- [x] Cross-platform extractors: `tests/extractors/cross-platform-pairs.test.ts`
- [x] Metadata-leakage extractors: `tests/extractors/metadata-leakage-pairs.test.ts`

### Worker HTTP API

Implemented in `implementation/workers/index.ts`. Full reference:
`docs/API.md`.

- [x] `POST` / `GET` / soft-`DELETE` `/investigations/:id/seeds`
- [x] `GET /investigations/:id/features` (account, pair, category, scope filters)
- [x] `POST /investigations/:id/attribute`
- [x] `GET /investigations/:id/runs` and `GET /investigations/:id/runs/:run_id`
- [x] `GET /investigations/:id/packet/:run_id` (JSON, `?format=markdown`, `?format=pdf`)
- [x] Apify Twitter ingest + ingest job status
- [x] Manifest, signatures, verify, debug endpoints

Still queued:

- [x] `DELETE /investigations/:id` (active only; MySQL graph + manifest sidecars; retains sha256/ blobs)
- [x] Detached Ed25519 signing on evidence-packet export route (§8.1.3) (issue #71: `SIGNER_PRIVATE_KEY` opt-in; verify via `npm run verify:packet`)

### Paper §8 evidence packet builder

- [x] v1 builder: `implementation/reporting/evidence-packet.ts` (JSON + Markdown)
- [x] PDF/A-2b via self-hosted `containers/pdf-worker/` (wkhtmltopdf + Ghostscript)
- [x] veraPDF validation in CI (`npm run validate:pdfa`, job `pdfa-validation`)
- [x] Court-specific PDF/A profile variants documented (`docs/PDF-A.md`; v1 ships 2b only)

### Paper §4.4.3 / §4.4.4 engagement signals

Implemented: event extractors derive reply/repost/quote engagements from
per-account timeline artifacts; co-engagement and amplification pair
extractors run on the default Apify Twitter ingest when ≥2 accounts are
present. Likes/favorites are not collected in v1. See paper §6.4.6.

### Response latency (§4.2.2)

Active when `investigations.metadata_json` includes `triggering_events`
(API + web UI shipped in Sprint 6, #121).

### Color palette (§4.5.6)

Active: ingest builds `application/x-color-palette-corpus` artifacts
(Sprint 6, #120).

### Optional schema migration 0003 (tuple CHECK)

Migration 0002 documented the same-identifier-cross-platform pair limitation in `schema_metadata`. If a real investigation hits that case (same handle on two platforms, e.g. `twitter:bob` and `reddit:bob`), draft 0003 with tuple CHECK `((account_a, platform_a) < (account_b, platform_b))`. Not blocking; add when needed.

## Tooling

### CI and type checking

- [x] Add `tsc --noEmit` step alongside `npm test` (`.github/workflows/typecheck.yml`)
- [x] GitHub Actions workflow for `npm test` and `tsc --noEmit` on push (`.github/workflows/ci.yml`)

### Docs maintenance

- [ ] `docs/TESTING_SETUP.md`: add a Windows section noting (a) the path-with-spaces issue and the `mklink /J` junction workaround, (b) the `nodejs_compat` requirement in `wrangler.toml`, (c) that the Workers runtime's max supported `compatibility_date` lags behind what `wrangler dev` accepts.
- [ ] `docs/SETUP.md`: cross-reference the Windows junction note in the Prerequisites block.

## Documentation

### Methodology paper

- [x] §9 synthetic worked example (`examples/synthetic-network-case-study.md`); author's reserved case study remains in `paper/09-case-study-placeholder.md`
- [ ] §11.8 open problems pulled forward into this file as separate items if any become work this project will own.

### Implementation docs

- [x] Prompt version registry (`docs/PROMPT-VERSIONS.md`)
- [x] Schema migrations changelog (`mysql-migrations/README.md`; incremental scripts begin at 0007)

## Audience and outreach

### v1 stabilization

- [ ] External reviewer pass on the methodology paper before arxiv / Zenodo submission
- [x] Community maintainer transition plan (`docs/MAINTENANCE.md`; seeking named volunteers)
- [ ] Zenodo DOI for the methodology paper

(Items in this section are deliberately light. v1 is bring-it-to-the-finish-line work, not feature creep.)

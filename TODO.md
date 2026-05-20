# TODO

Planned and queued work for Common Thread. Items grouped by area; within each area, roughly ordered by priority. Session-by-session context (what got done when, what's mid-flight) lives in commit messages and the working notes, not here. This file is the durable backlog.

## Implementation

### Test coverage, extractor layer

The reasoner module has 77 tests verified end-to-end against `@cloudflare/vitest-pool-workers` (slices 2 through 5 of `tests/reasoner/`). No extractor has direct tests yet. Pattern parallels `tests/reasoner/runner.test.ts`: seed D1 with raw artifacts, invoke the extractor, assert `pair_features` and `account_features` rows.

- [ ] Stylometric pair extractor (highest complexity, highest signal; start here)
- [ ] Temporal extractors: burst, cadence-jsd, active-hour-jsd, quiet-period
- [ ] Network extractors: follower-overlap, mutual-follow
- [ ] Visual extractors: profile, banner, posted, color-palette
- [ ] Cross-platform extractors: handle-reuse, bio-link, external-link
- [ ] Metadata-leakage extractors: client-app, exif, profile-lang, tweet-language

### Worker HTTP API

The current Worker exposes `/investigations` (POST, GET). The reasoner is library code not yet wired to a route. Routes to add:

- [ ] `POST /investigations/:id/seeds` and `GET` / soft-`DELETE` for seed account management
- [ ] `GET /investigations/:id/features` filterable by account, pair, category
- [ ] `POST /investigations/:id/attribute` to invoke `runAttribution`
- [ ] `GET /investigations/:id/runs` for attribution history; `GET /investigations/:id/runs/:run_id` for one row
- [ ] `GET /investigations/:id/packet/:run_id` for evidence packet export (blocked on paper §8)

### Paper §8 evidence packet builder

Blocked on methodology paper §8 details. When §8 is in scope, the builder consumes `attribution_runs.output_json` plus the underlying provenance and manifest entries to produce a court-grade evidence packet. Output format and signing conventions are paper deliverables, not implementation choices.

### Paper §4.4.3 / §4.4.4 engagement signals

Blocked on engagement-event collection (likes, retweets, replies as discrete events rather than account-level summaries). Pre-requisites:

- Collection pipeline that captures engagement events
- Schema for `event_features` rows (table exists; signal extraction not implemented)
- §4.4.3 (engagement-based follower-overlap) and §4.4.4 (engagement-graph clustering) extractors

### Optional schema migration 0003 (tuple CHECK)

Migration 0002 documented the same-identifier-cross-platform pair limitation in `schema_metadata`. If a real investigation hits that case (same handle on two platforms, e.g. `twitter:bob` and `reddit:bob`), draft 0003 with tuple CHECK `((account_a, platform_a) < (account_b, platform_b))`. Not blocking; add when needed.

## Tooling

### CI and type checking

- [ ] Add `tsc --noEmit` step alongside `npm test`. Vitest uses esbuild for transpilation and skips type checking entirely. The first smoke run surfaced an `investigationId` vs `investigation_id` mismatch at a `writeAttributionRun` call site that tsc would have caught at edit time.
- [ ] GitHub Actions workflow for `npm test` and `tsc --noEmit` on push (defer until smoke-run flake rate is known)

### Docs maintenance

- [ ] `docs/TESTING_SETUP.md`: add a Windows section noting (a) the path-with-spaces issue and the `mklink /J` junction workaround, (b) the `nodejs_compat` requirement in `wrangler.toml`, (c) that the Workers runtime's max supported `compatibility_date` lags behind what `wrangler dev` accepts.
- [ ] `docs/SETUP.md`: cross-reference the Windows junction note in the Prerequisites block.

### Repo workflow

- [ ] Decide on a single working-tree convention. The current pattern is `Documents/common-thread` as the local working tree and `G:\My Drive\common-thread` as the source pushed to GitHub. Two-tree edits require manual mirroring, which is a known footgun. Either:
  - Make Documents the only working tree; treat Drive as a `git pull` mirror from GitHub.
  - Pick one and remove the other.

## Documentation

### Methodology paper

- [ ] §9 worked case study. Currently placeholder; see `examples/README.md` for what a case study should contain and the anonymization requirements that gate publication.
- [ ] §11.8 open problems pulled forward into this file as separate items if any become work this project will own.

### Implementation docs

- [ ] Prompt version registry. Versions are currently embedded in `implementation/reasoner/prompts.ts` (`triage-v1`, `reasoning-v1`). Worth surfacing into `docs/` for citation in the methodology paper and for changelog-style tracking when prompts evolve.
- [ ] Schema migrations changelog, or a deliberate decision that the migrations directory itself is the changelog (preferred; less duplication).

### LICENSE for the methodology paper

The root `LICENSE` is AGPL-3.0 for the reference implementation. The methodology paper is CC-BY-4.0 per the README, but no `paper/LICENSE` exists yet.

- [ ] Add `paper/LICENSE` containing the CC-BY-4.0 legal code text. Canonical source: `https://creativecommons.org/licenses/by/4.0/legalcode.txt`.

## Audience and outreach

### v1 stabilization

- [ ] External reviewer pass on the methodology paper before arxiv / Zenodo submission
- [ ] Identify community maintainers per the README "Project posture and maintenance" section. The project's bounded maintenance commitment depends on this transition happening within roughly twelve months of v1.
- [ ] Zenodo DOI for the methodology paper

(Items in this section are deliberately light. v1 is bring-it-to-the-finish-line work, not feature creep.)

# Paper vs implementation gaps

Durable record of the 2026-07 paper-vs-implementation audit for Common Thread.
GitHub issues labeled `paper-gap` (#139–#154) are the work queue. This file is
the contract: what is shipped, what is tracked, and what is intentionally out of
scope. Trust this file and `main` over chat history.

**Paper canon:** `paper/` (especially §4 taxonomy, §5 collection, §6 extraction).
**Backlog index:** `TODO.md` (links the same issue table).
**API surface:** `docs/API.md`.

## Audit provenance

| Field | Value |
|-------|-------|
| Audit date | 2026-07-13 |
| Doc/issue landing | PR #155 (`docs/no-windows-paper-gaps`), merge `ae02062` |
| Issue label | `paper-gap` |
| Platforms | macOS / Linux only (Windows docs removed in #155) |

## Shipped relative to paper (do not re-open)

These were verified present on `main` at audit time (or landed in Sprints 6–10):

| Area | Status | Where |
|------|--------|-------|
| Default Twitter / Apify ingest signals (§4.1, §4.2.1, §4.2.3–5, §4.3 partial, §4.5.1–3, §4.6, §4.7 partial) | Active | Ingest + extractors |
| Engagement reply/repost/quote (§4.4.3–4) | Active when ≥2 accounts | Event + pair extractors |
| Response latency (§4.2.2) | Active when configured | `PATCH /investigations/:id/metadata` + web UI (`triggering_events`) |
| Color palette (§4.5.6) | Active | Ingest builds color-palette corpus (#120) |
| Evidence packet JSON/Markdown/PDF/A + Ed25519 (§8.1) | Active | `docs/API.md`, `docs/PDF-A.md` |
| Async attribution job path | Active | `202` + `GET .../attribution-jobs/:job_id` |
| `DELETE /investigations/:id` (active only) | Active | Manifest sidecars purged; `sha256/` retained |
| Prompt version registry | Active | `docs/PROMPT-VERSIONS.md` |
| Synthetic §9 case study | Active | `examples/synthetic-network-case-study.md` |
| veraPDF CI | Active | Job `pdfa-validation`; known wkhtmltopdf/GS clause waiver in `docs/PDF-A.md` |

Paper §6.4.6 table must stay consistent with the rows above when extractors ship.

## Paper-gap campaign #139–#154 (closed 2026-07-16)

Epic [#164](https://github.com/skyphusion-labs/common-thread/issues/164) closed when all
implementable gaps landed on `main`. No open `paper-gap` issues remain; #147 (AI face
detector) is **deferred** per issue comment (Workers cannot host the model in v1).

| Issue | Paper § | Summary | Status |
|-------|---------|---------|--------|
| [#139](https://github.com/skyphusion-labs/common-thread/issues/139) | §4.3.4 | Code-switching / register-pattern extractor | **Done** |
| [#140](https://github.com/skyphusion-labs/common-thread/issues/140) | §4.3.5 | Typo / error-pattern extractor | **Done** |
| [#141](https://github.com/skyphusion-labs/common-thread/issues/141) | §4.5.1 / §6.2.5 | pHash alongside dHash | **Done** |
| [#142](https://github.com/skyphusion-labs/common-thread/issues/142) | §6.2.3 | Pairwise JSD (sentence / punct / caps) | **Done** |
| [#143](https://github.com/skyphusion-labs/common-thread/issues/143) | §4.3.2–3 | Background-corpus TF-IDF / novelty n-grams | **Done** |
| [#144](https://github.com/skyphusion-labs/common-thread/issues/144) | §6.2.6 | Rarity-weighted bio + posted-URL overlap | **Done** |
| [#145](https://github.com/skyphusion-labs/common-thread/issues/145) | §4.4.4 | Amplification vs control baseline | **Done** (`amplification.ts` v1.1.0, #180) |
| [#146](https://github.com/skyphusion-labs/common-thread/issues/146) | §4.1.6 | Geocode profile locations | **Done** (`geocode.ts`, `docs/GEOCODING.md`, #179) |
| [#147](https://github.com/skyphusion-labs/common-thread/issues/147) | §4.5.5 | AI-generated face detector | **Deferred** (Workers/model hosting) |
| [#148](https://github.com/skyphusion-labs/common-thread/issues/148) | §4.5.4 | Image `source_class` from manifest | **Done** |
| [#149](https://github.com/skyphusion-labs/common-thread/issues/149) | §4.7.4 | Link shortener fingerprint | **Done** |
| [#150](https://github.com/skyphusion-labs/common-thread/issues/150) | §5.2.1 | Enforce `time_bounds` at ingest | **Done** |
| [#151](https://github.com/skyphusion-labs/common-thread/issues/151) | §5.5 | Re-collection + tombstones | **Done** (`recollection.ts`, `tombstones.ts`, #181) |
| [#152](https://github.com/skyphusion-labs/common-thread/issues/152) | §6.1.2 | Refuse silent overwrite across extractor versions | **Done** |
| [#153](https://github.com/skyphusion-labs/common-thread/issues/153) | §4.5.3 / §4.6 | Same-identifier cross-platform `pair_features` | **Done** |
| [#154](https://github.com/skyphusion-labs/common-thread/issues/154) | §5.4.4 | Optional archive dual-write / sync | **Done** |

When an issue lands, close it with `Closes #N` on the PR, strike or check the row in
`TODO.md`, and update paper §6.4.6 if default-ingest availability changed.

## Intentionally out of scope (do not file as `paper-gap`)

Paper §11.8 / collection choices that are not v1 product work unless Conrad
explicitly pulls them in:

- Open-world discovery / monitoring loops
- Per-language calibration datasets
- Empirical validation harness / inter-rater tooling / red-team procedures
- Block/mute list collection
- Visible-email harvesting
- Share-card crawling
- Likes / favorites collection (non-authored engagements)
- Author's reserved real §9 case study (`paper/09-case-study-placeholder.md`)

## Crew dispatch lanes (2026-07-16, complete)

**Epic:** [#164](https://github.com/skyphusion-labs/common-thread/issues/164) — **closed**
2026-07-16. All implementable `paper-gap` issues (#139–#154 except deferred #147) landed
on `main`. Coordination channel: crew-bus `common-thread`.

## Definition of done (per gap)

1. Code + unit/integration tests in `tests/`
2. `npm run typecheck` clean
3. Paper §6.4.6 and extractor directory headers updated if availability changes
4. `docs/API.md` / SETUP only if new operator surface
5. PR closes the GitHub issue; remove or mark done in `TODO.md` table

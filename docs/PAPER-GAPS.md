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

## Open implementable gaps (`paper-gap`)

| Issue | Paper § | Summary | Suggested owner lane |
|-------|---------|---------|----------------------|
| [#139](https://github.com/skyphusion-labs/common-thread/issues/139) | §4.3.4 | Code-switching / register-pattern extractor | Stylometric |
| [#140](https://github.com/skyphusion-labs/common-thread/issues/140) | §4.3.5 | Typo / error-pattern extractor | Stylometric |
| [#141](https://github.com/skyphusion-labs/common-thread/issues/141) | §4.5.1 / §6.2.5 | pHash alongside dHash | Visual |
| [#142](https://github.com/skyphusion-labs/common-thread/issues/142) | §6.2.3 | Pairwise JSD (sentence / punct / caps) | Stylometric |
| [#143](https://github.com/skyphusion-labs/common-thread/issues/143) | §4.3.2–3 | Background-corpus TF-IDF / novelty n-grams | Stylometric |
| [#144](https://github.com/skyphusion-labs/common-thread/issues/144) | §6.2.6 | Rarity-weighted bio + posted-URL overlap | Cross-platform |
| [#145](https://github.com/skyphusion-labs/common-thread/issues/145) | §4.4.4 | Amplification vs control baseline | Network / ingest |
| [#146](https://github.com/skyphusion-labs/common-thread/issues/146) | §4.1.6 | Geocode profile locations | Account metadata |
| [#147](https://github.com/skyphusion-labs/common-thread/issues/147) | §4.5.5 | AI-generated face detector | Visual (may defer hosting) |
| [#148](https://github.com/skyphusion-labs/common-thread/issues/148) | §4.5.4 | Image `source_class` from manifest | Visual / collection |
| [#149](https://github.com/skyphusion-labs/common-thread/issues/149) | §4.7.4 | Link shortener fingerprint | Metadata leakage |
| [#150](https://github.com/skyphusion-labs/common-thread/issues/150) | §5.2.1 | Enforce `time_bounds` at ingest | Ingest |
| [#151](https://github.com/skyphusion-labs/common-thread/issues/151) | §5.5 | Re-collection + tombstones | Ingest / archive |
| [#152](https://github.com/skyphusion-labs/common-thread/issues/152) | §6.1.2 | Refuse silent overwrite across extractor versions | Schema / extractors |
| [#153](https://github.com/skyphusion-labs/common-thread/issues/153) | §4.5.3 / §4.6 | Same-identifier cross-platform `pair_features` | Schema / pairs |
| [#154](https://github.com/skyphusion-labs/common-thread/issues/154) | §5.4.4 | Optional archive dual-write / sync | Archive |

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

## Crew dispatch lanes (2026-07-16)

**Epic:** [#164](https://github.com/skyphusion-labs/common-thread/issues/164).
Coordination channel: crew-bus `common-thread`. Git remains the durable contract
(branch + PR per issue or small issue cluster; never commit to `main`).

| Seat | Issues | Theme |
|------|--------|-------|
| **mould** | #139, #140, #142, #143 | Stylometric extractors |
| **gordon** | #141, #144, #147, #148, #149 | Visual + cross-platform + shortener |
| **albini** | #145, #146, #150, #151, #152, #153, #154 | Network baseline, geocode, ingest, schema, archive |

Laptop (`cursor-laptop`) owns this document, epic coordination, and may pick up
any stalled issue. Prefer one feature branch / PR per issue (or tightly coupled
pair) so CI stays reviewable.

## Definition of done (per gap)

1. Code + unit/integration tests in `tests/`
2. `npm run typecheck` clean
3. Paper §6.4.6 and extractor directory headers updated if availability changes
4. `docs/API.md` / SETUP only if new operator surface
5. PR closes the GitHub issue; remove or mark done in `TODO.md` table

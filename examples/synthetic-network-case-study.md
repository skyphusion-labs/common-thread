# Synthetic network case study (§9 demonstration)

**Status:** Fictional worked example for methodology training. No real persons,
accounts, or incidents are depicted. Cluster labels (`Cluster-A`, `Cluster-B`)
replace platform identifiers; all handles and URLs are invented.

This case study supplements (does not replace) the author's reserved real-world
example described in `paper/09-case-study-placeholder.md`.

## Investigation summary

A regional newsroom investigated whether three Twitter accounts promoting the
same municipal bond measure were independently operated or coordinated. The
practitioner hypothesized a single political consultant operated all three.

| Cluster label | Platform | Stated role in seed set |
|---------------|----------|-------------------------|
| `Cluster-A` | Twitter | Primary promoter account |
| `Cluster-B` | Twitter | "Local parent" persona |
| `Cluster-C` | Twitter | "Small business owner" persona |

**Scope:** Public tweets and profile metadata, 90-day window, account-scope level 2.

## Basis statements (§5.1)

- **Cluster-A:** Repeated identical bond talking points within minutes of news articles; included in seed because temporal clustering exceeded chance baseline.
- **Cluster-B:** Profile created within 48 hours of Cluster-A; bio links to same fundraiser domain; included on cross-platform link overlap hypothesis.
- **Cluster-C:** Listed as control-adjacent (genuine local business account) to test whether bond promoters share signals with an unrelated local account.

## Collection and archival

- Apify Twitter scraper v1, timeline + profile snapshots archived to R2.
- Manifest signed; `manifest_hash_at_run` recorded on extractor runs.
- One re-collection at day 60 for monitoring posture (§5.4.3).

## Signal highlights (representative extract)

| Signal category | Pair | Feature | Interpretation |
|-----------------|------|---------|----------------|
| Temporal | A–B | `cadence_jsd` ≈ 0.02 | Near-identical posting hour distributions |
| Stylometric | A–B | `burrows_delta` low | Similar function-word vectors on English corpus |
| Cross-platform | A–B | `bio_link_jaccard` = 1 | Same normalized fundraiser URL in bios |
| Metadata leakage | A–B | `client_app_jaccard` = 1 | Identical Twitter Web App / iPhone mix |
| Network | A–C | `follower_overlap_jaccard` low | Expected: C is unrelated local business |

Cluster-C pairs correctly declined or landed `insufficient` across reasoning runs.

## Attribution output (illustrative)

**Pair A–B:** `strongly_consistent` with cited temporal, stylometric, bio-link, and client-app signals. Alternative explanations (coincidental topic interest, same regional news cycle) considered and rejected on cumulative weight.

**Pair A–C / B–C:** `insufficient`; reasoning layer declination default applied.

## Evidence packet

- Investigation-level packet exported (JSON + Markdown + PDF/A-2b).
- Control comparison section documents Cluster-C as non-coordinated reference.
- Redaction pass applied: no legal names; fundraiser URL replaced with `example-bond.local`.

## Practitioner reflection

**Strengths:** Multi-signal convergence on A–B without platform-internal data.

**Limits:** Stylometry alone would not have justified `strongly_consistent`; bio-link and client-app signals were common but became diagnostic in combination with temporal alignment.

**Missed:** Response-latency (§4.2.2) was not configured (no `triggering_events` in metadata); a triggering news article might have tightened temporal evidence.

## Anonymization notes

| Redacted | Replacement |
|----------|-------------|
| Account handles | Cluster-A/B/C labels |
| Fundraiser domain | `example-bond.local` |
| Municipality name | "Example City" |
| Practitioner identity | "Regional newsroom investigator" |

Relationships between clusters preserved so readers can verify methodological claims without identifying real actors.

## Reproducing this example

This narrative is **not** backed by archived artifacts in the repository. To practice the pipeline:

1. Collect a synthetic or public-domain Twitter JSON corpus with ≥2 accounts.
2. Create an investigation via `POST /investigations`.
3. Ingest, extract, attribute (BYOK), and export a packet per `docs/API.md`.

For submission criteria for a **community** case study with real (redacted) data, see `examples/README.md`.

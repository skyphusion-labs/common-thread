# Methodology paper publication checklist

Walk-through for publishing **Common Thread v1** (the methodology paper in `paper/`)
as a citable artifact. Canonical spec: `paper/` (CC-BY-4.0). Reference
implementation: `implementation/` (AGPL-3.0) in this repo.

**v1 finish items** (also in `TODO.md` §Audience and outreach): external reviewer
pass, Zenodo DOI. Optional: arXiv preprint after Zenodo.

**Paper-gap campaign:** closed 2026-07-16 (`docs/PAPER-GAPS.md`, epic #164). Do
not block publication on implementable gaps; #147 (AI face detector) is deferred
by design.

---

## 1. Pre-submit gate

Complete before contacting reviewers or depositing anywhere.

### 1.1 Paper completeness

- [ ] All twelve body sections present under `paper/` (§1–§12) plus `references.md`.
- [ ] Internal cross-references resolve (§N pointers, appendix references in §7/§8).
- [ ] `paper/references.md`: resolve or consciously retain every `[verify]` flag
      before formal deposit (search the file for `[verify]`).
- [ ] Add or confirm **cover metadata** for the deposit bundle: title, author
      (Conrad Rockenhaus / Skyphusion Labs), version label (**v1.0**), date,
      license (CC-BY-4.0), repo URL. `references.md` cites "the date on the cover
      page"; the deposit PDF should include it even though `paper/` is plain Markdown.
- [ ] Build a **single PDF** from `paper/*.md` (pandoc or equivalent) for Zenodo/arXiv;
      keep the Markdown source tree as a separate upload file.
- [ ] Record the **git tag or commit** the PDF was built from (pin for reproducibility).

Suggested title (adjust only if you add a dedicated title page elsewhere):

> **Common Thread: A Methodology for Attributing Coordinated Inauthentic Behavior
> from Observable Platform Signals**

### 1.2 §9 case study posture (synthetic vs reserved)

v1 ships **two** case-study artifacts; both must be explicit in the deposit abstract
and README:

| Artifact | Path | Role in v1 |
|----------|------|------------|
| Synthetic worked example | `examples/synthetic-network-case-study.md` | Training walkthrough; fictional cluster labels |
| Author's reserved §9 | `paper/09-case-study-placeholder.md` | Intentionally unpublished; ethical/anonymization reasons |

- [ ] Abstract and deposit description state that §9 in the paper is a **placeholder**,
      not a real investigation.
- [ ] Point readers to the **synthetic** example for an end-to-end narrative.
- [ ] Do **not** imply the author's real-world case study ships in v1.

See also `examples/README.md` and `docs/PAPER-GAPS.md` (out of scope list).

### 1.3 Implementation and repo links

- [ ] Deposit and paper cite **`https://github.com/skyphusion-labs/common-thread`**
      (canonical org repo). Update `paper/12-conclusion.md` if it still says
      `github.com/SkyPhusion/common-thread`.
- [ ] Mention reference implementation license (AGPL-3.0, root `LICENSE`) separately
      from paper license (`paper/LICENSE`, CC-BY-4.0).
- [ ] Link hosted demo only as optional context (`common-thread.skyphusion.org`);
      self-host path via `docs/SETUP.md` / `docs/DEPLOYMENT.md`.
- [ ] `docs/PAPER-GAPS.md` and `docs/PROMPT-VERSIONS.md` are current on `main` at
      the pinned commit.

### 1.4 Licenses (already split; confirm in bundle)

| Path | License | Notes |
|------|---------|-------|
| `paper/` | CC-BY-4.0 | `paper/LICENSE`; methodology text only |
| `implementation/`, `web/`, etc. | AGPL-3.0 | Root `LICENSE`; not part of Zenodo "paper" upload unless you choose a full-repo archive |

- [ ] Zenodo record license field = **CC-BY-4.0** for the paper files.
- [ ] README licensing section matches (`README.md` §Licensing).

### 1.5 Repository hygiene (already done; verify before tag)

- [ ] `main` protected by **`aviation-grade-main`** ruleset (PR required, CI).
- [ ] `npm run typecheck` and `npm test` green on the release commit.
- [ ] Paper-gap table in `TODO.md` / `docs/PAPER-GAPS.md` reflects closed campaign.

---

## 2. External reviewer pass

**Goal:** Methodology critique from practitioners outside the author circle, **before**
Zenodo/arXiv. Not a substitute for peer review at a journal; sufficient for a
documented open methodology release.

### 2.1 Reviewer profile (pick 2–4)

At least one from each lane where possible:

- Investigative journalist or OSINT practitioner (sockpuppet / coordinated-behavior work)
- Academic (computational social science, digital forensics, or HCI/security ethics)
- Legal-adjacent practitioner (evidence / chain-of-custody familiarity; not legal advice)
- Optional: trust-and-safety or platform-policy researcher

Use `docs/contact.md` for discretion if a reviewer needs a private PDF.

### 2.2 What to send

- PDF built from `paper/` at the pinned commit
- One-page cover note: v1 scope, §9 placeholder + synthetic example path, CC-BY intent
- Link to `examples/synthetic-network-case-study.md` and `docs/PAPER-GAPS.md`

### 2.3 Questions to ask reviewers

Ask for **written** feedback (bullet form is fine) on:

1. **Coherence:** Do §3–§8 read as one reproducible pipeline a practitioner could follow?
2. **Scope honesty:** Are §1.2 audience exclusions and §10 ethical commitments clear
   and internally consistent?
3. **Evidentiary claims:** Does §3 avoid overclaiming calibration or legal admissibility?
4. **Signal taxonomy:** Any §4 categories that look abusive, pseudonymity-targeting, or
   missing critical caveats?
5. **Limitations:** Does §11 adequately flag open problems (no empirical validation harness,
   English-centric defaults, adversarial operator reading)?
6. **§9 posture:** Is publishing with a placeholder §9 + synthetic example acceptable for
   the stated audience, or misleading?
7. **References:** Any `[verify]` citations reviewers recognize as wrong or misleading?
8. **Cite-worthiness:** Would they cite this as a methodology paper? What's missing for
   them to recommend it?

### 2.4 Exit criteria

- [ ] All invited reviewers responded or declined (document declines).
- [ ] **Blocking** issues fixed in `paper/` on a PR, or explicitly deferred with a note
      in the Zenodo description.
- [ ] Non-blocking feedback archived (issue, gist, or private notes); no requirement to
      satisfy every stylistic preference.

When done, check the box in `TODO.md` and update `docs/MAINTENANCE.md` milestone table.

---

## 3. Zenodo deposit (required)

**Primary citable DOI** for the methodology paper. Do this **after** reviewer pass.

### 3.1 Account and community

1. Log in to [Zenodo](https://zenodo.org/) (ORCID-linked recommended).
2. Optional: create or join a **Skyphusion Labs** Zenodo community for branded collections.

### 3.2 New upload (version 1.0.0)

| Field | Value |
|-------|-------|
| Upload type | Publication → Article **or** Working paper |
| Title | Same as cover metadata (§1.1) |
| Authors | Conrad Rockenhaus (affiliation: Skyphusion Labs) |
| Description | 2–3 paragraphs: closed-world sockpuppet attribution; cluster-level only; §9 placeholder; synthetic example at `examples/synthetic-network-case-study.md`; AGPL reference implementation in linked repo |
| License | Creative Commons Attribution 4.0 International |
| Keywords | `sockpuppet attribution`, `coordinated inauthentic behavior`, `OSINT`, `open methodology`, `chain of custody`, `evidence packet` |

**Files to upload**

- [ ] `common-thread-methodology-v1.0.pdf` (built from `paper/`)
- [ ] `common-thread-methodology-v1.0-source.tar.gz` or `.zip` (`paper/` tree only)
- [ ] Optional: include `examples/synthetic-network-case-study.md` in the archive

**Related identifiers**

- [ ] Link GitHub repo: `https://github.com/skyphusion-labs/common-thread`
- [ ] Related DOI slot: leave empty until arXiv DOI exists; back-fill after arXiv if used

### 3.3 Publish and record

- [ ] Mint DOI (Zenodo publishes on "Publish", not merely "Save draft").
- [ ] Copy DOI: `10.5281/zenodo.XXXXXXX`
- [ ] Tag git: `paper-v1.0.0` (or project convention) at the built commit.

---

## 4. Optional arXiv preprint

arXiv is **optional** for reach in CS / computational social science circles. Zenodo
remains the canonical open-methodology DOI unless you later publish in a journal.

**Suggested categories** (pick primary + secondary):

| Code | Fit |
|------|-----|
| **cs.CY** (primary) | Computers and Society — ethics, practitioner audience, dual-use |
| **cs.SI** | Social and Information Networks — coordinated behavior, network signals |
| **cs.CL** (optional cross) | Stylometric / linguistic signal sections (§4.3, §6.2) |

**Process sketch**

1. Create arXiv account; obtain endorsement if required for cs.CY / cs.SI.
2. Upload same PDF as Zenodo; **check "Do not announce"** until Zenodo is live if you
   want DOI cross-links settled first.
3. Abstract: lead with methodology contribution; one sentence on §9 placeholder + synthetic
   supplement; link Zenodo DOI and GitHub repo.
4. After arXiv posts, edit Zenodo record to add arXiv DOI in related identifiers.

---

## 5. Post-publish housekeeping

Run after Zenodo DOI is live (and arXiv if used).

### 5.1 README and docs

- [ ] Add Zenodo DOI badge and link near top of root `README.md`:

  `[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.XXXXXXX.svg)](https://doi.org/10.5281/zenodo.XXXXXXX)`

- [ ] Add **Cite this methodology** block to `README.md`:

  ```text
  Rockenhaus, C. (2026). Common Thread: A Methodology for Attributing Coordinated
  Inauthentic Behavior from Observable Platform Signals (v1.0). Zenodo.
  https://doi.org/10.5281/zenodo.XXXXXXX
  ```

  (Adjust year/version to match deposit.)

- [ ] Link `docs/PUBLICATION.md` from `docs/README.md` reference table (done when this
      doc lands).
- [ ] Update `docs/MAINTENANCE.md` milestone rows: reviewer pass **Done**, Zenodo **Done**.

### 5.2 TODO and tracking

- [ ] Check off in `TODO.md` §Audience and outreach:
  - External reviewer pass
  - Zenodo DOI
- [ ] Optional GitHub release notes referencing `paper-v1.0.0` tag and DOI.

### 5.3 Paper front matter (follow-up PR if needed)

- [ ] Add Zenodo DOI to deposit PDF cover page and, if desired, a short "Version history"
      note in `paper/09-case-study-placeholder.md` or a new `paper/00-front-matter.md`.

---

## Quick sequence

```text
Pre-submit gate (§1)
    → External reviewers (§2)
    → Zenodo DOI (§3)
    → [Optional] arXiv (§4)
    → README badge + cite + TODO close (§5)
```

**Contacts:** public issues; private pre-publication → `docs/contact.md`
(`common-thread@skyphusion.org`).

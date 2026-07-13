# Prompt version registry (§7.4)

Attribution prompts are part of the methodology, not implementation detail. Every
`attribution_runs` row records `reasoning_prompt_version` and `prompt_sha256` so
practitioners can cite the exact prompt envelope used for a run.

Canonical prompt text lives in `implementation/reasoner/prompts.ts`. This document
is the changelog and citation index for paper cross-references.

## Active versions

| Version | Role | Model stage | Introduced |
|---------|------|-------------|------------|
| `triage-v1` | Cheap pair filter (§7.5.2); outputs `obviously_not_coordinated` or `warrants_further_analysis` | Triage (`TRIAGE_MODEL`, default Haiku-class) | v1.0 |
| `reasoning-v1` | Full attribution reasoning (§7); emits confidence band + cited claims | Reasoning (`REASONING_MODEL`, default Opus-class) | v1.0 |

## Versioning rules

1. **Increment the version string** when prompt semantics change (new alternative-explanation categories, revised declination instructions, output schema changes).
2. **Record `prompt_sha256`** on every run (already enforced by the runner). Hash covers `systemPrompt + "---" + userPrompt` per `promptSha256()` in `prompts.ts`.
3. **Do not invalidate prior runs** when a new version ships. Earlier rows keep their recorded version; re-run attribution if comparability across time matters (§7.4.4).
4. **Paper Appendix B** should cite this file for the version history when prompts evolve.

## `triage-v1` summary

- System prompt establishes the triage filter role and forbids `consistent` / `strongly_consistent` bands.
- User prompt includes the pair identifier, condensed signal summary, and investigation metadata envelope.
- Output schema: `{ verdict, rationale, methodology_metadata }` with `prompt_version: triage-v1`.

## `reasoning-v1` summary

- System prompt establishes declination-as-default, citation discipline, and the three-band output contract.
- User prompt includes the full signal table, investigation scope metadata, and optional retry feedback from validator failures.
- Output schema: `{ confidence_band, claims, alternative_explanations, methodology_metadata }` with `prompt_version: reasoning-v1`.

## Changelog

### `triage-v1` / `reasoning-v1` (2026-07, v1.0)

Initial published prompts shipped with the reference implementation and methodology paper v1.

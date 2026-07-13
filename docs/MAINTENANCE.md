# Project posture and maintenance

Common Thread v1 ships a complete methodology specification and reference
implementation. Ongoing maintenance is intentionally **bounded**: the author
cannot provide indefinite full-time support for every deployment and platform
change.

This document states the maintenance window, the path to community ownership,
and how practitioners should plan around both.

## Current maintainer

**Skyphusion Labs** (Conrad Rockenhaus) maintains the public hosted instance at
[common-thread.skyphusion.org](https://common-thread.skyphusion.org) and the
reference implementation on GitHub during the v1 stabilization period.

## Bounded commitment (v1 window)

During the first **twelve months after v1 stabilization** (target: through
mid-2027):

- Security fixes and reproducibility regressions on `main` are addressed promptly.
- Platform scraper breakage that blocks the default Apify Twitter path is triaged.
- Methodology paper errata and documentation corrections land on `main`.
- Feature expansion beyond the published spec is **not** in scope unless it closes
  a documented gap between paper and implementation.

After that window, maintenance continues only if community maintainers have
stepped up (see below). The hosted public instance may be reduced to
best-effort or retired with notice if no successor maintainers exist.

## Transition to community maintainers

The methodology paper (§11, §12) and AGPL-3.0 license assume practitioners
extend and sustain the work. Transition goals:

| Milestone | Target | Status |
|-----------|--------|--------|
| v1 spec-parity implementation merged | 2026-07 | Done (epic #132) |
| Extractor test coverage floor | 2026-07 | Done (Sprints 9–10) |
| Published prompt registry + maintenance doc | 2026-07 | Done |
| External methodology paper reviewer pass | Before arXiv/Zenodo | Open |
| Named community maintainer(s) with merge rights | Within 12 months of v1 | **Seeking volunteers** |
| Zenodo DOI for methodology paper | Before arXiv | Open |

### How to become a maintainer

1. **Demonstrate sustained contribution**: merged PRs, issue triage, or a
   substantive community case study (see `examples/README.md`).
2. **Open a GitHub Discussion** titled `Maintainer interest: <handle>` describing
   your lane (implementation, methodology docs, hosted ops, platform adapters).
3. The current maintainer grants org/repo permissions after a short coordination
   call and agrees on scope (security response, release tagging, hosted instance).

Maintainers are individuals or small teams, not anonymous accounts. Attribution
in `CONTRIBUTORS` or release notes is expected.

## Hosted instance vs self-host

| Surface | Operator | SLA |
|---------|----------|-----|
| [common-thread.skyphusion.org](https://common-thread.skyphusion.org) | Skyphusion Labs | Best-effort during bounded window |
| Self-hosted Worker + MySQL + R2 | You | Your ops |

Self-hosters should not depend on the public API for production workflows without
prior contact (`common-thread@skyphusion.org`). See `docs/DEPLOYMENT.md`.

## What maintainers are not expected to do

- Provide legal advice or case strategy.
- Operate investigations on behalf of third parties.
- Guarantee attribution outcomes for any seed set.
- Support audience exclusions violations (§1.2, §10.2).

## Contact

- Public: GitHub issues, `docs/contact.md`
- Private: `common-thread@skyphusion.org`

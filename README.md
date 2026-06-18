# Common Thread
A practitioner's methodology and reference implementation for sockpuppet attribution from observable behavioral signals on social platforms.
Common Thread is published as a documented methodology paper alongside a working reference implementation. It is designed for practitioners who have been systematically underserved by the existing tooling landscape: pro se litigants documenting coordinated harassment, small-newsroom investigative journalists, OSINT practitioners working on coordinated inauthentic behavior cases, and academic researchers studying these networks without access to platform-internal data or commercial OSINT firms.
## What this is
Common Thread attributes coordinated inauthentic behavior across multiple online accounts to a common operator using signals observable from the public platform surface. The methodology operates on a seed set of accounts (closed-world attribution) and produces probabilistic claims at calibrated confidence bands: insufficient evidence, consistent with same operator, or strongly consistent with same operator. It does not identify natural persons; cluster-level attribution is the methodology's limit by deliberate design.
The methodology rests on four commitments:
- **Immutable archival** of raw artifacts before any transformation, with content-addressed storage and signed manifests
- **Calibrated probabilistic outputs** at coarse confidence bands, with declination as the default when signals do not support a claim
- **Deliberately excluded signals** that primarily detect legitimate pseudonymity (a protected practice for many populations the methodology is not for)
- **Reproducibility** of the deterministic pipeline, with non-determinism in the LLM-assisted reasoning layer documented rather than concealed
## What this is not
Common Thread is not a bot detector (use Botometer or BotSentinel for automated-account detection). It is not an open-world discovery tool (it operates on a seed set you provide). It is not a natural-person identification tool (it stops at the cluster level by structural commitment). It is not a stalker's tool or an unmasker of legitimate pseudonymous activity. The methodology paper's §1.2 names the audiences the methodology is for and the audiences it is explicitly not for; please read it before applying the methodology to an investigation.
## Repository contents

paper/ Methodology paper, twelve sections plus references implementation/ Backend reference implementation workers/ Cloudflare Workers handlers (core API) extractors/ Deterministic feature extractors per signal category reasoner/ LLM-assisted attribution reasoning layer schema/ TypeScript types + MySQL schema docs archive/ Archival utilities for R2 content-addressed storage web/ Self-contained web frontend Worker (browser-based UI) docs/ Practitioner documentation (SETUP.md, DEPLOYMENT.md, API.md, etc.) scripts/ Utility scripts (keygen, etc.) tests/ Tests and test utilities examples/ Worked examples (placeholder until anonymized case studies land)

## Deployment
The project uses a split structure:
- Backend logic lives in `implementation/`
- Web frontend lives in the `web/` subdirectory
- Each has its own `wrangler.toml` configuration
**Full deployment instructions** (Cloudflare resources, MySQL + Hyperdrive + R2 setup, backend Worker, web frontend Worker, service bindings, local development, secrets, one-command deploys, troubleshooting, etc.) are in:
→ **`docs/DEPLOYMENT.md`**

→ **`docs/API.md`** (HTTP routes and workflow)

### High-level prerequisites
- Node.js ≥ 18
- Cloudflare account with Workers, Hyperdrive, and R2 enabled
- MySQL 8+ database
- Wrangler CLI installed and logged in
See `docs/DEPLOYMENT.md` for the complete setup commands, resource creation scripts, deployment targets, and service binding configuration.
## Web Frontend Worker
A self-contained single-file web frontend Worker (`web/worker.js`) provides a browser-based UI for the system. It supports uploading data, running extractors, viewing results, and interacting with the backend.
- Deploy independently from the backend.
- Recommended: Use a **service binding** (e.g. `BACKEND`) in production for private, CORS-free communication.
- Falls back to a configurable `DEFAULT_BACKEND_URL` when no binding is present.
Full details, configuration steps, and redeployment instructions are in `docs/DEPLOYMENT.md`.
## Quick start (summary)
1. Clone the repository.
2. Install dependencies: `npm install`.
3. Follow the complete resource creation + deployment steps in `docs/DEPLOYMENT.md`.
4. (Optional but recommended) Configure the web frontend to talk to your backend via service binding.
5. Set required secrets (especially `AI_GATEWAY_URL` and `ANTHROPIC_API_KEY` for reasoning features in production).
6. Start an investigation (see **`docs/API.md`** for the full workflow).
Common Thread is bring-your-own-keys for scraping (e.g. Apify) and the LLM reasoning layer (Anthropic via Cloudflare AI Gateway). The deterministic feature-extraction layer is portable.
## Methodology paper
The methodology paper is the canonical specification. The reference implementation is one realization of the methodology, not the only valid one. Read the paper before using the tool.
The paper is organized in twelve sections:
1. Introduction
2. Background and related work
3. Evidentiary framework
4. Signal taxonomy (eight categories of behavioral signals)
5. Collection methodology
6. Feature extraction (deterministic, versioned)
7. Attribution reasoning (LLM-assisted, citation-required)
8. Output and reporting (evidence packets, court use, publication conventions)
9. Case study (placeholder in v1)
10. Ethical considerations
11. Limitations and future work
12. Conclusion
Plus a separate references file.
## Licensing
The reference implementation is licensed under **AGPL-3.0**. Forks operated as hosted services must publish source under the same license. The intent is to deter silent enterprise-style use that strips out the methodology's commitments without contributing back.
The methodology paper is licensed under **CC-BY-4.0**. It may be cited, redistributed, and built upon with attribution. The methodology specification is intended to be citable in academic and journalistic work as a documented methodology.
## Project posture and maintenance
Common Thread is published with a bounded maintenance commitment. The author's role is to ship v1 of the methodology and reference implementation, respond to issues during the initial stabilization period, and identify community maintainers who take long-term ownership within approximately twelve months. The methodology paper's §11.8 names open problems for future work; the project's sustained value depends on practitioners and researchers who find the work useful taking ownership of extensions, validations, and adaptations.
This is not a venture-funded project. There is no roadmap to enterprise tooling, hosted services, or commercial extension. The methodology serves a specific underserved practitioner audience and is designed to remain in that lane.
## About this project
The author developed this methodology in the course of documenting coordinated inauthentic behavior encountered in active state-court litigation. The methodology's discipline (chain of custody, calibrated confidence, audience exclusions, no natural-person identification) reflects the specific evidentiary and ethical demands of using attribution work in court contexts where adversarial scrutiny is the default.
The author is a combat veteran (US Navy, Kosovo 1999 with 1st ANGLICO; Afghanistan with Radio Battalion), service-connected disabled, and a pro se litigant. The methodology was built from the inside of the problem it documents. That position is the methodology's source of authority; it is also a known risk vector that §11 acknowledges directly. The exclusions throughout the paper (especially §4.8 and §10.2) are designed to keep the methodology from being shaped by its author's specific case rather than by the general practitioner need it serves.
The author's hope for the methodology is that it gives other pro se litigants, small newsrooms, and OSINT practitioners a documented tool for work they otherwise have to do artisanally. The publication is therapeutic in part; it is also a contribution to a field where documented methodology has been scarce and where the populations underserved by existing tooling are real.
## Contributing
Contributions are welcomed under the following conventions:
- **Bug reports and methodology questions:** open an issue
- **Code contributions:** pull requests should reference a specific section of the methodology paper where applicable
- **Methodology extensions:** propose as a methodology paper amendment or as a separate methodology paper that cites this one
- **Worked case studies:** if you apply the methodology to your own investigation and want to publish a case study, the methodology's anonymization requirements apply; the author is willing to consult on whether a proposed case study meets the methodology's standards
Contributors should be aware that the project's posture is one of bounded maintainership. The author is not seeking to build a large contributor community at v1; the goal is to ship a stable v1, identify community maintainers, and step back. Contributors interested in long-term maintainership are encouraged to reach out.
## Acknowledgments
The methodology draws on the prior work of many researchers and practitioners, cited in the paper's References. Particular intellectual debts are owed to the Indiana University Observatory on Social Media (Cresci, Ferrara, Menczer, Pacheco, and colleagues) for foundational work on bot detection and coordinated-behavior detection; to the authorship attribution community (Burrows, Koppel, Stamatatos, Brennan, Greenstadt) for stylometric methodology; to Bellingcat for the OSINT practitioner methodology that the formal academic literature has not always served; and to the networked-privacy and threat-modeling scholarship (Nissenbaum, boyd, Marwick, Matthews and colleagues) that grounds the methodology's audience exclusions.
The methodology's ethical posture is shaped by the broader academic literature on online harassment and pseudonymous-population threat modeling. Citron's work on hate crimes in cyberspace, Marwick and boyd on networked privacy, and the various USENIX SOUPS papers on populations-specific threat modeling are particularly relevant references.
## Contact
For methodology questions, open an issue.
For private inquiries (legal review, sensitive case consultation, coordination on methodology extensions), use the contact information in `docs/contact.md`.
---
**Status:** v1 in active stabilization. Methodology paper complete. Reference implementation includes backend Worker and web frontend Worker.
**Citation:** [TBD once Zenodo DOI is established]
**Repository:** https://github.com/skyphusion-labs/common-thread
**Website:** [www.skyphusion.net/common-thread](https://www.skyphusion.net/common-thread)


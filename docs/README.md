# Documentation index

Practitioner docs for the Common Thread reference implementation. The
methodology paper in `paper/` is the canonical specification; these guides
cover running and deploying the code.

## Getting started

1. **[SETUP.md](SETUP.md)**: Install dependencies, MySQL + Hyperdrive + R2,
   local secrets, first investigation (capability token).
2. **[API.md](API.md)**: HTTP routes: create → ingest → features → attribute → packet; investigation access tokens.
3. **[DEPLOYMENT.md](DEPLOYMENT.md)**: Deploy backend and web Workers,
   service bindings, VPC containers, production secrets.

## Reference

| Document | Description |
|----------|-------------|
| [API.md](API.md) | Full HTTP API (backend Worker) |
| [ARCHIVE-BACKUP.md](ARCHIVE-BACKUP.md) | Operator guide for R2 archive replication (§5.4.4) |
| [PDF-A.md](PDF-A.md) | PDF/A-2b export, court profiles, veraPDF CI validation |
| [PROMPT-VERSIONS.md](PROMPT-VERSIONS.md) | Attribution prompt version registry (§7.4) |
| [MAINTENANCE.md](MAINTENANCE.md) | Bounded maintenance window and community transition |
| [PUBLICATION.md](PUBLICATION.md) | Methodology paper v1 checklist (reviewers, Zenodo, optional arXiv) |
| [PAPER-GAPS.md](PAPER-GAPS.md) | Paper vs implementation audit; closed `paper-gap` campaign #139–#154 |
| [TESTING_SETUP.md](TESTING_SETUP.md) | Vitest, `TEST_MYSQL_URL`, LLM mocks |
| [BACKGROUND-CORPUS.md](BACKGROUND-CORPUS.md) | Practitioner background corpus for §4.3.2–3 TF-IDF / novelty n-grams |
| [contact.md](contact.md) | Issue tracker vs private email |
| [PRIVACY.md](PRIVACY.md) | Hosted-instance privacy disclosure (DRAFT) |
| [ACCEPTABLE-USE.md](ACCEPTABLE-USE.md) | Hosted-instance acceptable use / audience limits (DRAFT) |
| [LICENSE-POSTURE.md](LICENSE-POSTURE.md) | npm MIT packages vs AGPL implementation; NOTICE clarity (DRAFT) |
| [API-OPENNESS-DECISION.md](API-OPENNESS-DECISION.md) | UI-public vs API-public decision note (DRAFT, pending) |

## Related READMEs

| Path | Description |
|------|-------------|
| [../README.md](../README.md) | Project overview |
| [../implementation/schema/README.md](../implementation/schema/README.md) | MySQL schema and Hyperdrive |
| [../containers/ingest-worker/README.md](../containers/ingest-worker/README.md) | VPC ingest container |
| [../containers/pdf-worker/README.md](../containers/pdf-worker/README.md) | VPC PDF/A renderer |
| [../examples/README.md](../examples/README.md) | Case studies (synthetic §9 walkthrough) |
| [../packages/common-thread-verify/README.md](../packages/common-thread-verify/README.md) | Offline evidence packet verifier (npm) |

## Configuration templates

Copy and customize before deploy (both are gitignored when local):

```bash
cp wrangler.toml.example wrangler.toml
cp web/wrangler.toml.example web/wrangler.toml
```

**Backend bindings:** `DB` (Hyperdrive), `ARCHIVE` (R2). Optional:
`VPC_INGEST`, `VPC_PDF` for production-scale ingest and PDF export.

**Web bindings:** `BACKEND` (service binding → backend Worker name). Production:
UI https://common-thread.skyphusion.org · API https://common-thread-backend.skyphusion.org

**Hosted API use:** The production API is not open for unsolicited third-party
integration. Contact **common-thread@skyphusion.org** before building against
the hosted endpoint, or self-host your own backend (see [API.md](API.md#using-the-hosted-api)).

**Investigation access:** Each investigation has a capability token (`access_token`)
returned once at creation. Required for all `/investigations/:id` routes. See
[API.md](API.md#investigation-access).

## AI credentials

- **Public hosting:** Users BYOK via the web UI (Anthropic key + AI Gateway URL
  or `https://api.anthropic.com`). No server-side AI secrets required.
- **Self-hosted / API-only:** Set `AI_GATEWAY_URL` and `ANTHROPIC_API_KEY` as
  Worker secrets. See SETUP.md and API.md.

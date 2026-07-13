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
| [TESTING_SETUP.md](TESTING_SETUP.md) | Vitest, `TEST_MYSQL_URL`, LLM mocks |
| [contact.md](contact.md) | Issue tracker vs private email |

## Related READMEs

| Path | Description |
|------|-------------|
| [../README.md](../README.md) | Project overview |
| [../implementation/schema/README.md](../implementation/schema/README.md) | MySQL schema and Hyperdrive |
| [../containers/ingest-worker/README.md](../containers/ingest-worker/README.md) | VPC ingest container |
| [../containers/pdf-worker/README.md](../containers/pdf-worker/README.md) | VPC PDF/A renderer |
| [../examples/README.md](../examples/README.md) | Case study placeholder |
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

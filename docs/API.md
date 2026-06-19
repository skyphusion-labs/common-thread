# HTTP API reference

Backend Worker routes implemented in `implementation/workers/index.ts`. All
JSON responses use `Content-Type: application/json` unless noted.

Base URL examples:

- Local: `http://localhost:8787`
- Production (hosted): `https://common-thread-backend.skyphusion.org`
- Other deployments: `https://<your-worker>.workers.dev`

## Using the hosted API

The production API at **https://common-thread-backend.skyphusion.org** is
operated by the project author for the public web UI and approved integrations.
It is **not** a general-purpose open API for third-party projects.

If you want to call the **hosted** API from your own application — whether from
a browser, a backend service, or a script that runs as part of your product —
**contact the operator first** before building against it:

- Email: **common-thread@skyphusion.org**
- Or open a GitHub issue (see [contact.md](contact.md))

Include a short description of your project, expected traffic, and (for browser
apps) the origin URL(s) you need allowlisted.

You do **not** need permission to **self-host** the reference implementation
(AGPL-3.0). Deploy your own backend Worker and point your client at that
instance instead. See [SETUP.md](SETUP.md) and [DEPLOYMENT.md](DEPLOYMENT.md).

## Browser access (CORS)

The API is intended for **server-side clients** (`curl`, scripts, backend
integrations) on **your own deployment**, or on the hosted API **after the
operator has approved your use** (see [Using the hosted API](#using-the-hosted-api)).
Browser JavaScript on another website can only call the API if the page origin
is listed in the Worker's `CORS_ALLOWED_ORIGINS` var
(comma-separated exact origins, e.g. `https://app.example.com`).

| Client | CORS applies? |
|--------|----------------|
| `curl`, Python, Node (no `Origin` header) | No — but hosted use still requires prior contact |
| Web UI via service binding | No — Worker-to-Worker, not browser CORS |
| Browser app on another domain | Yes — origin must be allowlisted |

Unknown browser origins receive `403` with `code: cors_forbidden`. Approved
origins are added to `CORS_ALLOWED_ORIGINS` in production `wrangler.toml` after
you have been in touch (see [contact.md](contact.md)).

## Typical workflow

```text
POST /investigations                         (save access_token from response)
  → POST /investigations/:id/seeds           (optional; ingest also registers seeds)
  → POST /investigations/:id/ingest/apify-twitter
  → GET  /investigations/:id/ingest-jobs/:job_id   (poll until completed)
  → GET  /investigations/:id/features        (verify extractors ran)
  → POST /investigations/:id/attribute       (requires AI credentials; see BYOK)
  → GET  /investigations/:id/runs
  → GET  /investigations/:id/packet/:run_id?format=pdf
  → POST /investigations/:id/seal            (optional; read-only thereafter)
```

All routes under `/investigations/:id` require the investigation **capability
token** returned at creation (see [Investigation access](#investigation-access)).
There is no public listing of investigations.

With **Workers VPC** configured (`VPC_INGEST`), ingest and PDF rendering run on
self-hosted containers (`containers/ingest-worker/`, `containers/pdf-worker/`).
Without VPC, ingest runs the full archive + extraction pipeline inline in the
Worker (suitable for local dev only on small exports).

---

## Health

### `GET /`

Health check.

**Response `200`**

```json
{
  "name": "common-thread",
  "version": "0.1.0",
  "environment": "production",
  "status": "ok",
  "hosted_api_notice": "The hosted API is not open for unsolicited third-party use. Contact common-thread@skyphusion.org before integrating it into your project.",
  "contact": "common-thread@skyphusion.org"
}
```

In non-production environments the response omits `hosted_api_notice` and
`contact`. Self-hosted deployments do not include these fields unless
`ENVIRONMENT` is set to `production`.

---

## Investigations

Investigations are **private by default**. Each investigation receives an
unguessable capability token at creation. The server stores only a SHA-256 hash
of the token; the plaintext is returned **once** in the create response and
cannot be recovered later.

### Investigation access

Pass the token on every request scoped to an investigation (`/investigations/:id/...`,
and `GET /manifest?investigation=:id`).

| Method | Header / query |
|--------|----------------|
| Preferred | `Authorization: Bearer ct_…` |
| Alternate | `X-Investigation-Token: ct_…` |
| GET only | `?access_token=ct_…` on the request URL |

**Responses**

| Code | `code` field | Meaning |
|------|--------------|---------|
| `401` | `missing_token` | No token provided |
| `401` | `invalid_token` | Wrong token or unknown investigation |
| `403` | `read_only` | Investigation is `sealed` (or `archived`); mutating routes rejected |
| `404` | `not_found` | Investigation ID does not exist |

**Status and writes**

| `status` | Read (GET) | Write (POST, DELETE, ingest, attribute) |
|----------|------------|----------------------------------------|
| `active` | Allowed with token | Allowed with token |
| `sealed` | Allowed with token | Rejected (`read_only`) |
| `archived` | Allowed with token | Rejected (`read_only`) |

Seal an active investigation with `POST /investigations/:id/seal`. Sealing is
intended for “investigation complete” — review and export evidence packets, but
no further ingest or attribution.

**Security expectations (public hosting)**

Capability tokens stop casual browsing and ID guessing. They are **not**
passwords: anyone with the token can read the investigation (and modify it while
`active`). Tokens in share links or browser storage can leak via history,
referrers, or device compromise. For high-sensitivity work, self-host the
backend or add stronger access controls (for example Cloudflare Access).

### `GET /investigations`

**Disabled.** Returns `404` with `code: listing_disabled`. Investigations are
not enumerable.

### `POST /investigations`

Create an investigation. Does not require a token.

**Body**

```json
{
  "id": "my-investigation-1",
  "name": "Investigation title",
  "description": "Optional description"
}
```

**Response `201`**

```json
{
  "id": "my-investigation-1",
  "name": "Investigation title",
  "description": "Optional description",
  "status": "active",
  "created_at": "2026-06-18T12:00:00.000Z",
  "access_token": "ct_…",
  "access_notice": "Store access_token securely. It is shown only at creation and cannot be recovered."
}
```

**Store `access_token` immediately.** The web UI can bookmark it in
`localStorage` on the user's device; the server never returns it again.

### `GET /investigations/:id`

Fetch investigation metadata. Requires capability token.

**Response `200`**

```json
{
  "investigation": {
    "id": "my-investigation-1",
    "name": "Investigation title",
    "description": "Optional description",
    "status": "active",
    "created_at": "2026-06-18T12:00:00.000Z",
    "updated_at": "2026-06-18T12:00:00.000Z"
  }
}
```

### `POST /investigations/:id/seal`

Mark an investigation read-only. Requires capability token. Idempotent when
already sealed.

**Response `200`**

```json
{
  "investigation": {
    "id": "my-investigation-1",
    "status": "sealed",
    "updated_at": "2026-06-18T14:00:00.000Z"
  },
  "message": "Investigation sealed. Data remains readable with the access token; ingest and attribution are disabled."
}
```

### `GET /investigations/:id/summary`

Active seed count and manifest artifact count. Requires capability token.

---

## Seed accounts

All seed routes require the investigation capability token. `POST` and `DELETE`
require `status: active` (not sealed).

### `GET /investigations/:id/seeds`

List active seeds (`removed_at IS NULL`).

| Query | Description |
|-------|-------------|
| `includeRemoved=true` | Include soft-deleted seed rows |

### `POST /investigations/:id/seeds`

Add a seed account.

**Body**

```json
{
  "platform": "twitter",
  "account": "handle",
  "basis_statement": "Why this account is in the seed set (§5.1.1)",
  "is_control": false,
  "added_by": "api"
}
```

`basisStatement` is accepted as an alias for `basis_statement`.

**Response `201`**

### `DELETE /investigations/:id/seeds`

Soft-delete active seeds for a platform + account (sets `removed_at`,
`removed_reason`; row preserved for audit).

**Body**

```json
{
  "platform": "twitter",
  "account": "handle",
  "removed_reason": "Optional reason"
}
```

**Response `200`** — `{ removed_at, removed_count, ... }`  
**Response `404`** — no active seed for that pair.

---

## Features

### `GET /investigations/:id/features`

Requires capability token.

Query extracted features from MySQL.

| Query | Description |
|-------|-------------|
| `account` | Filter by account identifier |
| `platform` | Filter by platform (account/event scope) |
| `pair` | `accountA,accountB` (canonicalized) |
| `accountA` + `accountB` | Alternate pair filter syntax |
| `category` | Feature category, e.g. `stylometric`, `network` |
| `scope` | `account`, `pair`, `event`, or `all` (default) |
| `includeProvenance=true` | Attach `artifact_hash` provenance rows |

**Response `200`**

```json
{
  "investigationId": "...",
  "filters": { ... },
  "account_features": [ ... ],
  "pair_features": [ ... ],
  "event_features": [ ... ],
  "count": { "account": 0, "pair": 0, "event": 0, "total": 0 }
}
```

---

## Ingest (Apify Twitter)

### `POST /investigations/:id/ingest/apify-twitter`

Requires capability token. Requires `status: active`.

Upload an Apify Twitter export. Always archives raw JSON and runs the full
extractor pipeline (container when `VPC_INGEST` is configured, inline otherwise).

**Content types**

- `application/json` — array of items, or `{ "items": [...] }` / `{ "data": [...] }`
- `multipart/form-data` — one or more `file` fields containing JSON

**Response `202`** — job delegated to ingest container (`delegatedToContainer: true`).  
**Response `200`** — inline pipeline completed.

Response includes `jobId` for status polling.

### `GET /investigations/:id/ingest-jobs/:job_id`

Requires capability token.

Poll ingest job status.

**Response `200`** — `{ job: { status, item_count, manifest_hashes, error_message, ... } }`

---

## Attribution

Requires `AI_GATEWAY_URL` and `ANTHROPIC_API_KEY` on the Worker.

### `POST /investigations/:id/attribute`

Requires capability token. Requires `status: active`.

Run attribution for all active seed pairs (or a filtered subset).

Requires Anthropic credentials via **server secrets** or **request BYOK**
(see below).

| Query / body | Description |
|--------------|-------------|
| `skipTriage=true` | Skip triage model |
| `accountFilter=a,b` | Restrict to listed accounts |
| `maxRetries` | Reasoning retry cap (default 3) |
| `randomizationSeed` | Reproducible signal-table shuffle (§7.4.1) |

**Bring-your-own-key (BYOK)** — for public deployments where the host
does not supply API keys:

| Source | Fields |
|--------|--------|
| Headers | `X-AI-Gateway-Url`, `X-Anthropic-Api-Key` |
| JSON body | `aiGatewayUrl` / `ai_gateway_url`, `anthropicApiKey` / `anthropic_api_key` |

Use `https://api.anthropic.com` as the gateway URL for direct Anthropic API
access, or a Cloudflare AI Gateway base URL ending in `/anthropic`.

Request credentials override server secrets when provided. Keys are used
only for the attribution call and are not persisted.

**Response `200`** — `{ investigationId, pair_count, credential_source, runs: [...] }` per-pair summaries.

### `GET /investigations/:id/runs`

Requires capability token.

List attribution runs (summary fields only).

Alias: `GET /investigations/:id/attribution-runs`

### `GET /investigations/:id/runs/:run_id`

Requires capability token.

Single attribution run with parsed `output` object (claims, alternatives,
declined pairs, triage, methodology metadata). Does not include raw
`output_json` string.

---

## Evidence packet (§8.1)

### `GET /investigations/:id/packet/:run_id`

Requires capability token.

Build an evidence packet for one attribution run.

| Query | Response |
|-------|----------|
| _(default)_ | JSON packet (`format_version`, `cover`, `narrative`, `signal_appendix`, `manifest_extract`, `methodology_metadata`, `markdown`, …) |
| `format=markdown` | `text/markdown` body |
| `format=pdf` | `application/pdf` (PDF/A-2b via `containers/pdf-worker/`; requires `PDF_WORKER_URL` on VPC) |

**Response `503`** for `format=pdf` when PDF container is not configured.

Markdown is the canonical signed source per §8.1.3; PDF is a derived view.

---

## Archive

### `GET /manifest`

List manifest entries.

| Query | Description |
|-------|-------------|
| `investigation` | Filter by investigation ID (**requires capability token** when set) |

### `GET /signatures`

List manifest signature records.

### `GET /verify`

Verify all manifest signatures.

---

## Debug

Development visibility endpoints; not part of the methodology deliverable.

### `GET /debug/ingest?investigation=:id`

Requires capability token.

Extractor visibility vs manifest entries for an investigation.

### `GET /debug/manifest?investigation=:id`

Requires capability token.

Raw manifest breakdown (with/without `account` field).

---

## VPC container endpoints

Not called directly in normal operation; invoked by the Worker over Workers VPC.

### Ingest container (`containers/ingest-worker/`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/trigger` | Run archive + extraction (`IngestJobHandoff`) |

Configured via `INGEST_WORKER_URL` (e.g. `http://json-ingest:8080/trigger`).

### PDF container (`containers/pdf-worker/`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/render` | HTML → PDF/A-2b (`PdfRenderHandoff`) |

Configured via `PDF_WORKER_URL` (e.g. `http://json-pdf:8081/render`) and
`VPC_PDF` binding (`common-thread-pdf`). Falls back to `VPC_INGEST` if
`VPC_PDF` is not configured. Auth: `PDF_SECRET` (required; separate from
`INGEST_SECRET`).

See `containers/ingest-worker/README.md` and `containers/pdf-worker/README.md`.

---

## Not implemented

| Route | Notes |
|-------|-------|
| `DELETE /investigations/:id` | No investigation or artifact purge API yet |
| Token recovery / rotation | Lost tokens cannot be reset; create a new investigation |
| Packet detached signing on export | Ed25519 signing exists for manifests; not wired to packet route |

---

## Secrets and bindings

| Name | Purpose |
|------|---------|
| `DB` | Hyperdrive → MySQL |
| `ARCHIVE` | R2 archive bucket |
| `VPC_INGEST` | Workers VPC → ingest container (`json-ingest`) |
| `VPC_PDF` | Workers VPC → PDF container (`json-pdf`) |
| `AI_GATEWAY_URL` | Attribution (secret; optional if users BYOK) |
| `ANTHROPIC_API_KEY` | Attribution (secret; optional if users BYOK) |
| `INGEST_SECRET` | Container auth (secret) |
| `PDF_SECRET` | PDF container auth (secret; required for `?format=pdf`) |
| `SIGNER_PUBLIC_KEY` | Manifest verification |

Vars: `INGEST_WORKER_URL`, `PDF_WORKER_URL`, `TRIAGE_MODEL`, `REASONING_MODEL`,
`CORS_ALLOWED_ORIGINS`.

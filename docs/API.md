# HTTP API reference

Backend Worker routes implemented in `implementation/workers/index.ts`. All
JSON responses use `Content-Type: application/json` unless noted.

Base URL examples:

- Local: `http://localhost:8787`
- Deployed: `https://<your-worker>.workers.dev`

## Typical workflow

```text
POST /investigations
  → POST /investigations/:id/seeds          (optional; ingest also registers seeds)
  → POST /investigations/:id/ingest/apify-twitter
  → GET  /investigations/:id/ingest-jobs/:job_id   (poll until completed)
  → GET  /investigations/:id/features       (verify extractors ran)
  → POST /investigations/:id/attribute      (requires AI_GATEWAY_URL + ANTHROPIC_API_KEY)
  → GET  /investigations/:id/runs
  → GET  /investigations/:id/packet/:run_id?format=pdf
```

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
  "environment": "development",
  "status": "ok"
}
```

---

## Investigations

### `GET /investigations`

List investigations (latest 100).

### `POST /investigations`

Create an investigation.

**Body**

```json
{
  "id": "my-investigation-1",
  "name": "Investigation title",
  "description": "Optional description"
}
```

**Response `201`** — investigation row.

### `GET /investigations/:id/summary`

Active seed count and manifest artifact count for the investigation.

---

## Seed accounts

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

Upload an Apify Twitter export. Always archives raw JSON and runs the full
extractor pipeline (container when `VPC_INGEST` is configured, inline otherwise).

**Content types**

- `application/json` — array of items, or `{ "items": [...] }` / `{ "data": [...] }`
- `multipart/form-data` — one or more `file` fields containing JSON

**Response `202`** — job delegated to ingest container (`delegatedToContainer: true`).  
**Response `200`** — inline pipeline completed.

Response includes `jobId` for status polling.

### `GET /investigations/:id/ingest-jobs/:job_id`

Poll ingest job status.

**Response `200`** — `{ job: { status, item_count, manifest_hashes, error_message, ... } }`

---

## Attribution

Requires `AI_GATEWAY_URL` and `ANTHROPIC_API_KEY` on the Worker.

### `POST /investigations/:id/attribute`

Run attribution for all active seed pairs (or a filtered subset).

| Query / body | Description |
|--------------|-------------|
| `skipTriage=true` | Skip triage model |
| `accountFilter=a,b` | Restrict to listed accounts |
| `maxRetries` | Reasoning retry cap (default 3) |
| `randomizationSeed` | Reproducible signal-table shuffle (§7.4.1) |

**Response `200`** — `{ investigationId, pair_count, runs: [...] }` per-pair summaries.

### `GET /investigations/:id/runs`

List attribution runs (summary fields only).

Alias: `GET /investigations/:id/attribution-runs`

### `GET /investigations/:id/runs/:run_id`

Single attribution run with parsed `output` object (claims, alternatives,
declined pairs, triage, methodology metadata). Does not include raw
`output_json` string.

---

## Evidence packet (§8.1)

### `GET /investigations/:id/packet/:run_id`

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
| `investigation` | Filter by investigation ID |

### `GET /signatures`

List manifest signature records.

### `GET /verify`

Verify all manifest signatures.

---

## Debug

Development visibility endpoints; not part of the methodology deliverable.

### `GET /debug/ingest?investigation=:id`

Extractor visibility vs manifest entries for an investigation.

### `GET /debug/manifest?investigation=:id`

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
| `GET /investigations/:id` | Single-investigation fetch not exposed (use list + summary) |
| Packet detached signing on export | Ed25519 signing exists for manifests; not wired to packet route |

---

## Secrets and bindings

| Name | Purpose |
|------|---------|
| `DB` | Hyperdrive → MySQL |
| `ARCHIVE` | R2 archive bucket |
| `VPC_INGEST` | Workers VPC → ingest container (`json-ingest`) |
| `VPC_PDF` | Workers VPC → PDF container (`json-pdf`) |
| `AI_GATEWAY_URL` | Attribution (secret) |
| `ANTHROPIC_API_KEY` | Attribution (secret) |
| `INGEST_SECRET` | Container auth (secret) |
| `PDF_SECRET` | PDF container auth (secret; required for `?format=pdf`) |
| `SIGNER_PUBLIC_KEY` | Manifest verification |

Vars: `INGEST_WORKER_URL`, `PDF_WORKER_URL`, `TRIAGE_MODEL`, `REASONING_MODEL`.

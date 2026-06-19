# Common Thread — self-hosted extraction container

Always-on Docker service that runs the **archive + extraction pipeline** off the
Cloudflare Worker. The Worker archives the raw Apify export once, inserts an
`ingest_jobs` row, and POSTs to this container over **Workers VPC HTTP**.

## Endpoints

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/health` | `200` |
| `POST` | `/trigger` | `202` (process async) |

## `POST /trigger`

Body: `implementation/ingest/handoff.ts` (`IngestJobHandoff`).

```json
{
  "jobId": "job_…",
  "investigationId": "inv-…",
  "provider": "twitter",
  "rawFileHash": "sha256…",
  "itemCount": 1200,
  "accounts": ["handle1", "handle2"]
}
```

Header: `Authorization: Bearer $INGEST_SECRET` (must match Worker `INGEST_SECRET`).

## What the container does

1. Claims the `ingest_jobs` row (`status=running`)
2. Fetches the raw export from R2 by content hash
3. Archives per-account timelines, profiles, image corpora, network lists
4. Registers seed accounts in MySQL
5. Runs the full extractor pipeline
6. Marks the job `completed` or `failed`

Ingest always runs extractors. The Worker `POST …/ingest/apify-twitter` route no
longer accepts a `runExtractors` flag.

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `MYSQL_URL` | yes | `mysql://user:pass@host:3306/common_thread` |
| `R2_ACCOUNT_ID` | yes | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | yes | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | yes | R2 API token secret |
| `R2_BUCKET_NAME` | yes | Archive bucket (e.g. `common-thread-archive`) |
| `INGEST_SECRET` | yes | Bearer token shared with Worker |
| `PORT` | no | Listen port (default `8080`) |
| `CONTAINER_NAME` | no | Recorded on `ingest_jobs.container_name` |

## Worker side (`wrangler.toml`)

```toml
[[vpc_services]]
binding = "VPC_INGEST"
service_id = "<your-vpc-service-id>"
remote = true

[vars]
INGEST_WORKER_URL = "http://json-ingest:8080/trigger"
```

```bash
wrangler secret put INGEST_SECRET
```

Public API: `POST /investigations/:id/ingest/apify-twitter` — requires the
investigation capability token (see `docs/API.md`).

## Build and run

```bash
# From repository root
docker build -f containers/ingest-worker/Dockerfile -t common-thread-ingest .

docker run -d --restart=always \
  -e MYSQL_URL='mysql://user:pass@mysql:3306/common_thread' \
  -e R2_ACCOUNT_ID=... \
  -e R2_ACCESS_KEY_ID=... \
  -e R2_SECRET_ACCESS_KEY=... \
  -e R2_BUCKET_NAME=common-thread-archive \
  -e INGEST_SECRET=... \
  -p 8080:8080 \
  common-thread-ingest
```

Route the container through **cloudflared** on your private network so the
Worker's `VPC_INGEST` binding can reach it.

## Local dev without VPC

The Worker runs the same pipeline inline (no container):

```bash
curl -X POST 'http://localhost:8787/investigations/INV/ingest/apify-twitter' \
  -H 'Content-Type: application/json' \
  --data-binary @export.json
```

Poll completion via `GET /investigations/INV/ingest-jobs/:job_id` (requires
investigation capability token) when using
VPC; inline ingest returns `200` when finished.

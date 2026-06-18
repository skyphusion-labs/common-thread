# Common Thread — ingest worker

HTTP target for `VPC_INGEST.fetch(INGEST_WORKER_URL)` from the Cloudflare Worker.

## Endpoints

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/health` | `200` |
| `POST` | `/trigger` | `202` (process async) |

## `POST /trigger`

Body: `implementation/ingest/handoff.ts` (`IngestJobHandoff`).

Header: `Authorization: Bearer $INGEST_SECRET` (must match Worker `INGEST_SECRET`).

## Environment

| Variable | Purpose |
|----------|---------|
| `PORT` | Listen port (default `8080`) |
| `INGEST_SECRET` | Bearer token |
| `INGEST_DATA_DIR` | Local staging root (default `/data/ingest`) |

## Worker side (wrangler.toml)

Use your existing VPC binding and private hostname from IaC:

```toml
[[vpc_services]]
binding = "VPC_INGEST"
service_id = "<json_ingest-service-id>"
remote = true

[vars]
INGEST_WORKER_URL = "http://json_ingest/trigger"
```

```bash
wrangler secret put INGEST_SECRET
```

## Run

```bash
docker build -t common-thread-ingest .
docker run -d --restart=always \
  -e INGEST_SECRET=... \
  -v ingest-data:/data/ingest \
  common-thread-ingest
```

`processJob()` in `server.mjs` is still a stub — implement R2 fetch, local staging, bulk upload, MySQL, extractors.

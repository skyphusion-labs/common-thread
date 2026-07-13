# Common Thread — PDF/A evidence-packet renderer

Always-on Docker service that converts evidence-packet HTML to **PDF/A-2b**
off the Cloudflare Worker. The Worker builds Markdown (canonical per §8.1),
converts to HTML, and POSTs to this container over **Workers VPC HTTP**.

## Endpoints

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/health` | `200` |
| `POST` | `/render` | `200` (`application/pdf`) |

## `POST /render`

Body: `implementation/reporting/pdf-handoff.ts` (`PdfRenderHandoff`).

```json
{
  "investigationId": "inv-…",
  "attributionRunId": 42,
  "html": "<!DOCTYPE html>…",
  "pdfaProfile": "2b"
}
```

Header: `Authorization: Bearer $PDF_SECRET` (must match Worker `PDF_SECRET`).

Pipeline: **wkhtmltopdf** (HTML → PDF) → **Ghostscript** (PDF/A-2b).

CI validates a sample render with veraPDF; see [docs/PDF-A.md](../../docs/PDF-A.md).

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `PDF_SECRET` | yes | Bearer token shared with Worker |
| `PORT` | no | Listen port (default `8081`) |
| `CONTAINER_NAME` | no | Log label |

## Worker side (`wrangler.toml`)

Uses the dedicated `VPC_PDF` binding (`common-thread-pdf`, hostname `json-pdf`):

```toml
[[vpc_services]]
binding = "VPC_PDF"
service_id = "019edbe8-4782-7873-89c0-a7489e4f96af"
remote = true

[vars]
PDF_WORKER_URL = "http://json-pdf:8081/render"
```

```bash
wrangler secret put PDF_SECRET
```

Worker usage:

```bash
curl -o packet.pdf \
  'https://YOUR-WORKER/investigations/INV/packet/42?format=pdf'
```

## Docker Compose fleet

With the root `docker-compose.yml` (same network as ingest):

```yaml
json-pdf:
  image: ghcr.io/skyphusion-labs/common-thread-pdf:0.1.0
  hostname: json-pdf
  environment:
    PDF_SECRET: ${PDF_SECRET}
```

Ensure `cloudflared/config.yml` routes hostname `json-pdf` → `http://json-pdf:8081`.

## Build and run (standalone)

```bash
docker build -f containers/pdf-worker/Dockerfile -t common-thread-pdf .

docker run -d --restart=always \
  -e PDF_SECRET=... \
  -e CONTAINER_NAME=json-pdf \
  -p 8081:8081 \
  common-thread-pdf
```

Route `json-pdf` on your private network (same cloudflared tunnel as ingest).

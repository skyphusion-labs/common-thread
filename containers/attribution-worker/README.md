# Common Thread -- self-hosted attribution executor container

Always-on Docker service that runs the **reasoner attribution pipeline**
(`runAttribution`) off the Cloudflare Worker. The Worker inserts an
`attribution_jobs` row and POSTs to this container over **Workers VPC HTTP**;
the container claims the job, runs attribution against MySQL + R2 using its own
server-side credentials, and records the terminal status (#69).

Async attribution is **server-credentials only** (Conrad, 2026-07-11). BYOK
requests stay synchronous inline in the Worker and never reach this container;
the handoff carries no credential, so a user-supplied key is never persisted or
forwarded.

## Endpoints

| Method | Path | Response |
|--------|------|----------|
| `GET` | `/health` | `200` |
| `POST` | `/trigger` | `202` (process async) |

## `POST /trigger`

Body: `implementation/attribution/handoff.ts` (`AttributionJobHandoff`).

```json
{
  "jobId": "attrjob_…",
  "investigationId": "inv-…",
  "options": {
    "accountFilter": ["handle1", "handle2"],
    "skipTriage": false,
    "maxRetries": 3,
    "randomizationSeed": "optional-seed"
  }
}
```

Header: `Authorization: Bearer $ATTRIBUTION_SECRET` (must match Worker
`ATTRIBUTION_SECRET`).

## What the container does

1. Claims the `attribution_jobs` row (`status=running`)
2. Runs `runAttribution` for the investigation (one triage + up to three
   reasoning calls per ordered account pair)
3. Writes one `attribution_runs` row per pair as it goes (partial work is
   preserved on failure; per-pair transport failures are isolated per #96/#88)
4. Marks the job `completed` (with `pair_count`) or `failed` (with
   `error_message`)

## Environment

| Variable | Required | Purpose |
|----------|----------|---------|
| `MYSQL_URL` | yes | `mysql://user:pass@host:3306/common_thread` |
| `R2_ACCOUNT_ID` | yes | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | yes | R2 API token access key |
| `R2_SECRET_ACCESS_KEY` | yes | R2 API token secret |
| `R2_BUCKET_NAME` | yes | Archive bucket (e.g. `common-thread-archive`) |
| `AI_GATEWAY_URL` | yes | Cloudflare AI Gateway base URL ending in `/anthropic` |
| `ANTHROPIC_API_KEY` | yes | Anthropic API key (server credential) |
| `ATTRIBUTION_SECRET` | yes | Bearer token shared with Worker |
| `TRIAGE_MODEL` | no | Triage model (default `claude-haiku-4-5`) |
| `REASONING_MODEL` | no | Reasoning model (default `claude-opus-4-8`) |
| `PORT` | no | Listen port (default `8082`) |
| `CONTAINER_NAME` | no | Recorded on `attribution_jobs.container_name` |

## Worker side (`wrangler.toml`)

```toml
[[vpc_services]]
binding = "VPC_ATTRIBUTION"
service_id = "<your-vpc-service-id>"
remote = true

[vars]
ATTRIBUTION_WORKER_URL = "http://json-attribution:8082/trigger"
```

```bash
wrangler secret put ATTRIBUTION_SECRET
```

Public API: `POST /investigations/:id/attribute` returns `202` + a `jobId` when
the executor is bound and the run uses server credentials; poll
`GET /investigations/:id/attribution-jobs/:job_id` (investigation capability
token) for status. BYOK or no-executor requests return `200` synchronously.

## Build and run

```bash
# From repository root
docker build -f containers/attribution-worker/Dockerfile -t common-thread-attribution .

docker run -d --restart=always \
  -e MYSQL_URL='mysql://user:pass@mysql:3306/common_thread' \
  -e R2_ACCOUNT_ID=... \
  -e R2_ACCESS_KEY_ID=... \
  -e R2_SECRET_ACCESS_KEY=... \
  -e R2_BUCKET_NAME=common-thread-archive \
  -e AI_GATEWAY_URL='https://gateway.ai.cloudflare.com/v1/<acct>/<gw>/anthropic' \
  -e ANTHROPIC_API_KEY=... \
  -e ATTRIBUTION_SECRET=... \
  -p 8082:8082 \
  common-thread-attribution
```

Route the container through **cloudflared** on your private network so the
Worker's `VPC_ATTRIBUTION` binding can reach it.

## Local dev without VPC

The Worker runs attribution inline (no container) whenever the executor is not
bound, returning `200` synchronously. BYOK requests always run inline too.

# Deployment guide

Deploy the **backend Worker** (API, extractors, reasoner) and **web Worker**
(browser UI). Each has its own `wrangler.toml`.

## Prerequisites

- Node.js 18+
- Cloudflare account (Workers, R2, Hyperdrive)
- MySQL 8+ database
- `wrangler login`

```bash
git clone https://github.com/skyphusion-labs/common-thread
cd common-thread
npm install
```

## 1. Configuration files

```bash
cp wrangler.toml.example wrangler.toml
cp web/wrangler.toml.example web/wrangler.toml
```

`wrangler.toml` and `web/wrangler.toml` are gitignored. Never commit real
resource IDs or secrets.

## 2. Create Cloudflare resources

**Development**

```bash
MYSQL_URL='mysql://USER:PASS@HOST:3306/common_thread' npm run db:migrate
npm run r2:create
npm run db:hyperdrive:create -- 'mysql://USER:PASS@HOST:3306/common_thread'
```

Paste the printed Hyperdrive `id` into `wrangler.toml` under `[[hyperdrive]]`
`binding = "DB"`. Confirm R2 `bucket_name` is `common-thread-archive` under
`binding = "ARCHIVE"`.

**Production**

```bash
# Apply mysql-schema.sql to production MySQL, then:
npm run r2:create:prod
# Create a separate Hyperdrive config; paste id under [env.production.hyperdrive]
```

> **Workers VPC origin: disable TLS cert verification on the MySQL service.** If the
> production MySQL backend is reached through a Workers VPC service (Type TCP, e.g. host
> `mysql`, port 3306) that Hyperdrive points at, that VPC service's TLS
> certificate-verification mode **must be DISABLED**. Workers VPC defaults to FULL
> verification, which rejects the MySQL container's certificate and breaks the
> Hyperdrive -> MySQL path **silently** (it surfaces only as connection errors at query
> time). Disable verification explicitly on the TCP/MySQL VPC service when you (re)create
> it. The toggle lives on the VPC service, not in the `mysql2` client (`implementation/db.ts`
> sets no `ssl` option). See docs/SETUP.md section 2.

## 3. Binding reference

### Backend (`wrangler.toml`)

| Binding | Type | Required | Purpose |
|---------|------|----------|---------|
| `DB` | Hyperdrive | Yes | MySQL (investigations, features, runs) |
| `ARCHIVE` | R2 | Yes | Content-addressed artifact store |
| `VPC_INGEST` | Workers VPC | No* | Remote ingest container |
| `VPC_PDF` | Workers VPC | No* | PDF/A evidence packets |

\*Required for production-scale Apify ingest and `?format=pdf` packet export.
Without VPC, local/small ingest runs inline in the Worker.

**Vars:** `ENVIRONMENT`, `TRIAGE_MODEL`, `REASONING_MODEL`,
`INGEST_WORKER_URL`, `PDF_WORKER_URL` (when VPC is enabled),
`CORS_ALLOWED_ORIGINS` (comma-separated browser origins; empty blocks direct
browser API use).

**Secrets (backend):**

| Secret | When |
|--------|------|
| `SIGNER_PUBLIC_KEY` | Manifest signing (recommended) |
| `SIGNER_PRIVATE_KEY` | In-Worker evidence-packet signing (optional, §8.1.3); unset = packets unsigned |
| `AI_GATEWAY_URL` | Server-side attribution (optional if users BYOK) |
| `ANTHROPIC_API_KEY` | Server-side attribution (optional if users BYOK) |
| `INGEST_SECRET` | VPC ingest container (required with `VPC_INGEST`) |
| `PDF_SECRET` | VPC PDF container (required for `?format=pdf`) |

```bash
wrangler secret put SIGNER_PUBLIC_KEY
# Optional: enable in-Worker packet signing (else packets export unsigned):
# wrangler secret put SIGNER_PRIVATE_KEY --env production
wrangler secret put INGEST_SECRET --env production
wrangler secret put PDF_SECRET --env production
# Optional if not using web BYOK:
wrangler secret put AI_GATEWAY_URL --env production
wrangler secret put ANTHROPIC_API_KEY --env production
```

### Web (`web/wrangler.toml`)

| Binding | Type | Required | Purpose |
|---------|------|----------|---------|
| `BACKEND` | Service | Yes* | Routes `/api/proxy/*` to backend Worker |

\*Or set `DEFAULT_BACKEND_URL` in `[vars]` for local dev without bindings.

Service `name` must match the deployed backend Worker:

| Environment | Backend Worker | Web Worker | `BACKEND` service | Public URLs |
|-------------|----------------|------------|-------------------|-------------|
| Default / local | `common-thread` | `common-thread-web` | `common-thread` | `workers.dev` or local |
| Dev | `common-thread-dev` | `common-thread-web-dev` | `common-thread-dev` | `workers.dev` |
| Production | `common-thread-prod` | `common-thread-web-prod` | `common-thread-prod` | API: https://common-thread-backend.skyphusion.org · UI: https://common-thread.skyphusion.org |

## 4. Deploy

**Backend**

```bash
npm run deploy:backend:dev    # → common-thread-dev
npm run deploy:backend:prod   # → common-thread-prod
```

**Web** (deploy backend first)

```bash
npm run deploy:web:dev
npm run deploy:web:prod
```

**Both**

```bash
npm run deploy:all:dev
npm run deploy:all:prod
```

`scripts/deploy-web.js` patches the `BACKEND` service name from root
`wrangler.toml` when using `deploy:web:*`.

## 5. Custom domains (production)

Production uses two custom domains on the `skyphusion.org` zone (same
Cloudflare account as the Workers):

| Hostname | Worker | Purpose |
|----------|--------|---------|
| `common-thread-backend.skyphusion.org` | Backend (`common-thread-prod`) | Hosted HTTP API (contact **common-thread@skyphusion.org** before third-party use; see [API.md](API.md#using-the-hosted-api)) |
| `common-thread.skyphusion.org` | Web (`common-thread-web-prod`) | Browser UI |

**Backend API**:  configured in root `wrangler.toml` under `[env.production]`:

```toml
[[env.production.routes]]
pattern = "common-thread-backend.skyphusion.org"
custom_domain = true

# Optional: disable the *.workers.dev URL when using a custom domain
# workers_dev = false
```

Deploy with `npm run deploy:backend:prod`. The first deploy creates the custom
domain and SSL certificate.

**Web UI**:  configured in `web/wrangler.toml` under `[env.production]`:

```toml
[[env.production.routes]]
pattern = "common-thread.skyphusion.org"
custom_domain = true

# Optional: disable the *.workers.dev URL when using a custom domain
# workers_dev = false
```

Deploy with `npm run deploy:web:prod`.

The web UI still routes API calls through the **`BACKEND` service binding**
(not the public API hostname). That keeps browser traffic on the internal
Worker-to-Worker path and does not depend on the backend custom domain. API clients approved by the operator should use
`https://common-thread-backend.skyphusion.org` (see
[API.md](API.md#using-the-hosted-api)). The `GET /` health response includes
`hosted_api_notice` and `contact` (`common-thread@skyphusion.org`) in production.

The example `wrangler.toml.example` files leave `workers.dev` enabled so a
first deploy works without a custom domain. For production on custom domains,
set `workers_dev = false` under `[env.production]` in your local (gitignored)
`wrangler.toml` and `web/wrangler.toml` to disable the `*.workers.dev` URLs.

## 6. Workers VPC (optional)

For large Apify exports and PDF evidence packets:

1. Deploy `containers/ingest-worker/` and `containers/pdf-worker/` on your VPC fleet.
2. Uncomment `[[vpc_services]]` blocks in `wrangler.toml` and set `service_id`.
3. Set `INGEST_WORKER_URL` and `PDF_WORKER_URL` in `[vars]`.
4. Set `INGEST_SECRET` and `PDF_SECRET` (required for container auth).

See `containers/ingest-worker/README.md` and `containers/pdf-worker/README.md`.

## 7. Post-deploy checklist

- [ ] `GET /` on backend returns `"status": "ok"` at https://common-thread-backend.skyphusion.org (production also returns `contact`: `common-thread@skyphusion.org`)
- [ ] Web UI loads at https://common-thread.skyphusion.org
- [ ] (Optional) Neither production Worker is reachable at `*.workers.dev` if you set `workers_dev = false`
- [ ] Create investigation → save `access_token` → reopen with token or share link
- [ ] Upload Apify JSON → ingest completes (requires token on API calls)
- [ ] Attribution works with BYOK keys in web Setup tab
- [ ] Seal investigation → ingest/attribute disabled; results still readable
- [ ] Evidence packet: JSON and Markdown download from Results tab
- [ ] PDF download works if `VPC_PDF` + `PDF_SECRET` are configured
- [ ] VPC ingest delegation works if `VPC_INGEST` + `INGEST_SECRET` are configured

## 8. Local development

```bash
# Terminal 1
npm run dev                    # backend :8787

# Terminal 2
npm run dev:web                # web UI (uses BACKEND binding or DEFAULT_BACKEND_URL)
```

In `web/wrangler.toml`, uncomment for pure local HTTP without service binding:

```toml
[vars]
DEFAULT_BACKEND_URL = "http://127.0.0.1:8787"
```

## 9. Troubleshooting

**Custom domain not resolving**

- Confirm `skyphusion.org` is on the same Cloudflare account as the Worker.
- Redeploy backend: `npm run deploy:backend:prod`; web: `npm run deploy:web:prod`.
- In the dashboard: Workers → `common-thread-prod` or `common-thread-web-prod` → Settings → Domains & Routes.

**Service binding not working**

- Deploy backend before web.
- `service = "..."` in `web/wrangler.toml` must exactly match backend `name`.
- Redeploy web after changing bindings.

**Attribution 503**

- Web BYOK: set AI Gateway URL + Anthropic key in Setup tab.
- API: pass `X-AI-Gateway-Url` and `X-Anthropic-Api-Key`, or set server secrets.

**PDF 503**

- Backend needs `VPC_PDF`, `PDF_WORKER_URL`, and `PDF_SECRET`. PDF is rendered
  on the VPC container, not in the browser.

**Hyperdrive local dev**

- Set `localConnectionString` on `[[hyperdrive]]` or export
  `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB`.

## Commands reference

```bash
npm run deploy:backend:dev
npm run deploy:backend:prod
npm run deploy:web:dev
npm run deploy:web:prod
npm run deploy:all:dev
npm run deploy:all:prod
npm run dev
npm run dev:web
MYSQL_URL='mysql://...' npm run db:migrate
npm run db:hyperdrive:create -- 'mysql://...'
npm run r2:create
npm run r2:create:prod
```

For HTTP routes see [API.md](API.md). For first-time setup see [SETUP.md](SETUP.md).

## Operator instance (Access-gated, keyless server-side attribution)

The PUBLIC hosted Worker (`common-thread-prod`) runs `PUBLIC_BYOK_ONLY = "1"`
with its server AI secrets stripped, so visitors must bring their own key
(#187). The **operator instance** is a separate, Cloudflare Access-gated
deployment that lets the account owner run server-side attribution on a FUNDED
Cloudflare AI Gateway (keyless Unified Billing; bills CF credits) without
re-opening credential-riding on the public box.

```
common-thread-ops.skyphusion.org   OPS web (env.operator), behind CF Access (owner only)
   -> [BACKEND service binding] -> common-thread-ops-backend (env.operator)
                                    PUBLIC_BYOK_ONLY unset; AI_GATEWAY_URL + CF_AIG_TOKEN
                                    NO public route -- reachable only via the binding
```

- Config only, no app code: `[env.operator]` in `wrangler.toml` and
  `web/wrangler.toml` (see the `.example` files). The existing UI works as-is;
  with `PUBLIC_BYOK_ONLY` unset the BYOK gate is dormant and the backend
  resolves the keyless server path (`source: "environment"`,
  `implementation/reasoner/credentials.ts`, #111).
- Deploy is **manual and gated**: run the `deploy` workflow via
  `workflow_dispatch` with `deploy_operator = true` (a push to main NEVER
  deploys the operator env). Backend deploys before web (service-binding order).
- Full deploy + Cloudflare Access + secrets runbook (aviation-grade,
  reproducible-from-docs) lives in fleet-chezmoi:
  **`system/common-thread/RUNBOOK-ops-instance.md`**, with the Access IaC at
  `system/cloudflare/access/apply-common-thread-ops-access.sh`.

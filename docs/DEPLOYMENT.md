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
`INGEST_WORKER_URL`, `PDF_WORKER_URL` (when VPC is enabled).

**Secrets (backend):**

| Secret | When |
|--------|------|
| `SIGNER_PUBLIC_KEY` | Manifest signing (recommended) |
| `AI_GATEWAY_URL` | Server-side attribution (optional if users BYOK) |
| `ANTHROPIC_API_KEY` | Server-side attribution (optional if users BYOK) |
| `INGEST_SECRET` | VPC ingest container |
| `PDF_SECRET` | VPC PDF container |

```bash
wrangler secret put SIGNER_PUBLIC_KEY
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

| Environment | Backend Worker | Web Worker | `BACKEND` service | Public URL |
|-------------|----------------|------------|-------------------|------------|
| Default / local | `common-thread` | `common-thread-web` | `common-thread` | `workers.dev` or local |
| Dev | `common-thread-dev` | `common-thread-web-dev` | `common-thread-dev` | `workers.dev` |
| Production | `common-thread-prod` | `common-thread-web-prod` | `common-thread-prod` | https://common-thread.skyphusion.org |

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

## 5. Custom domain (production web UI)

Production web deploys to **https://common-thread.skyphusion.org** (not
`workers.dev`). Configured in `web/wrangler.toml` under `[env.production]`:

```toml
workers_dev = false

[[env.production.routes]]
pattern = "common-thread.skyphusion.org"
custom_domain = true
```

Requirements:

- `skyphusion.org` zone on the same Cloudflare account as the Worker
- First `npm run deploy:web:prod` creates the custom domain and SSL certificate
- `workers_dev = false` disables the `*.workers.dev` URL for production

The backend API stays on the `BACKEND` service binding (not public). Users
only need the custom domain for the browser UI.

## 6. Workers VPC (optional)

For large Apify exports and PDF evidence packets:

1. Deploy `containers/ingest-worker/` and `containers/pdf-worker/` on your VPC fleet.
2. Uncomment `[[vpc_services]]` blocks in `wrangler.toml` and set `service_id`.
3. Set `INGEST_WORKER_URL` and `PDF_WORKER_URL` in `[vars]`.
4. Set `INGEST_SECRET` and `PDF_SECRET`.

See `containers/ingest-worker/README.md` and `containers/pdf-worker/README.md`.

## 7. Post-deploy checklist

- [ ] `GET /` on backend returns `"status": "ok"`
- [ ] Web UI loads at https://common-thread.skyphusion.org
- [ ] Create investigation → save `access_token` → reopen with token or share link
- [ ] Upload Apify JSON → ingest completes (requires token on API calls)
- [ ] Attribution works with BYOK keys in web Setup tab
- [ ] Seal investigation → ingest/attribute disabled; results still readable
- [ ] Evidence packet: JSON and Markdown download from Results tab
- [ ] PDF download works if `VPC_PDF` + `PDF_SECRET` are configured

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
- Redeploy: `npm run deploy:web:prod`.
- In the dashboard: Workers → `common-thread-web-prod` → Settings → Domains & Routes.

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

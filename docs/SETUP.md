# Common Thread setup

First-time setup for the Common Thread reference implementation. Skip
ahead if you've already done a step.

- **HTTP API:** [API.md](API.md)
- **Deployment:** [DEPLOYMENT.md](DEPLOYMENT.md)
- **Web UI + BYOK:** [README.md](../README.md#web-frontend)

## Prerequisites

- Node.js 18 or later
- A Cloudflare account with Workers, R2, and Hyperdrive enabled
- A MySQL 8+ instance (local Docker, managed Cloud SQL, PlanetScale, etc.)
- Wrangler authenticated to your account (`wrangler login`)

## A note on shells

This guide shows commands for bash (macOS, Linux, WSL). Windows users
have three working options:

1. **WSL** (recommended for Windows users). Run all commands from a WSL
   shell. `localhost:8787` from WSL reaches the Worker running on
   Windows via WSL2's auto-forwarding, so even if Wrangler runs on
   Windows you can curl from WSL.
2. **PowerShell**. Native to Windows. The big gotcha is that PowerShell
   aliases `curl` to `Invoke-WebRequest`, which has different semantics.
   Either use `curl.exe` explicitly or use `Invoke-RestMethod` (cleaner
   for JSON). Where the bash commands below need a Windows alternative,
   PowerShell is shown.
3. **cmd.exe**. Works but quote-escaping JSON bodies is painful. Where
   it differs from PowerShell, a cmd version is shown too.

For commands without a Windows alternative shown, the bash version
works on all three (this is the case for `npm`, `wrangler`, and simple
GET requests).

## 1. Install dependencies

```bash
git clone https://github.com/SkyPhusion/common-thread
cd common-thread
npm install
cp wrangler.toml.example wrangler.toml
cp web/wrangler.toml.example web/wrangler.toml
```

This installs Wrangler, TypeScript, and the Workers type definitions
as devDependencies.

## 2. Create MySQL database and Hyperdrive

Create a MySQL database (example using the mysql CLI):

```bash
mysql -h HOST -u USER -p -e "CREATE DATABASE IF NOT EXISTS common_thread CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
MYSQL_URL='mysql://USER:PASS@HOST:3306/common_thread' npm run db:migrate
```

Create a Hyperdrive configuration pointing at that database:

```bash
npm run db:hyperdrive:create -- 'mysql://USER:PASS@HOST:3306/common_thread'
```

Paste the printed Hyperdrive `id` into `wrangler.toml` under `[[hyperdrive]] binding = "DB"`.

For local `wrangler dev`, set `localConnectionString` on the Hyperdrive binding or export
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB`.

> **Production over Workers VPC: disable TLS cert verification on the MySQL service.**
> When the production MySQL backend is reached through a **Workers VPC** service (Type TCP,
> e.g. host `mysql`, port 3306) that Hyperdrive points at, that VPC service's TLS
> certificate-verification mode **must be DISABLED**. Workers VPC defaults to FULL
> verification, which rejects the MySQL container's certificate and breaks the
> Hyperdrive -> MySQL path **silently** (the failure surfaces only as connection errors at
> query time, not at deploy). Disable verification explicitly on the TCP/MySQL VPC service
> when you (re)create it. This is a property of the VPC service, not the `mysql2` client:
> `implementation/db.ts` sets no `ssl` option and must not -- the verification toggle lives
> on the VPC service config. Not required for the default direct-MySQL setup above (no VPC).

## 3. Create the R2 bucket

```bash
npm run r2:create
```

The bucket name in `wrangler.toml` is `common-thread-archive` by
default; adjust the script and the binding if you want a different
name.

## 4. Apply the schema

If you did not run `npm run db:migrate` in step 2:

```bash
MYSQL_URL='mysql://USER:PASS@HOST:3306/common_thread' npm run db:migrate
```

Verify tables exist:

```bash
mysql -h HOST -u USER -p common_thread -e "SHOW TABLES;"
mysql -h HOST -u USER -p common_thread -e "SELECT value FROM schema_metadata WHERE \`key\` = 'schema_version';"
```

Current schema version is **0008** (investigation capability tokens:
`investigations.access_token_hash`). Fresh installs via `mysql-schema.sql` or
`npm run db:migrate` on an empty database include this column.

**Upgrading an existing database:** apply incremental migrations in order:

```bash
mysql -h HOST -u USER -p common_thread < mysql-migrations/0008_investigation_access_token.sql
```

Investigations created before migration 0008 have no recoverable token and
cannot be accessed via the API. For dev databases, dropping and recreating is
often simpler (see [Common issues](#common-issues)).

## 5. Generate a signer keypair

```bash
npm run keygen
```

Output:

```
Common Thread keypair generated.

Public key  (publish this, add to .dev.vars as SIGNER_PUBLIC_KEY):
  <32 base64 chars>

Private key (store securely, never commit):
  <32 base64 chars>
```

Save the private key in your password manager or hardware token.

For **in-Worker evidence-packet signing** (§8.1.3), set the private key as the
`SIGNER_PRIVATE_KEY` secret (see step 10); the packet export route then attaches
a detached Ed25519 signature over the canonical Markdown. Leaving it unset
exports packets unsigned (you can sign the Markdown offline instead). Verify any
exported packet with `npm run verify:packet -- packet.json`.

## 6. Configure local secrets

Copy the template:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` and paste the public key from the previous step:

```
SIGNER_PUBLIC_KEY=<your public key>
INVESTIGATION_NAMESPACE=local-dev
```

`.dev.vars` is gitignored.

## 7. Run the Worker locally

```bash
npm run dev
```

Wrangler will start the Worker on `http://localhost:8787`. Verify the
bindings:

```bash
curl http://localhost:8787/
```

Expected response:

```json
{
  "name": "common-thread",
  "version": "0.1.0",
  "environment": "development",
  "status": "ok"
}
```

If the request fails, check Hyperdrive (`DB`), R2 (`ARCHIVE`), and MySQL connectivity.

## 8. Web frontend (optional)

```bash
cp web/wrangler.toml.example web/wrangler.toml
npm run dev:web
```

Open the web Worker URL (Wrangler prints it). In **Setup**:

1. Leave backend URL empty if the `BACKEND` service binding points at `npm run dev`.
2. Or set backend URL to `http://127.0.0.1:8787` and uncomment `DEFAULT_BACKEND_URL` in `web/wrangler.toml`.
3. Add **Anthropic API key** and **AI Gateway URL** (or `https://api.anthropic.com`) for attribution — see the "How to get API keys" section in the UI.

Attribution credentials stay in your browser (BYOK); they are not stored on the server.

## 9. Create your first investigation

**bash / WSL:**

```bash
curl -s -X POST http://localhost:8787/investigations \
  -H "Content-Type: application/json" \
  -d '{"id": "test-001", "name": "Test investigation", "description": "Verifying setup"}'
```

Save the `access_token` from the JSON response (shown only once). Then verify
access with the token:

```bash
# Replace ct_… with the token from the create response
export CT_TOKEN='ct_…'

curl -s http://localhost:8787/investigations/test-001/summary \
  -H "Authorization: Bearer $CT_TOKEN"
```

You should get seed and artifact counts. `GET /investigations` (listing) returns
`404` — investigations are not enumerable.

**PowerShell:**

```powershell
$created = Invoke-RestMethod -Method Post -Uri http://localhost:8787/investigations `
  -ContentType "application/json" `
  -Body '{"id": "test-001", "name": "Test investigation", "description": "Verifying setup"}'
$created.access_token

Invoke-RestMethod -Uri http://localhost:8787/investigations/test-001/summary `
  -Headers @{ Authorization = "Bearer $($created.access_token)" }
```

**Windows cmd.exe:**

```cmd
curl -X POST http://localhost:8787/investigations -H "Content-Type: application/json" -d "{\"id\": \"test-001\", \"name\": \"Test investigation\", \"description\": \"Verifying setup\"}"
```

Copy `access_token` from the response, then:

```cmd
curl http://localhost:8787/investigations/test-001/summary -H "Authorization: Bearer ct_…"
```

If the summary request succeeds, the full stack (Worker + MySQL + schema) is
working.

**Web UI:** Creating an investigation shows the token once with copy/share-link
buttons. The UI can save tokens in this browser's `localStorage`; see the
honest security note on the Investigation tab.

## 10. Production deployment

When you're ready to deploy:

```bash
# Apply the schema to your production MySQL database
MYSQL_URL='mysql://USER:PASS@HOST:3306/common_thread' npm run db:migrate

# Create a production Hyperdrive config and paste its id into
# wrangler.toml under [env.production.hyperdrive]

# Create the production R2 bucket
npm run r2:create:prod

# Set the public key as a Worker secret
# bash/WSL:
echo "<your public key>" | npx wrangler secret put SIGNER_PUBLIC_KEY --env production

# PowerShell:
# "<your public key>" | npx wrangler secret put SIGNER_PUBLIC_KEY --env production
# (Or run `npx wrangler secret put SIGNER_PUBLIC_KEY --env production`
#  and paste the key when prompted; works in all shells.)

# Deploy
npm run deploy:prod
```

For deployment, VPC containers, and secrets, see `docs/DEPLOYMENT.md`.

## Common issues

### `401` / `missing_token` / `invalid_token` on investigation routes

All `/investigations/:id` routes require the capability token returned at
creation. Pass `Authorization: Bearer ct_…` or `X-Investigation-Token: ct_…`.

If you upgraded an old database without migration **0008**, the
`access_token_hash` column may be missing — re-apply schema or run
`mysql-migrations/0008_investigation_access_token.sql`. Pre-migration
investigations have no recoverable token.

### "Database not found" or connection errors

Confirm MySQL is running and reachable from your machine. Re-apply the
schema with `MYSQL_URL=... npm run db:migrate`. For `wrangler dev`, set
`localConnectionString` on the Hyperdrive binding or export
`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB`.

### "Bucket not found"

Local development uses a simulated R2 bucket. You don't need to create
the bucket remotely until you deploy. If you want the local sandbox to
persist between `wrangler dev` sessions, leave `.wrangler/` in place.

### "Ed25519 not supported"

Check that your `compatibility_date` in `wrangler.toml` is recent enough
(2024-09-23 or later). Ed25519 was added to the Workers Web Crypto API
around that date.

### TypeScript errors about `crypto.subtle` Ed25519 types

Ensure `@cloudflare/workers-types` is up to date. Run:

```bash
npm install --save-dev @cloudflare/workers-types@latest
```

## What's next

You now have a working Worker with the full v1 HTTP API (see **`docs/API.md`**).

Typical next steps:

1. **Web UI or API** — create an investigation, **save the `access_token`**, upload Apify Twitter JSON.
2. **Ingest** — `POST /investigations/:id/ingest/apify-twitter` (requires token; VPC container in production).
3. **Attribution** — BYOK via web Setup tab, or set `AI_GATEWAY_URL` + `ANTHROPIC_API_KEY` secrets.
4. **Evidence packet** — Results tab or `GET /investigations/:id/packet/:run_id` (`?format=pdf` with VPC PDF).
5. **Seal** (optional) — `POST /investigations/:id/seal` when the investigation is complete (read-only thereafter).

See **`docs/API.md`** for investigation access headers and error codes.

For deployment, VPC containers, and secrets, see `docs/DEPLOYMENT.md`.

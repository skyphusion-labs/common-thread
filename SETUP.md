# Common Thread setup

First-time setup for the Common Thread reference implementation. Skip
ahead if you've already done a step.

## Prerequisites

- Node.js 18 or later
- A Cloudflare account with Workers, D1, and R2 enabled
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
```

This installs Wrangler, TypeScript, and the Workers type definitions
as devDependencies.

## 2. Create the D1 database

```bash
npm run db:create
```

Wrangler will create the database and print output that looks like:

```
✅ Successfully created DB 'common-thread' in region ENAM
Created your new D1 database.

[[d1_databases]]
binding = "DB"
database_name = "common-thread"
database_id = "01234567-89ab-cdef-0123-456789abcdef"
```

Copy the `database_id` value into `wrangler.toml`, replacing the
placeholder `REPLACE_AFTER_RUNNING_db:create`.

## 3. Create the R2 bucket

```bash
npm run r2:create
```

The bucket name in `wrangler.toml` is `common-thread-archive` by
default; adjust the script and the binding if you want a different
name.

## 4. Apply the schema

For local development:

```bash
npm run db:migrate:local
```

This applies `implementation/schema/migrations/0001_initial.sql` to
the local D1 sandbox that Wrangler uses for `wrangler dev`. The local
sandbox is independent from your remote D1 database.

To apply the schema to your remote D1 database:

```bash
npm run db:migrate
```

Verify the schema with:

```bash
wrangler d1 execute common-thread --local --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
```

You should see all the schema tables listed.

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
  "status": "ok",
  "bindings": {
    "db": true,
    "archive": true,
    "signerPublicKey": true
  }
}
```

If any binding shows as `false`, recheck the corresponding setup step.

## 8. Create your first investigation

**bash / WSL:**

```bash
curl -X POST http://localhost:8787/investigations \
  -H "Content-Type: application/json" \
  -d '{"id": "test-001", "name": "Test investigation", "description": "Verifying setup"}'
```

**PowerShell:**

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:8787/investigations `
  -ContentType "application/json" `
  -Body '{"id": "test-001", "name": "Test investigation", "description": "Verifying setup"}'
```

**Windows cmd.exe:**

```cmd
curl -X POST http://localhost:8787/investigations -H "Content-Type: application/json" -d "{\"id\": \"test-001\", \"name\": \"Test investigation\", \"description\": \"Verifying setup\"}"
```

Then list (works the same in all three shells):

```bash
curl http://localhost:8787/investigations
```

In PowerShell, use `curl.exe http://localhost:8787/investigations` to
avoid the `Invoke-WebRequest` alias, or `Invoke-RestMethod
http://localhost:8787/investigations` for the native cmdlet.

If you get back the investigation you just created, the full stack
(Worker + D1 + schema) is working.

## 9. Production deployment

When you're ready to deploy:

```bash
# Create the production database
npm run db:create:prod
# (copy the database_id into wrangler.toml under [env.production])

# Create the production R2 bucket
npm run r2:create:prod

# Apply the schema to production
npm run db:migrate:prod

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

## Common issues

### "Database not found"

Wrangler's local D1 sandbox is stored under `.wrangler/state/`. If you
deleted that directory, you need to re-run `npm run db:migrate:local`.

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

You now have a working Worker that can manage investigations, serve
manifest entries, and verify signatures. The next layers to build:

- **Feature extractors** (`implementation/extractors/`): deterministic
  modules that read artifacts from R2 and write feature rows to D1.
- **Attribution reasoning** (`implementation/reasoning/`): LLM-assisted
  module that reads features from D1 and produces attribution outputs.
- **HTTP API expansion**: routes for seed accounts, features, attribution
  runs, evidence packets.

See the methodology paper for the specification of each layer.

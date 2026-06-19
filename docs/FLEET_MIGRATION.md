# Fleet migration plan: the extraction stack

Status: PLAN (Strummer, infra). Nothing here is executed; this is the design for
moving Common Thread's self-hosted extraction stack (MySQL + `json-ingest` +
`json-pdf`, reached by the backend Worker over **Workers VPC**) off the
torn-down `lagwagon` box and onto the existing skyphusion build fleet, using the
fleet's compose-in-git + chezmoi/age conventions.

It also folds in the four security fixes filed as common-thread issues #28, #29,
#33 (and the weak-MySQL-default item), because the move is the right moment to
land them: the same `compose.yaml` and `.env` are being rewritten anyway.

## 0. What "the stack" is

From `docker-compose.yml` at the repo root, four services on one bridge network
(`common-thread-network`):

| Service | Image | Port (current) | Role |
|---------|-------|-----------------|------|
| `mysql` | `mysql:8.0` | `3306` published | features / runs / investigations store; schema seeded on first boot |
| `json-ingest` | `ghcr.io/skyphusion-labs/common-thread-ingest` | `8080` published | archive + extractor pipeline off the Worker (`POST /trigger`) |
| `json-pdf` | `ghcr.io/skyphusion-labs/common-thread-pdf` | `8081` published | PDF/A evidence-packet renderer (`POST /render`) |
| `tunnel` | `cloudflare/cloudflared` | none | connector so the backend Worker can reach the two services |

**Key architectural fact that shapes the whole plan:** the Cloudflare Worker
does NOT call these services over a public Access-gated hostname. It reaches them
through **Workers VPC** (`[[vpc_services]]` with a `service_id`, `remote = true`
in `wrangler.toml`; `env.VPC_INGEST.fetch("http://json-ingest:8080/trigger")` in
`implementation/ingest/dispatch.ts`). The `cloudflared` container is the **VPC
connector** that joins the stack's private network to the Worker's VPC; it
proxies to services by compose name (`http://json-ingest:8080`,
`http://json-pdf:8081`). It is NOT a public ingress.

Consequence: there is **no reason to publish any host port**, and **no public
hostname** for ingest/pdf. The Worker's only path in is the VPC connector. This
makes issue #29 (host-published ports) a pure removal, not a tradeoff.

## 1. Where it runs on the fleet

The build fleet (`fugazi` / `jello` / `damaged`, dedicated HEL1 boxes on vSwitch
VLAN 4000 + WARP mesh; `dischord` is the Jenkins controller + Docker director)
is sized for **ephemeral build agents**, not always-on application services.
This stack is always-on (MySQL with a persistent volume, two long-running HTTP
services). It should NOT live in the ephemeral-agent capacity pool, where a
build could contend with it and where "fresh container every time" is wrong for
a stateful DB.

Recommendation, in order of preference:

1. **`dischord` as the host, deployed as a compose-in-git stack** (matches the
   retired-Portainer model: services as code under
   `fleet-chezmoi/system/stacks/dischord/<stack>/`, deployed by the
   `system/stacks/Jenkinsfile` pipeline). dischord already runs the other
   always-on stacks (Jenkins, Authentik, ergo, monitoring, cloudflared) and
   already hosts a cloudflared connector with multiple external networks
   attached, so adding a VPC connector for this stack is the established pattern.
   The EX44 (20 vCPU / 62 GB) has headroom for a MySQL with a 1 GB buffer pool
   plus two Node services. **This is the recommended target.**

2. **A dedicated small always-on box** (a `towelie`-class OVH VPS) named in
   theme, if Conrad wants the extraction DB physically off the CI controller for
   blast-radius reasons. More isolation, another box to run. Defer unless the
   data-sensitivity of investigations argues for it.

Do NOT put it on `fugazi`/`jello`/`damaged`: those are pure build muscle with
ephemeral agents; an always-on stateful stack there fights the model.

This plan assumes target #1 (dischord) below; the stack layout is identical for
target #2, only the host and the VLAN-IP wiring change.

## 2. Stack layout (compose-in-git)

Create `fleet-chezmoi/system/stacks/dischord/common-thread/` mirroring
`system/stacks/_template/`:

```
system/stacks/dischord/common-thread/
  compose.yaml          # the migrated, hardened compose (below)
  .env.example          # shape only; real values age-encrypted in fleet-chezmoi
  mysql-schema.sql      # copied/symlinked from the common-thread repo, mounted read-only
```

Add `common-thread` to the `STACK` choice list in
`system/stacks/Jenkinsfile`. Real `.env` lives at
`/var/jenkins_home/stacks/common-thread/.env` on dischord (NOT in git), written
by chezmoi from the age-encrypted source (section 4). Deploy is the existing
`docker compose -f <stack>/compose.yaml --env-file <env> up -d` step.

The canonical `docker-compose.yml` in the common-thread repo stays as the
**developer / local-bring-up** reference (with the security fixes also applied
there, section 3); the fleet stack is the production deployment of the same
images.

## 3. The hardened compose (folds in #28, #29, #33, weak-MySQL-defaults)

### 3.1 No host-published ports (#29)

Docker publishes ports by writing iptables rules that **bypass UFW**, so the
current `ports: "3306:3306"` / `"8080:8080"` / `"8081:8081"` exposed MySQL and
both services on the box's public interface regardless of the firewall. Remove
**all** `ports:` blocks. Nothing outside the stack network needs a host port:

- the Worker reaches `json-ingest` / `json-pdf` through the **cloudflared VPC
  connector** on the shared compose network (by service name);
- MySQL is reached only by `json-ingest` (same network) and, when needed, by the
  Worker's Hyperdrive, which also rides the VPC connector, not a host port.

If a host-local debugging port is ever truly needed, bind it to loopback
explicitly (`127.0.0.1:3306:3306`), never the bare `3306:3306` form. Default:
no published ports at all.

### 3.2 Ingest auth must fail closed (#28)

`containers/ingest-worker/server.ts` currently gates auth behind
`if (INGEST_SECRET) { ... }`: when `INGEST_SECRET` is unset, the secret check is
**skipped entirely** and `POST /trigger` is open. The `json-pdf` container
already does the right thing (exits at boot if `PDF_SECRET` is unset). The fix
belongs in code (the container image), and the deployment must guarantee the
secret is present:

- **Code (filed as #28):** make ingest match pdf: at startup, if `INGEST_SECRET`
  is empty, log and `process.exit(1)`; always require the Bearer match on
  `/trigger`. Then a misconfigured deploy fails loud instead of silently serving
  an open ingestion endpoint.
- **Deploy:** mark the var required in compose so the stack will not even start
  without it: `INGEST_SECRET: ${INGEST_SECRET:?set INGEST_SECRET}` (it already
  uses `:?` for the R2 vars; apply the same to `INGEST_SECRET`). With both the
  code fix and `:?`, fail-open is impossible.

Defense in depth: even with the connector being the only ingress, the shared
bearer between Worker and container stays the authn boundary, so this fix matters
regardless of network posture.

### 3.3 Containers must not run as root (#33)

Neither `containers/ingest-worker/Dockerfile` nor
`containers/pdf-worker/Dockerfile` sets a `USER`, so both run as root. Two
layers:

- **Image (filed as #33):** add a non-root user in each Dockerfile (the
  `node:*-slim` base ships a `node` uid 1000) and `USER node` before `CMD`.
  `json-pdf` shells out to `wkhtmltopdf` + `ghostscript`; those run fine as
  non-root (no privileged ops), but verify the render path can write its
  temp files under the `node` home / a writable `WORKDIR`.
- **Runtime (in compose, immediately, independent of the image fix):** add to
  each app service:
  ```yaml
  read_only: true
  tmpfs: [/tmp]
  cap_drop: [ALL]
  security_opt: [no-new-privileges:true]
  user: "1000:1000"   # until the Dockerfile USER lands
  ```
  MySQL needs a writable data dir (the named volume) so it is not `read_only`,
  but it should still get `cap_drop` of everything it does not need,
  `no-new-privileges`, and it runs as the mysql user inside its official image
  already.

### 3.4 No weak MySQL default passwords

The compose falls back to `${MYSQL_ROOT_PASSWORD:-rootpassword}`,
`${MYSQL_PASSWORD:-commonthreadpass}`, etc. A deploy that forgets the `.env`
silently comes up with a known password. Switch the MySQL credential vars to the
required form so the stack refuses to start without them:

```yaml
MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?set MYSQL_ROOT_PASSWORD}
MYSQL_PASSWORD:      ${MYSQL_PASSWORD:?set MYSQL_PASSWORD}
MYSQL_USER:          ${MYSQL_USER:?set MYSQL_USER}
MYSQL_DATABASE:      ${MYSQL_DATABASE:-common_thread}
```

`MYSQL_DATABASE` can keep a default (it is not a secret). The `MYSQL_URL` the
ingest container builds must be derived from the same vars so they cannot drift.
Generate the actual passwords with `openssl rand -hex 32` and store them
age-encrypted (section 4).

### 3.5 Shape of the migrated compose

```yaml
name: common-thread

services:
  mysql:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD:?set MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE:-common_thread}
      MYSQL_USER: ${MYSQL_USER:?set MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD:?set MYSQL_PASSWORD}
      TZ: UTC
    # no ports:  -- reached only on the stack network
    volumes:
      - mysql_data:/var/lib/mysql
      - ./mysql-schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
    command: >
      --default-authentication-plugin=caching_sha2_password
      --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
      --max_connections=500 --max_allowed_packet=256M
      --innodb_buffer_pool_size=1G --innodb_log_file_size=256M
    security_opt: [no-new-privileges:true]
    cap_drop: [ALL]
    cap_add: [CHOWN, SETUID, SETGID, DAC_OVERRIDE]   # minimum mysqld needs
    healthcheck: { test: ["CMD","mysqladmin","ping","-h","localhost","-u","root","-p${MYSQL_ROOT_PASSWORD}"], interval: 10s, timeout: 5s, retries: 5, start_period: 30s }
    networks: [internal]

  json-ingest:
    image: ghcr.io/skyphusion-labs/common-thread-ingest:0.1.0
    hostname: json-ingest
    restart: unless-stopped
    depends_on: { mysql: { condition: service_healthy } }
    # no ports:
    environment:
      PORT: "8080"
      CONTAINER_NAME: json-ingest
      MYSQL_URL: mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@mysql:3306/${MYSQL_DATABASE:-common_thread}
      R2_ACCOUNT_ID: ${R2_ACCOUNT_ID:?}
      R2_ACCESS_KEY_ID: ${R2_ACCESS_KEY_ID:?}
      R2_SECRET_ACCESS_KEY: ${R2_SECRET_ACCESS_KEY:?}
      R2_BUCKET_NAME: ${R2_BUCKET_NAME:-common-thread-archive}
      INGEST_SECRET: ${INGEST_SECRET:?set INGEST_SECRET}
    user: "1000:1000"
    read_only: true
    tmpfs: [/tmp]
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    healthcheck: { test: ["CMD","node","-e","fetch('http://127.0.0.1:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], interval: 10s, timeout: 5s, retries: 5, start_period: 15s }
    networks: [internal]

  json-pdf:
    image: ghcr.io/skyphusion-labs/common-thread-pdf:0.1.0
    hostname: json-pdf
    restart: unless-stopped
    # no ports:
    environment:
      PORT: "8081"
      CONTAINER_NAME: json-pdf
      PDF_SECRET: ${PDF_SECRET:?set PDF_SECRET}
    user: "1000:1000"
    read_only: true
    tmpfs: [/tmp]              # wkhtmltopdf/ghostscript scratch
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    healthcheck: { test: ["CMD","node","-e","fetch('http://127.0.0.1:8081/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"], interval: 10s, timeout: 5s, retries: 5, start_period: 30s }
    networks: [internal]

  cloudflared:
    image: cloudflare/cloudflared:latest
    command: tunnel --no-autoupdate run        # token-driven; VPC connector, not public ingress
    restart: unless-stopped
    environment:
      - TUNNEL_TOKEN=${CF_TUNNEL_TOKEN:?set CF_TUNNEL_TOKEN}
    depends_on: [json-ingest, json-pdf]
    networks: [internal]

volumes:
  mysql_data:

networks:
  internal:
    driver: bridge
```

Notes:
- `user`/`read_only`/`cap_drop`/`tmpfs` deliver the #33 hardening at runtime now;
  the Dockerfile `USER` change makes it the image default later. Validate the
  `json-pdf` render path under `read_only: true` + `tmpfs: /tmp` before calling
  it done (wkhtmltopdf/ghostscript must write only to `/tmp`); if they need
  another writable path, add a tmpfs for it rather than dropping `read_only`.
- The `cloudflared` connector here is the **Workers VPC** connector for this
  stack. It must be the VPC-attached tunnel whose `service_id` is what the
  backend Worker's `[[vpc_services]]` points at. Confirm against current
  Cloudflare VPC/connector docs whether this stack gets its own connector or
  attaches to an existing one (dischord already runs a cloudflared with a
  `vivijure` VPC network attached for the same reason; this stack can follow
  that precedent with its own `internal` network attached to the connector).

## 4. Secrets flow (chezmoi + age, the crew-secrets pattern)

Mirror the established fleet pattern: real values are age-encrypted in
`fleet-chezmoi`, decrypted at apply time, never committed plaintext.

Secrets for this stack:

| Secret | Consumer | Notes |
|--------|----------|-------|
| `MYSQL_ROOT_PASSWORD` | mysql | `openssl rand -hex 32` |
| `MYSQL_PASSWORD` (+ `MYSQL_USER`) | mysql + ingest `MYSQL_URL` | same value both places, derived from one var |
| `INGEST_SECRET` | Worker (`wrangler secret`) + ingest container | shared bearer; MUST match |
| `PDF_SECRET` | Worker (`wrangler secret`) + pdf container | shared bearer; MUST match |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ACCOUNT_ID` | ingest container | scoped R2 key for `common-thread-archive` only |
| `CF_TUNNEL_TOKEN` | cloudflared connector | per-stack VPC connector token |

Flow:
1. Add a `stacks/common-thread/.env` template to fleet-chezmoi as a `.tmpl`
   that pulls these from an age-encrypted source file (the same mechanism the
   other stacks use; values live in the crew-secrets / fleet-chezmoi age store,
   not in this repo). Follow the per-tier rule from crew-secrets: stack/service
   creds are their own tier, edited via the decrypt | edit | re-encrypt pipe,
   landed by PR (not direct push).
2. `chezmoi apply` on dischord writes `/var/jenkins_home/stacks/common-thread/.env`
   (mode 0600). The `system/stacks/Jenkinsfile` deploy step feeds it via
   `--env-file`.
3. The Worker side (`INGEST_SECRET`, `PDF_SECRET`) stays a `wrangler secret put`
   on the backend Worker; the **same** value goes in the stack `.env`. Rotation
   = roll the value, update both the age source and the Worker secret, re-apply +
   re-deploy. Per crew-cred least-privilege, the R2 key and the bearer tokens
   rotate independently.

Hard rule (from prior leaks): never echo a secret while wiring this up; check
presence with `${VAR:+SET}`, never `${VAR:-...}`. Work in
`env -u BASH_ENV bash --norc` when handling the age files.

## 5. How the Worker side changes

The application code does not change. Only `wrangler.toml` (gitignored, holds
local resource IDs) gets the VPC bindings pointed at this stack's connector:

```toml
INGEST_WORKER_URL = "http://json-ingest:8080/trigger"
PDF_WORKER_URL    = "http://json-pdf:8081/render"

[[vpc_services]]
binding    = "VPC_INGEST"
service_id = "<this stack's VPC ingest service id>"
remote     = true

[[vpc_services]]
binding    = "VPC_PDF"
service_id = "<this stack's VPC pdf service id>"
remote     = true
```

Plus the Worker secrets `INGEST_SECRET` / `PDF_SECRET` (matching the stack
`.env`) and, separately, the `DB` Hyperdrive pointed at this MySQL over the same
VPC. Document the produced `service_id`s in the deploy runbook (they are the one
piece that only exists after the connector is created).

## 6. Bring-up order

1. Land the code fixes first (#28 ingest fail-closed, #33 non-root Dockerfiles)
   so the deployed images are the hardened ones. These ship via the existing
   container image build (GHCR), bump the image tags in the stack compose.
2. Add `stacks/common-thread/` to fleet-chezmoi (compose + `.env.tmpl` +
   schema), add it to the `Jenkinsfile` `STACK` choices. PR, review, merge.
3. Put the age-encrypted secrets in place; `chezmoi apply` on dischord.
4. Create the VPC connector for the stack; record the `service_id`s.
5. Deploy the stack (`system/stacks/Jenkinsfile`, `STACK=common-thread`). MySQL
   seeds the schema on first boot (empty volume).
6. Wire the backend Worker's `wrangler.toml` VPC bindings + Hyperdrive to the
   new connector/MySQL; set the matching Worker secrets; deploy the Worker.
7. Smoke: Worker `/health`; an ingest `POST /trigger` round-trip writes
   `ingest_jobs` rows and features; a `?format=pdf` evidence-packet export
   renders through `json-pdf`. Confirm `nmap`/`ss` shows NO published
   3306/8080/8081 on the host (the #29 verification).

## 7. Teardown criteria (when this stack should come down)

The stack is **only** needed for production-scale work the Worker cannot do
inline:

- `json-ingest`: large Apify exports. Without VPC the Worker runs the full
  ingest pipeline inline (fine for local dev / small exports). Tear down ingest
  if/when no large-export investigations are active.
- `json-pdf`: `?format=pdf` evidence packets. JSON / Markdown packet formats need
  no container. Tear down pdf if PDF export is not in use.

Teardown is clean because the data of record lives off the box:

- **MySQL** is the one piece of local state. Before teardown, dump it
  (`mysqldump`) to R2, or migrate it to a managed MySQL; the R2 archive
  (`common-thread-archive`) and the signed manifest are the durable evidentiary
  store and are unaffected. Do not delete `mysql_data` until the dump is
  verified restorable.
- The two app containers and the connector are stateless; `docker compose down`
  removes them with zero data loss.
- On the Worker side, removing the `[[vpc_services]]` bindings makes ingest fall
  back to inline and disables `?format=pdf` (returns the non-PDF formats), so the
  app degrades gracefully rather than breaking.

Concrete trigger to tear down (the `lagwagon` lesson): the stack went up for a
specific batch of work and then came down. Codify that: **the stack stays up
only while there is an active investigation needing large-export ingest or PDF
export; otherwise scale it to zero** (`docker compose down`, keep the
age-encrypted `.env` + the `mysql_data` dump in R2 so re-bring-up is one
`chezmoi apply` + `compose up` away). Because it is compose-in-git, re-creating
it later is reproducible, not a from-scratch rebuild.

## 8. Open questions for Conrad

1. **Target host:** dischord (recommended, matches the always-on stack model) or
   a dedicated themed VPS for blast-radius isolation of investigation data?
2. **VPC connector topology:** does this stack get its own cloudflared VPC
   connector, or attach its `internal` network to dischord's existing connector
   (the `vivijure`-style precedent)? Needs a check against current Cloudflare VPC
   docs and the live connector config.
3. **MySQL durability:** is the R2 archive + manifest sufficient as the system of
   record (treat MySQL as rebuildable cache), or does the MySQL state itself need
   a backup/restore SLA (scheduled `mysqldump` to R2)? Drives the teardown dump
   policy in section 7.
4. **Always-on vs on-demand:** keep the stack running, or codify scale-to-zero
   between investigations per section 7? Affects cost and the deploy runbook.

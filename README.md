# Common Thread

A practitioner's methodology and reference implementation for sockpuppet
attribution from observable behavioral signals on social platforms.

Common Thread ships as a **methodology paper** (the spec) and a **reference
implementation** (Cloudflare Workers + MySQL + R2). Given a seed set of
accounts, it attributes coordinated inauthentic behavior to a common operator
and emits calibrated probabilistic claims at three confidence bands:
`insufficient`, `consistent`, `strongly_consistent`. It stops at
cluster-level attribution by design and never identifies natural persons.

## Who this is for

Pro se litigants, small-newsroom journalists, OSINT practitioners, and
researchers who need documented methodology without platform-internal data or
commercial OSINT tooling. Read the paper's audience exclusions (§1.2) before
applying the methodology.

## Repository layout

| Path | Purpose |
|------|---------|
| `paper/` | Methodology paper (CC-BY-4.0) — **the spec** |
| `implementation/` | Backend reference implementation (AGPL-3.0) |
| `web/` | Browser UI Worker (proxies API, BYOK for attribution) |
| `docs/` | Setup, deployment, API, testing |
| `containers/` | Optional VPC ingest and PDF workers |
| `tests/` | Vitest suite (Workers pool + MySQL integration) |
| `examples/` | Worked case studies (placeholder in v1) |

## Quick start

```bash
git clone https://github.com/skyphusion-labs/common-thread
cd common-thread
npm install

# Backend config (fill in Hyperdrive + R2 IDs)
cp wrangler.toml.example wrangler.toml

# Web frontend config (service binding to backend)
cp web/wrangler.toml.example web/wrangler.toml

# See docs/SETUP.md for MySQL, R2, Hyperdrive, and local dev
```

**Local development**

```bash
# Terminal 1 — backend API
npm run dev

# Terminal 2 — web UI (optional)
npm run dev:web
```

Open the web UI, create an investigation (save the access token), upload Apify
Twitter JSON, run extractors via ingest, then run attribution with **your own**
Anthropic / AI Gateway keys (BYOK). See `docs/SETUP.md` and the Setup tab in
the web UI.

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/SETUP.md](docs/SETUP.md) | First-time install, MySQL, secrets, local dev |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploy backend + web, bindings, VPC containers |
| [docs/API.md](docs/API.md) | HTTP routes and typical workflow |
| [docs/TESTING_SETUP.md](docs/TESTING_SETUP.md) | Vitest, MySQL test DB, LLM mocking |
| [docs/contact.md](docs/contact.md) | Public and private contact channels |

## Web frontend

`web/worker.js` is a single-file Worker that provides the full workflow UI:

- Create investigations (one-time capability token) and reopen with token or share link
- Upload Apify data; seal investigations when complete (read-only)
- Poll ingest jobs and view features
- Run attribution with **bring-your-own-key** (BYOK) credentials
- Download evidence packets (JSON, Markdown, PDF when configured)

Investigations are private: no global listing. Tokens are capability secrets —
the UI explains what they do and do not protect.

The web Worker proxies `/api/proxy/*` to the backend via a **service binding**
(`BACKEND`) in production. Users supply Anthropic / AI Gateway keys and
investigation access tokens in the browser; API keys are not stored on the
server. Investigation tokens may be saved in `localStorage` on the user's device.

## Bring-your-own-key (BYOK)

The host does not need to pay for everyone's LLM usage. Attribution accepts
credentials per request (web UI or API headers). Server-side
`AI_GATEWAY_URL` / `ANTHROPIC_API_KEY` secrets are optional when all users
BYOK. See `docs/API.md` and the web Setup tab.

## Licensing

- **Implementation:** AGPL-3.0
- **Methodology paper:** CC-BY-4.0

## Contributing

Bug reports and methodology questions: GitHub issues. Code contributions should
reference the relevant paper section where applicable. See `docs/contact.md` for
private inquiries.

## Status

v1 in active stabilization. Methodology paper complete. Backend Worker, web
frontend, and optional VPC ingest/PDF containers are implemented.

**Public UI:** https://common-thread.skyphusion.org

**Public API:** https://common-thread-backend.skyphusion.org (see [docs/API.md](docs/API.md)).
Using the hosted API in your own project requires prior contact with the
operator — email **common-thread@skyphusion.org** or see [docs/contact.md](docs/contact.md).
To run your own instance without asking, self-host per `docs/SETUP.md`.

**Skyphusion Labs:** https://skyphusion.org · **Org:** https://github.com/skyphusion-labs

**Repository:** https://github.com/skyphusion-labs/common-thread

# Public usage guide (common-thread.skyphusion.org)

This is the happy path for a first-time visitor to the hosted Common Thread
instance. It covers what the host provides, what you must bring yourself
(BYOK), and the end-to-end flow from opening the site to downloading a signed
evidence packet.

Common Thread attributes coordinated inauthentic behavior to a common operator
from public behavioral signals. It stops at cluster-level attribution by design
and never identifies natural persons (paper section 3). Use it accordingly.

## Who pays for what

| Layer | Who provides it |
|---|---|
| Web UI, backend API, archive (R2), database, containers | Skyphusion (the host) |
| The attribution reasoning (triage + LLM calls, paper section 7) | **You (BYOK)** |

The public instance holds **no** shared Anthropic key. Attribution will not run
on host credentials; it fails closed until you supply your own. This is
deliberate: you pay Anthropic directly for the model calls you make, and the
host never fronts that cost or your usage.

## What you need before attribution

Pick **one** BYOK path (Setup tab or API headers):

| Path | Gateway URL | Credential |
|------|-------------|------------|
| **A. Anthropic key** | Cloudflare AI Gateway base ending in `/anthropic`, **or** `https://api.anthropic.com` | Anthropic API key (`sk-ant-…`) |
| **B. AI Gateway Run token** (keyless Unified Billing) | Same gateway base ending in `/anthropic` | AI Gateway **Run** token (`X-CF-AIG-Token` / Setup field) |

You do not need these just to create an investigation, upload data, or view
extracted features. They are required only for attribution.

### Path A: Anthropic API key

1. Create an account at https://console.anthropic.com/.
2. Open **API keys** and create a key (it starts with `sk-ant-`).
3. Add billing or credits in the Anthropic console before running attribution.

### Path B: Cloudflare AI Gateway Run token (recommended for Cloudflare accounts)

1. In the Cloudflare dashboard (https://dash.cloudflare.com/), go to
   **AI -> AI Gateway**.
2. Create a gateway (or reuse one) with the **Anthropic** provider and Unified
   Billing (or provider keys held by the gateway).
3. Copy the gateway base URL ending in `/anthropic`, for example:
   `https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_name>/anthropic`
4. Create a **Run token** for that gateway and paste it in Setup (or send
   `X-CF-AIG-Token`). Do not use a Workers deploy token here.

AI Gateway adds caching, rate limits, and usage visibility. Path A with
`https://api.anthropic.com` as the gateway URL works if you prefer direct
Anthropic billing; the backend appends `/v1/messages`.

Credentials stay in your browser. They are sent only when you run attribution,
are never stored server-side, and never appear in evidence packets or archived
artifacts. If you tick "Remember credentials in this browser," they are saved
in this device local storage only (unencrypted); leave it unticked on a shared
machine.

## The happy path

1. **Open** https://common-thread.skyphusion.org. The header shows a backend
   status badge; leave the Setup "API base URL" field empty (the hosted UI is
   wired to its backend directly).
2. **Setup -> AI credentials (BYOK).** Paste your AI Gateway URL (ending in
   `/anthropic`) and either an Anthropic API key **or** an AI Gateway Run
   token, then **Save settings**.
3. **Investigation -> Create new.** Give it an id and a display name. You receive
   a one-time **access token** (`ct_...`). Copy and store it now; the server
   cannot recover it, and anyone with the token can read (and, while active,
   modify) the investigation. It is a capability secret, not a password.
   New investigations are encrypted at rest under that token (§3.5).
4. **Upload Data.** Drop Apify JSON exports for Twitter/X, Instagram, Reddit,
   Bluesky, Mastodon, TikTok, or YouTube (profiles, timelines, posts, comments; YouTube uses titles, descriptions, and comments). Mixed files are split by platform.
   The backend archives the raw data by content hash and runs extractors (VPC
   containers when configured, including key-on-dispatch for encrypted
   investigations). Watch the ingest job to completion.
5. **Features.** Review the extracted account-level and pair-level signals. No
   LLM or credentials are involved here.
6. **Attribution.** With BYOK credentials saved, the **Run attribution** button
   is enabled. It runs LLM reasoning over the active seed pairs using **your**
   key. Without credentials the button stays disabled and the page tells you to
   add a key in Setup; the host will not run it for you.
7. **Results.** Review each run and its confidence band
   (`insufficient` / `consistent` / `strongly_consistent`), then download the
   evidence packet as JSON, Markdown, or PDF. Packets are signed (Ed25519) and
   reproducible from the recorded manifest hash.
8. **Seal (optional).** Sealing an investigation makes it read-only: you can
   still review data and download packets, but ingest and attribution are
   disabled.

## Notes and limits

- **Cluster-only by design.** Common Thread never attributes to a named natural
  person. Do not use it to do so (paper section 3.3.3). See
  [ACCEPTABLE-USE.md](ACCEPTABLE-USE.md) for prohibited uses and
  [PRIVACY.md](PRIVACY.md) for what the hosted instance retains.
- **Token custody is yours.** Lose the access token and the investigation cannot
  be recovered from the server. Share links embed the token, so anyone with the
  link has the same access.
- **Rate / abuse limits.** The host may rate-limit anonymous investigation
  creation, ingest, and attribution, and may cap seed-set and artifact sizes, to
  keep the shared instance healthy. Enforcement and prohibited uses are defined
  in [ACCEPTABLE-USE.md](ACCEPTABLE-USE.md).
- **Hosted API use.** This guide is for the web UI. Before using the direct API
  (`common-thread-backend.skyphusion.org`) in your own project, contact
  common-thread@skyphusion.org (see docs/contact.md).

## Self-hosting

If you would rather the deployment supply its own AI credentials (no BYOK), run
your own backend and set `AI_GATEWAY_URL` plus either `CF_AIG_TOKEN` or
`ANTHROPIC_API_KEY` as Worker secrets, and leave the web worker `PUBLIC_BYOK_ONLY`
flag unset. See docs/SETUP.md and docs/DEPLOYMENT.md.

Policy: [ACCEPTABLE-USE.md](ACCEPTABLE-USE.md), [PRIVACY.md](PRIVACY.md).

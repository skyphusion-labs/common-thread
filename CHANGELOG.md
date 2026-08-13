# Changelog

## v0.4.0

MINOR (Instagram + Reddit Apify ingest on the hosted path):

- **Multi-platform ingest (#267):** `POST /ingest/apify` auto-detects Twitter/X, Instagram, and Reddit (mixed uploads split). Dedicated `/apify-instagram` and `/apify-reddit` routes; VPC ingest container follows `provider`. Official Apify Instagram JSON and `trudax/reddit-scraper-lite` rows (normalized to `created_utc`) run the existing stylometric / temporal / Reddit account-metadata extractors.
- **Unsupported platforms stay closed (#270):** Facebook, Bluesky, TikTok, YouTube, and Mastodon hosts (plus `at://` URIs) return `400 unsupported_export` instead of falling into the Twitter pipeline.
- **Estate coverage:** `code-coverage.yml` materializes `wrangler.toml.example` so the required coverage check can run on PRs (gitignored wrangler.toml).
- **Publication pre-submit (#268):** `paper/00-front-matter.md`; Argamon 2009 and Hui 2019 confirmed; remaining `[verify]` flags retained for the reviewer pass.

Tag-gated prod deploy: `v0.4.0` (Workers + GHCR image push/roll on `v*`).

## v0.3.0

MINOR (visitor BYOK + encrypted VPC key-on-dispatch):

- **Visitor CF AIG BYOK (#249 / #187):** public attribution accepts an AI Gateway Run token (`X-CF-AIG-Token` / `cfAigToken`) with gateway URL, or an Anthropic key; web Setup forwards the token; `PUBLIC_BYOK_ONLY` fail-closed.
- **VPC key-on-dispatch (#246 / #250 / #251):** encrypted investigations may ingest (and attribute when async) via fleet containers. Worker seals the investigation key under `INGEST_SECRET` / `ATTRIBUTION_SECRET` for the handoff only; jobs tables never store key material. #251 fixes a container bug that stripped handoff material before `processJob`.
- **Deploy hygiene (#248):** prod tag filter is SemVer-only (`v[0-9]*`); tag deploy fails closed without `PUBLIC_BYOK_ONLY=1` in wrangler escrow.
- **Live smoke (2026-08-04):** encrypted inv → VPC ingest 202 → job completed on `json-ingest` → attribute via `…/skyphusion-llm/anthropic` BYOK → packet 200.

Tag-gated prod deploy: `v0.3.0` (Workers + GHCR image push/roll on `v*`).

## v0.2.0

MINOR (public-host hardening + §3.5 scope expansion):

- **Resource caps (#189 / #243):** hard limits on seed count, ingest items, and attribution pair fan-out (`MAX_SEED_ACCOUNTS` / `MAX_INGEST_ITEMS` / `MAX_ATTRIBUTION_PAIRS`).
- **Encryption at rest (#228 / #244):** feature values, basis statements, event data, and metadata encrypted under the investigation key (in addition to attribution conclusions). Encrypted investigations force inline ingest (fail closed if key missing).
- **PUBLIC_BYOK_ONLY web parity (#201 / #241):** UI accepts `"1"` or `"true"`.
- **Host-posture docs (#187 / #242):** retention/DELETE/R2, WAF path, PUBLIC-RELEASE updates.
- **Transport:** non-retryable HTTP 4xx from AI Gateway no longer re-enter `callLLM` backoff (isolation test flake).
- **Ops (out of band):** WAF/rate-limit applied on skyphusion.org (2026-08-04); `@skyphusion/common-thread-verify@0.1.0` published (`verify-v0.1.0`).

Tag-gated prod deploy: `v0.2.0`.

## v0.1.2

PATCH: dependency and security/CI updates on main since v0.1.1. Tag-gated prod deploy. **workers_dev:** closed 2026-08-04 (#234 + crew-secrets escrow + redeploy); no longer a deploy blocker.

## v0.1.1

Release sync bump (2026-07-21). No functional changes in this tag.


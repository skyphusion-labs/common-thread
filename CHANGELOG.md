# Changelog

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


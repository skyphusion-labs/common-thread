# Public release readiness — common-thread.skyphusion.org

Go / no-go evaluation for opening the hosted instance to unsolicited public use
(BYOK attribution only). Tracks [#187](https://github.com/skyphusion-labs/common-thread/issues/187).
Companion: `docs/COMPONENTS.md` (distribution), `docs/PUBLIC-USAGE.md` (stranger
happy-path), `docs/PRIVACY.md` / `docs/ACCEPTABLE-USE.md` (policy).

**Status: LIVE — prod fail-closed activated and smoke-verified (2026-07-18).**
Adverse-security pass complete (no open CRITICAL/HIGH); BYOK fail-closed active.
**workers_dev second door closed** 2026-08-04 (common-thread#234 + crew-secrets
escrow + operator redeploy; `*.workers.dev` 404 / disabled for prod and ops).
Remaining before public *announce*: positive BYOK round-trip (throwaway key),
and any further legal wording Conrad wants after the retention/DELETE update
in `PRIVACY.md`. **WAF applied** 2026-08-04; **npm**
`@skyphusion/common-thread-verify@0.1.0` published (`verify-v0.1.0`). Detail below.

> Product contract: Skyphusion hosts Workers / Hyperdrive / R2 / MySQL / VPC
> containers. The §7 triage + attribution LLM calls are **visitor BYOK**
> (Anthropic key + AI Gateway). The public Worker must hold **no** shared AI
> credential a visitor can ride, and must **fail closed** when BYOK is missing.

## Go / no-go by subsystem

| Subsystem | Verdict | Notes |
|---|---|---|
| Backend auth / authZ | **GO** | Constant-time token compare; no route missing authorize; IDOR closed — all three GET packet/run reads self-authorize in-handler, scoped to path investigation_id, integer runId (no hash-unguessability reliance). Confirmed. |
| Fail-closed BYOK (prod) | **LIVE** | Code fix merged (#192); activated on prod 2026-07-18 (`PUBLIC_BYOK_ONLY` set both workers, host AI secrets stripped). Smoke-verified: no-BYOK → `400 byok_required`, 0 runs dispatched (Rollins 8/0); web gate + CSP clean (Joan). Host key cannot be ridden. |
| Web UI | **GO** | Parse-break (dead since #69) + BYOK fail-closed gate + headers (#197); de-CDN (self-hosted Tailwind + inline SVG) + strict CSP + branded BYOK error page (#199). Verified in a real browser under enforced CSP, zero violations, both modes. |
| Deterministic extractors | GO | Resource caps in Worker (#189): seeds / ingest items / attribution pairs. WAF still front-line. |
| Attribution reasoner (§7) | GO | Citation-required, declines rather than guesses; BYOK SSRF guard verified. |
| Archive / R2 | GO | Content-addressed, hash re-verified on read; BYOK keys never persisted. |
| VPC ingest / PDF / attribution | **GO** | Executor confirmed internal-only both sides (code: `[[vpc_services]]` binding, no public route to :8082; infra: no public ingress). BYOK runs inline, never dispatches; only the no-BYOK path reaches the executor and it fails closed once the flag is set / secrets stripped. wkhtmltopdf SSRF locked. |
| Offline verifier package | **GO** | Published `@skyphusion/common-thread-verify@0.1.0` (`verify-v0.1.0`, 2026-08-04). |
| Encryption at rest (§3.5) | **GO** | Conclusion + features/basis/events/metadata (#228 / #244). VPC key-on-dispatch still deferred (inline force). |
| CORS / origin | GO | Prod `CORS_ALLOWED_ORIGINS=""` (browser API blocked); never `*`-with-credentials. |
| Legal / policy docs | **UPDATED** (retention/DELETE/R2 + BYOK verified) | `PRIVACY.md` / `ACCEPTABLE-USE.md` are active disclosures. Controller/processor and calendar retention still OPEN. UI-vs-API: Option 1 (UI public; API not third-party open) remains the default. |

## CRITICAL / HIGH findings — all resolved in code

### CRITICAL-1 — prod backend not fail-closed BYOK → FIXED + LIVE (verified 2026-07-18)
`common-thread-prod` holds `AI_GATEWAY_URL` + `CF_AIG_TOKEN` (keyless Unified
Billing = host-paid); a no-BYOK request fell back to host env and got host-paid
attribution. Violated the #187 non-negotiable on the live (unannounced) endpoint.

**Remediation:**
- **Code (merged, #192):** `PUBLIC_BYOK_ONLY` flag — backend ignores server AI
  creds, requires visitor BYOK, gates at `handleAttribute` entry before any
  dispatch. Same-source BYOK hardening folded in (no env x-api-key backfilled into
  a request-supplied gateway; keyless Unified Billing path preserved).
- **Fail-closed semantics:** credential-less → **400 `byok_required`** (flag on) /
  **503** (creds stripped, flag off); both pre-dispatch, no VPC dispatch. Joan's
  UI asserts on the `byok_required` code.
- **Executor path:** closed — confirmed internal-only both code-side and infra-side.
- **Activation (pending Conrad):** set `PUBLIC_BYOK_ONLY=1` on both workers + strip
  the two host AI secrets (reversible, escrowed). Rollins runs the live smoke after.

### HIGH — web UI not fail-closed → FIXED (#197)
Frontend submitted credential-less attribution and advertised "server-side, may
queue." Fixed: `PUBLIC_BYOK_ONLY` projected into the UI gates Run until BYOK is set;
`byok_required` translated to a friendly message; honest copy. Also fixed the
inline-script parse break that had left the whole UI non-functional since #69.

## MEDIUM / LOW

- **MED (fixed, #194):** `escapeHtml` non-terminating loop — CPU-DoS + broke every
  PDF export containing `&`. Fixed (single ordered pass) + regression test.
- **MED (fixed, #199):** UI loaded Tailwind + FontAwesome from external CDNs on a
  page holding BYOK keys. Fixed: self-hosted prebuilt Tailwind + inline SVG icons,
  strict CSP (`default-src 'none'`, `script-src 'self'`, …), plus the
  `nosniff`/`Referrer-Policy`/`X-Frame-Options` from #197.
- **LOW (self-host only, #195 closed — fixed in #192):** partial-BYOK credential
  mixing. Same-source enforcement shipped with #192.
- **LOW (#189):** code-level resource caps shipped (seed count, ingest items,
  O(n²) pair fan-out) with wrangler-tunable defaults; WAF remains front-line.

## Verified clean (do not re-audit)
Constant-time token compare; no route missing authorize; SQL fully parameterized;
BYOK gateway SSRF blocked (https-only, no creds, RFC1918/link-local/loopback);
wkhtmltopdf SSRF locked (`--disable-local-file-access/-javascript/-external-links/--no-images`);
BYOK keys never persisted to DB / packets / R2; no secrets logged; generic 500 on
unhandled error; container bearer auth + 32MB body cap.

## Conrad decisions outstanding (release-gate batch)
1. ~~**Activate prod fail-closed**~~ — **DONE** 2026-07-18 (`PUBLIC_BYOK_ONLY` + host AI stripped; negative smoke PASS).
2. ~~**npm publish** `@skyphusion/common-thread-verify`~~ — **DONE** `0.1.0` via `verify-v0.1.0` (2026-08-04).
3. **UI-public vs API-public** — default remains Option 1 (UI public; CORS empty on API). Confirm if changing.
4. ~~**Retention / deletion policy (code truth)**~~ — documented in `PRIVACY.md` (DELETE graph + investigation archive keys; retain global `sha256/` blobs; default indefinite). Optional: fixed calendar purge later.
5. **Controller vs processor** framing for ingested third-party public data (counsel if scaled).
6. ~~**WAF apply**~~ — **DONE** 2026-08-04 (2 rate-limit rules + managed WAF on CT hosts; fleet-chezmoi CR APPLIED).
7. **Positive BYOK E2E** — throwaway Anthropic key: create → ingest fixture → attribute → packet on prod; record result here.

## Infra
- **WAF / rate-limit:** **APPLIED** 2026-08-04. IaC in fleet-chezmoi
  `system/cloudflare/waf-ratelimit/`. Live: 2 CT rate rules (30/60s expensive paths,
  300/60s backend host) + Cloudflare Managed Ruleset execute scoped to CT hosts.
  Re-apply: `apply-waf-ratelimit.sh` (merge-preserving). CR-2026-07-18.

## Acceptance criteria (#187) status
- [x] Readiness evaluation written (this doc)
- [x] Adverse security analysis — complete; no open critical/high
- [x] Public instance runs with no worker-level AI secrets (activated + verified 2026-07-18)
- [~] Documented stranger happy-path (`docs/PUBLIC-USAGE.md`, #197)
- [x] Prod BYOK smoke — negative (fail-closed) PASS 8/0 + web/CSP PASS
- [ ] Prod BYOK smoke — **positive** round-trip (throwaway key; pre-announce)
- [x] workers_dev closed for prod + ops (2026-08-04)
- [x] WAF/rate-limit applied (2026-08-04)
- [x] Follow-up issues filed (#189); hard caps shipped (#243)
- [x] npm `@skyphusion/common-thread-verify@0.1.0` published (`verify-v0.1.0`)

## Positive BYOK pre-announce smoke (manual)

Negative fail-closed is proven. Before public *announce*, run once with a
**throwaway** Anthropic key (and AI Gateway URL if required by your path):

1. Open `https://common-thread.skyphusion.org` (or create via API).
2. Create investigation; store `access_token` offline.
3. Upload a small Apify Twitter JSON fixture (synthetic or public sample).
4. Run extractors / wait for ingest job success.
5. Attribute with BYOK only (no host key). Expect 2xx and a run id.
6. Export packet JSON (and PDF if VPC PDF is up).
7. Record date, operator, and pass/fail on this page or on #187.

Do **not** use a personal long-lived key in shared logs.

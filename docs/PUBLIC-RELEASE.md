# Public release readiness — common-thread.skyphusion.org

Go / no-go evaluation for opening the hosted instance to unsolicited public use
(BYOK attribution only). Tracks [#187](https://github.com/skyphusion-labs/common-thread/issues/187).
Companion: `docs/COMPONENTS.md` (distribution), `docs/PUBLIC-USAGE.md` (stranger
happy-path), `docs/PRIVACY.md` / `docs/ACCEPTABLE-USE.md` (policy).

**Status: CODE-COMPLETE, awaiting release gates.** The adverse-security pass is
complete with no open CRITICAL/HIGH and every code fix is merged (six PRs). What
remains is not code: the prod fail-closed *activation*, the npm publish, Conrad's
legal-doc sign-off, and the infra WAF CR. Detail below.

> Product contract: Skyphusion hosts Workers / Hyperdrive / R2 / MySQL / VPC
> containers. The §7 triage + attribution LLM calls are **visitor BYOK**
> (Anthropic key + AI Gateway). The public Worker must hold **no** shared AI
> credential a visitor can ride, and must **fail closed** when BYOK is missing.

## Go / no-go by subsystem

| Subsystem | Verdict | Notes |
|---|---|---|
| Backend auth / authZ | **GO** | Constant-time token compare; no route missing authorize; IDOR closed — all three GET packet/run reads self-authorize in-handler, scoped to path investigation_id, integer runId (no hash-unguessability reliance). Confirmed. |
| Fail-closed BYOK (prod) | **GO on code → activation pending** | Code fix merged (#192): `PUBLIC_BYOK_ONLY` ignores server AI creds, returns `byok_required` (400). Activation on prod (set flag + strip secrets) is the final step, on Conrad's go. |
| Web UI | **GO** | Parse-break (dead since #69) + BYOK fail-closed gate + headers (#197); de-CDN (self-hosted Tailwind + inline SVG) + strict CSP + branded BYOK error page (#199). Verified in a real browser under enforced CSP, zero violations, both modes. |
| Deterministic extractors | GO with follow-up | No code-level resource caps (#189) — WAF + app limits bound the acute case. |
| Attribution reasoner (§7) | GO | Citation-required, declines rather than guesses; BYOK SSRF guard verified. |
| Archive / R2 | GO | Content-addressed, hash re-verified on read; BYOK keys never persisted. |
| VPC ingest / PDF / attribution | **GO** | Executor confirmed internal-only both sides (code: `[[vpc_services]]` binding, no public route to :8082; infra: no public ingress). BYOK runs inline, never dispatches; only the no-BYOK path reaches the executor and it fails closed once the flag is set / secrets stripped. wkhtmltopdf SSRF locked. |
| Offline verifier package | **GO → publish pending** | Parity verified end-to-end; A2 test suite + clean-room import lint merged (#193, #198). npm publish (#188 B1) awaits Conrad's go. |
| CORS / origin | GO | Prod `CORS_ALLOWED_ORIGINS=""` (browser API blocked); never `*`-with-credentials. |
| Legal / policy docs | DRAFTED → Conrad sign-off | PR #190 (draft): PRIVACY, ACCEPTABLE-USE, LICENSE-POSTURE, API-OPENNESS-DECISION, contact abuse section. UI-vs-API openness + 4 open questions are Conrad decisions. |

## CRITICAL / HIGH findings — all resolved in code

### CRITICAL-1 — prod backend not fail-closed BYOK → FIXED (activation pending)
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
- **LOW (#189):** no code-level resource caps (seed count, ingest items, O(n²) pair
  fan-out). Follow-up; WAF/app limits cover the acute case.

## Verified clean (do not re-audit)
Constant-time token compare; no route missing authorize; SQL fully parameterized;
BYOK gateway SSRF blocked (https-only, no creds, RFC1918/link-local/loopback);
wkhtmltopdf SSRF locked (`--disable-local-file-access/-javascript/-external-links/--no-images`);
BYOK keys never persisted to DB / packets / R2; no secrets logged; generic 500 on
unhandled error; container bearer auth + 32MB body cap.

## Conrad decisions outstanding (release-gate batch — can wait until board is ready)
1. **Activate prod fail-closed** — set `PUBLIC_BYOK_ONLY=1` + strip the two host AI
   secrets. Final flip step.
2. **npm publish** `verify-v0.1.0` — tests + clean-room lint green; awaiting go.
3. **UI-public vs API-public** — README/MAINTENANCE say the API is not open; #187
   opens the UI. Draw the line.
4. **Retention / deletion policy** — code does soft-delete + seal only; policy
   numbers + deletion-on-request path undefined.
5. **Controller vs processor** framing for ingested third-party public data.

## Infra (not code) — pending
- **WAF / rate-limit:** CF Pro active on skyphusion.org; Terraform ruleset (6→2
  rate-limit consolidation + managed WAF ruleset) authored in `ops/`. Apply gated on
  go-live + a Zone-WAF-Edit token.

## Acceptance criteria (#187) status
- [x] Readiness evaluation written (this doc)
- [x] Adverse security analysis — complete; no open critical/high
- [~] Public instance runs with no worker-level AI secrets (code merged; activation pending)
- [~] Documented stranger happy-path (`docs/PUBLIC-USAGE.md`, #197)
- [ ] Prod BYOK smoke (no secret values in logs/tickets) — after activation
- [x] Follow-up issues filed (#189)

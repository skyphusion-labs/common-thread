# Public release readiness — common-thread.skyphusion.org

Go / no-go evaluation for opening the hosted instance to unsolicited public use
(BYOK attribution only). Tracks [#187](https://github.com/skyphusion-labs/common-thread/issues/187).
Companion: `docs/COMPONENTS.md` (distribution), `docs/PUBLIC-USAGE.md` (stranger
happy-path), `docs/PRIVACY.md` / `docs/ACCEPTABLE-USE.md` (policy).

**Status: NOT READY TO ANNOUNCE.** One CRITICAL (fail-closed BYOK on prod) is in
remediation; two MEDIUM web items must land before flip. Detail below.

> Product contract: Skyphusion hosts Workers / Hyperdrive / R2 / MySQL / VPC
> containers. The §7 triage + attribution LLM calls are **visitor BYOK**
> (Anthropic key + AI Gateway). The public Worker must hold **no** shared AI
> credential a visitor can ride, and must **fail closed** when BYOK is missing.

## Go / no-go by subsystem

| Subsystem | Verdict | Blocking items |
|---|---|---|
| Backend auth / authZ | GO (pending 1 confirm) | Constant-time token compare, no route missing authorize, IDOR closed — verified. Final confirm: GET packet/packet:hash/runs self-authorize in-handler. |
| Fail-closed BYOK (prod) | **NO-GO → in remediation** | CRITICAL-1: prod holds host AI creds; anonymous request gets host-paid attribution. Fix = strip secrets (ops) + `PUBLIC_BYOK_ONLY` gate (code). |
| Web UI | NO-GO → in remediation | HIGH: UI not fail-closed + misleading "server-side" copy. MEDIUM: external CDN deps, no security headers. |
| Deterministic extractors | GO with follow-up | No code-level resource caps (#189) — WAF bounds the acute case. |
| Attribution reasoner (§7) | GO | Citation-required, declines rather than guesses; BYOK SSRF guard verified. |
| Archive / R2 | GO | Content-addressed, hash re-verified on read; BYOK keys never persisted. |
| VPC ingest / PDF / attribution | GO (pending 1 confirm) | RESOLVED: BYOK runs inline (never dispatches); only the no-BYOK path reaches the executor, and that path 503s once prod secrets are stripped — so the strip closes the executor path entirely. Confirm: executor container is VPC-internal only, no public route. wkhtmltopdf SSRF locked. |
| Offline verifier package | GO (pending publish) | Parity verified end-to-end; A2 test suite in progress; then npm publish (#188 B1). |
| CORS / origin | GO | Prod `CORS_ALLOWED_ORIGINS=""` (browser API blocked); never `*`-with-credentials. |
| Legal / policy docs | DRAFTED → Conrad sign-off | PR #190: PRIVACY, ACCEPTABLE-USE, LICENSE-POSTURE, API-OPENNESS-DECISION, contact abuse section. UI-vs-API openness + 4 open questions are Conrad decisions. |

## CRITICAL / HIGH findings

### CRITICAL-1 — prod backend is not fail-closed BYOK
`common-thread-prod` holds `AI_GATEWAY_URL` + `CF_AIG_TOKEN` (keyless Unified
Billing = host-paid). `ANTHROPIC_API_KEY` is absent, but those two suffice: a
no-BYOK request falls back to host env and gets host-paid attribution. Violates
the #187 non-negotiable on the live endpoint (unannounced, so exposure bounded).

**Remediation (two layers, defense-in-depth):**
- **Operational (Strummer, awaiting Conrad go):** delete `AI_GATEWAY_URL` +
  `CF_AIG_TOKEN` from `common-thread-prod`; resolver fails closed (503) before any
  host path; BYOK still runs. Reversible (escrowed).
- **Code (Rollins):** `PUBLIC_BYOK_ONLY` flag — backend ignores server AI creds
  and requires visitor BYOK, returning `byok_required` (400) when absent. Gates at
  `handleAttribute` entry, before async VPC dispatch.
- **Resolved:** the VPC attribution executor is reachable only via the no-BYOK
  (source=environment) path, which 503s once the secrets are stripped; BYOK runs
  inline and never dispatches. The strip closes the executor path. Remaining
  confirm: executor container is VPC-internal only (no public route). Cleaning the
  executor's own creds on `damaged` is defense-in-depth, not a blocker.

### HIGH — web UI not fail-closed
Frontend submits credential-less attribution and advertises "server-side, may
queue," telling strangers to set env vars they don't control. Fix: gate Run on
`hasByokCredentials()` behind the `PUBLIC_BYOK_ONLY` signal; honest copy;
translate `byok_required` to a friendly message.

## MEDIUM / LOW

- **MED (fixed):** `escapeHtml` non-terminating loop — CPU-DoS + broke every PDF
  export containing `&`. Fixed (single ordered pass), regression test added.
- **MED (web, pre-flip):** UI loads Tailwind + FontAwesome from external CDNs on a
  page holding BYOK keys — supply-chain surface, blocks strict CSP. Fix: self-host
  CSS + inline SVG, then CSP.
- **MED (web, pre-flip):** no security headers (CSP / nosniff / Referrer-Policy /
  X-Frame-Options).
- **LOW/MED (self-host only):** partial-BYOK credential mixing → server key exfil
  to a caller-chosen gateway. Fix: same-source BYOK (folded into credentials PR).
- **LOW (#189):** no code-level resource caps (seed count, ingest items, O(n²)
  pair fan-out).

## Verified clean (do not re-audit)
Constant-time token compare; no route missing authorize; SQL fully parameterized;
BYOK gateway SSRF blocked (https-only, no creds, RFC1918/link-local/loopback);
wkhtmltopdf SSRF locked (`--disable-local-file-access/-javascript/-external-links/--no-images`);
BYOK keys never persisted to DB / packets / R2; no secrets logged; generic 500 on
unhandled error; container bearer auth + 32MB body cap.

## Conrad decisions outstanding
1. **Strip prod AI secrets** (CRITICAL-1 operational fix) — go / hold.
2. **UI-public vs API-public** — README/MAINTENANCE say the API is not open;
   #187 opens the UI. Draw the line.
3. **Retention / deletion policy** — code does soft-delete + seal only; policy
   numbers + deletion-on-request path undefined.
4. **Controller vs processor** framing for ingested third-party public data.
5. **npm publish** `verify-v0.1.0` — go once A2 tests green.

## Acceptance criteria (#187) status
- [x] Readiness evaluation written (this doc)
- [~] Adverse security analysis — complete; critical/high in remediation
- [ ] Public instance runs with no worker-level AI secrets (pending CRITICAL-1)
- [~] Documented stranger happy-path (`docs/PUBLIC-USAGE.md` in progress)
- [ ] Prod BYOK smoke (no secret values in logs/tickets)
- [x] Follow-up issues filed (#189)

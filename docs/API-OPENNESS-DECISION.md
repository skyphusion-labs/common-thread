# Decision needed: UI-public vs API-public

> **Resolved by events, 2026-11-09.** Skyphusion Labs retired all Common Thread hosting on
> 2026-11-09. There is no hosted UI and no hosted API, so the UI-public versus API-public question
> this note posed has no object. No option below was ever formally chosen; option 1 was the
> working default stated in the historical draft terms (TERMS.md section 12). The note is kept as a
> record of the reasoning. The HTTP API is documented in [API.md](API.md) for self-hosted
> deployments, where its openness is the operator's call.
>
> One live consequence outside this repository: the MCP server
> (`@skyphusion/common-thread-mcp`, separate repo) defaulted `COMMON_THREAD_API_URL` to the
> hosted backend. That default now points at a hostname that does not resolve. Flagged, not fixed
> here.

**DRAFT decision note (Ernst, #187). Nothing here changes the current stance.**
This flags a distinction #187 has to resolve and lays out options. **Conrad
decides;** I am not flipping the API stance unilaterally.

## The tension

#187 opens the **web UI** publicly at
`common-thread.skyphusion.org` with BYOK
attribution. Two existing docs currently say the **API** is closed to unsolicited
third-party use:

- `docs/README.md` (Hosted API use): "The production API is **not open for
  unsolicited third-party integration**. Contact `common-thread@skyphusion.org`
  before building against the hosted endpoint, or self-host your own backend."
- `docs/MAINTENANCE.md`: "Self-hosters should not depend on the public API for
  production workflows without prior contact."
- `docs/contact.md` lists "Hosted API access" as a private-inquiry reason.

These are **not contradictory** with a public UI: a public browser UI backed by a
Worker is a normal shape, and "the UI is public" does not imply "the raw HTTP API
is an open, supported integration surface for third-party apps." But the docs do
not currently draw that line, so a reader can reasonably be confused about what is
open.

## Why the distinction matters (legal/ops, not just docs)

- **CORS / origin.** #187 requires `CORS_ALLOWED_ORIGINS` scoped to
  `common-thread.skyphusion.org` only (no `*` with credentials). That technical
  control **already encodes** "UI-origin yes, arbitrary third-party origin no."
  The docs should match the control.
- **Rate/abuse posture.** Anonymous investigation-create limits and the abuse
  channel (ACCEPTABLE-USE.md) assume browser-driven use, not high-volume
  programmatic integration.
- **Support surface.** Declaring the API "open" implies a stability/SLA
  commitment the bounded maintenance window (MAINTENANCE.md) does not want to
  make.

## Options for Conrad

1. **(Recommended) UI public, API not an open integration surface.** Keep the
   existing "contact first / self-host" API stance verbatim. Add one clarifying
   sentence to README + MAINTENANCE: "The public UI is open (BYOK); the HTTP API
   behind it is not a supported third-party integration surface -- use the UI, or
   self-host, or contact us." Lowest risk; matches the CORS control and the
   maintenance posture. No new commitments.

2. **UI public, API open with documented limits.** Publish the API as an open
   BYOK surface with explicit rate limits, an abuse policy, and a "no SLA / may
   change" notice. More work (rate limiting, docs, support expectations) and a
   larger commitment; only pick this if third-party programmatic use is a goal.

3. **Status quo, no doc change.** Leave the docs as they are. Not recommended:
   the public-UI launch invites the exact "is the API open?" confusion, and
   silence reads as an implicit answer either way.

## Recommendation

**Option 1.** It is the smallest change, it matches the CORS/abuse/maintenance
controls #187 is already building, and it makes no commitment the project would
have to walk back. If Conrad wants Option 1, I will prepare the one-sentence
clarifying edits to README.md and MAINTENANCE.md as a follow-up (still his call
to merge).

## Proposed clarifying sentence (Option 1, for approval -- NOT yet applied)

> The public **web UI** at common-thread.skyphusion.org is open to visitors
> (bring-your-own AI credentials). The **HTTP API** behind it is not a supported
> third-party integration surface: use the UI, self-host your own backend, or
> contact `common-thread@skyphusion.org` before building against the hosted
> endpoint.

---

**Status:** HISTORICAL. Resolved by events: hosting retired 2026-11-09 (#351). No decision was ever taken. Ernst, #187.

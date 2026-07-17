# Privacy (hosted instance)

**DRAFT for Conrad's review. Not legal advice, not a compliance certification.**
This document is a plain-language, structural disclosure of what the hosted
Common Thread instance does with data. It is written by the project (Ernst,
legal-affairs helper, not a practicing lawyer) to be honest and reproducible
from the docs, not to certify compliance with any specific privacy statute
(GDPR, CCPA/CPRA, or others). Open questions are flagged inline as **OPEN**.

## Scope

This policy covers **only the hosted instance** operated by Skyphusion Labs at
[common-thread.skyphusion.org](https://common-thread.skyphusion.org) (API:
`common-thread-backend.skyphusion.org`).

If you **self-host** the reference implementation, none of this applies to your
deployment; you operate your own instance and set your own privacy posture. The
AGPL-3.0 license governs the code, not your data handling.

## The one-line summary

Common Thread attributes coordinated inauthentic behavior to a **cluster** (a
common operator) from **public** behavioral signals. By design it **never
identifies natural persons** (methodology paper section 3.3.3). The hosted
instance stores the investigation data a visitor supplies and derives, protected
behind a per-investigation capability token, and it **never holds a shared AI
credential** that visitors ride: attribution runs on the visitor's own key
(BYOK).

## Two kinds of people in the data

Common Thread processes data about two distinct parties. Keeping them separate
is the whole point of the privacy analysis.

1. **You, the visitor / practitioner.** You create investigations, supply
   credentials, and read outputs.
2. **The account operators you investigate.** The artifacts you ingest are
   *other people's* public posts. Common Thread is an analysis tool pointed at
   public behavioral data; it does not obtain that data from the operators
   themselves.

Your obligations to the people you investigate are addressed in
[ACCEPTABLE-USE.md](ACCEPTABLE-USE.md) and in paper section 10 (ethics). This
document is about what the **host** retains.

## What the hosted instance retains

### 1. Investigation content you supply or derive

Stored in the host's MySQL (via Hyperdrive) and R2 archive, scoped to your
investigation:

- **Seed accounts** you enter (handles, platform, your `basis_statement`,
  control flags).
- **Archived artifacts**: the raw public posts/profiles ingested for the
  investigation, stored content-addressed in R2 by SHA-256 (paper section 3.1).
  The archive is immutable by design; corrections are new records, not edits
  (section 3.1.2).
- **Derived features** (`account_features`, `pair_features`, `event_features`)
  and their provenance rows.
- **Attribution runs and evidence packets** (`attribution_runs`, exported
  JSON/Markdown/PDF), including the cluster-level claims and cited signals.

These are the substance of the investigation. They persist so the investigation
is reproducible and auditable (section 3.4), which is a core methodology
commitment.

### 2. Capability tokens

Each investigation returns a one-time `access_token` at creation. The host
stores only a **hash** of the token (`access_token_hash`), not the token itself.
Losing the token means losing access to that investigation; the host cannot
recover it for you.

### 3. AI credentials (BYOK)

Attribution (paper section 7) requires a language model. On the hosted instance
**you bring your own credentials** (an Anthropic API key and/or an AI Gateway
URL). The public Worker holds **no** shared `ANTHROPIC_API_KEY` / `AI_GATEWAY_URL`
that visitors could ride, and it **fails closed** when BYOK is missing (clear
error, no silent host fallback).

Handling of BYOK credentials (never logged, never returned on a GET, not written
into evidence packets or R2 artifacts, memory lifetime bounded to the request)
is a **security** property tracked under #187 workstream 2 (Rollins' adverse
review). This document states the *privacy intent*; the security review verifies
the *implementation*. **OPEN:** cross-reference the final #187 key-handling
findings here once they land, and confirm whether any BYOK material is persisted
at rest (intent: no).

### 4. Operational logs

Standard request/operational logs (Cloudflare edge logs, Worker logs, error
traces) may capture request metadata (timestamps, routes, status codes, IP as
seen by the edge). **OPEN for Conrad:** the exact retention window and whether
any log field can incidentally capture investigation identifiers or token
material; the security review should confirm tokens/keys are never logged.

## What the hosted instance does NOT produce

- **No natural-person identification.** Outputs reference accounts by handle and
  clusters by opaque identifier. The methodology has no input for natural-person
  identifiers and no output that produces them (section 3.3.3). This is enforced
  in the output format, not merely promised.
- **No "verdicts."** Outputs are calibrated probabilistic bands
  (`insufficient` / `consistent` / `strongly_consistent`), not proof of identity
  (section 3.2).
- **No incidental-discovery capture.** Investigations are bounded by their stated
  scope; sensitive matter that surfaces incidentally (health, recovery, identity,
  immigration status) is not the investigation's output and should not be
  recorded into evidence packets (section 10.5).

## Host role for ingested third-party data

The artifacts you ingest are public posts authored by the operators you
investigate. **Structurally**, the visitor (practitioner) decides what to
collect and why, and is therefore the party who determines the purpose and means
of processing that third-party data; the hosted instance is the infrastructure
that stores and analyzes it on the visitor's instruction.

In data-protection vocabulary this maps roughly to **you = controller, host =
processor** for ingested investigation data. **FLAG / OPEN for Conrad:** this
controller/processor framing is a structural description, not a legal
determination, and it has real consequences (e.g. who answers a data-subject
request from an investigated operator). It should be confirmed with counsel
before it is relied on, and before the hosted instance is offered to third-party
practitioners at scale. The methodology's section 10.4 position on scraping
ethics and platform terms of service applies to what you choose to ingest; you do
not inherit the project's defense of collection for uses outside the
methodology's intended contexts.

## Retention and deletion

**Current implementation behavior:**

- Seed accounts are **soft-deleted** (`removed_at`), not hard-deleted, so the
  investigation record and its audit trail stay intact.
- Investigations can be **sealed** (`status = sealed`), making them read-only.
- The R2 archive is **append-only and immutable** by design (section 3.1);
  artifacts are content-addressed and are not mutated in place.

**OPEN for Conrad (policy, not code):**

1. How long the hosted instance retains investigation data (indefinite vs a
   defined window).
2. Whether a visitor can request **deletion** of an investigation and its
   archived artifacts, and by what channel; today the code path is
   soft-delete/seal, not erasure.
3. How deletion interacts with the immutability/reproducibility commitment
   (section 3.1, section 3.4) -- these are in tension and the resolution is a
   project decision, not a technical default.

Until these are decided, visitors should treat hosted-instance data as
**retained** and should not ingest anything they are not prepared to have stored.

## Security and abuse contact

- Security disclosures and abuse reports: see [contact.md](contact.md)
  (`common-thread@skyphusion.org`, subject prefixes `[SECURITY]` / `[ABUSE]`).
- Misuse of the hosted instance against protected populations is covered by
  [ACCEPTABLE-USE.md](ACCEPTABLE-USE.md).

## What this document is not

This is a structural disclosure, not a warranty and not legal advice. It does not
certify compliance with GDPR, CCPA/CPRA, or any other regime, and it does not
create any contractual obligation. The maintenance posture in
[MAINTENANCE.md](MAINTENANCE.md) applies: the hosted instance is best-effort
during a bounded window and may be reduced or retired with notice.

---

**Status:** DRAFT (Ernst, #187). Open questions flagged **OPEN** above are for
Conrad and, where noted, licensed counsel to resolve.

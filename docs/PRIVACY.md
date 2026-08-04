# Privacy (hosted instance)

**Active disclosure for the hosted instance (v0.1.2+). Not legal advice, not a
compliance certification.** This document is a plain-language structural
disclosure of what the hosted Common Thread instance does with data. It is
written by the project (Ernst, legal-affairs helper, not a practicing lawyer) to
be honest and reproducible from the docs, not to certify compliance with any
specific privacy statute (GDPR, CCPA/CPRA, or others). Remaining operator
decisions are flagged **OPEN**.

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
behind a per-investigation capability token, and holds no shared AI credential
that visitors could ride: attribution runs on the visitor's own key (BYOK).
Fail-closed BYOK on the public Worker was activated and smoke-verified
2026-07-18 (#187 / #192): no-BYOK attribution returns `400 byok_required` and
does not dispatch a run.

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
URL). The public Worker is configured with `PUBLIC_BYOK_ONLY` so that:

- Shared host `ANTHROPIC_API_KEY` / `AI_GATEWAY_URL` are not used for visitor
  attribution (server secrets are ignored when the flag is on).
- Credential-less attribution returns **`400 byok_required`** before any run is
  dispatched (verified live 2026-07-18).

BYOK credentials are request-scoped: they are not written into investigation
rows, evidence packets, or R2 artifacts. Prefer headers over query strings for
tokens and keys. Optional "remember" in the web UI stores credentials in
**browser localStorage** on the visitor's device only, not on the host.

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

### What the code does today

| Action | Effect |
|--------|--------|
| Soft-remove a seed | Sets `removed_at` on that seed; investigation stays |
| Seal an investigation | Status `sealed`: write path closed; data retained |
| **`DELETE /investigations/:id`** (active only, with capability token) | Purges investigation-scoped MySQL tables (seeds, features, runs, jobs, manifests sidecars, etc.) and deletes investigation-scoped archive keys under the investigation prefix |
| Content-addressed blobs | Objects under R2 **`sha256/...`** are **global and deduplicated**. They are **not** deleted on investigation DELETE. A second investigation that ingested the same bytes still needs them for hash re-verify |

This is intentional for reproducibility (paper section 3.1): the same content
hash always maps to the same stored bytes. Deleting an investigation removes
**your graph and your pointers**, not necessarily every byte that ever appeared
in your ingest if those bytes are shared by content address.

There is **no automatic time-based purge**. Until you call DELETE (or the host
retires the instance), investigation rows and associated non-deduplicated
objects remain.

### What visitors should assume

1. **Default retention is indefinite** on the hosted instance for investigation
   metadata and non-deduplicated data, subject to host operational needs and
   abuse response (see [ACCEPTABLE-USE.md](ACCEPTABLE-USE.md) and
   [contact.md](contact.md)).
2. **You can delete an active investigation** via the API (`DELETE
   /investigations/:id` with the capability token) or ask the host via
   `common-thread@skyphusion.org` if you lost the token (recovery is not
   guaranteed; the host stores only the token hash).
3. **After DELETE, `sha256/` blobs may still exist** on the host. Do not ingest
   material you require to be erasable to zero on the host.
4. **Sealed investigations** are read-only and are not removed by soft-delete of
   seeds; use hard DELETE while still active if you need removal.

**OPEN (policy, optional counsel):** a fixed calendar retention window (e.g. N
days after last access) is not implemented. If the host later adds one, this
section will be updated.

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

**Status:** Active disclosure for the hosted instance (updated Sprint A / #187).
Not a statute certification. Controller/processor framing and any fixed
retention calendar remain **OPEN** for Conrad (and counsel if the instance is
offered at scale).

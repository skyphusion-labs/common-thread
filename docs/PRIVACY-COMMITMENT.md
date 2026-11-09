# The privacy commitment

> **This document is canonical at the constellation hub, and only there.**
> Read it at
> [`vivijure docs/legal/PRIVACY-COMMITMENT.md`](https://github.com/skyphusion-labs/vivijure/blob/main/docs/legal/PRIVACY-COMMITMENT.md).

The privacy commitment is **product-wide**. It covers every product Skyphusion Labs ships (the
Vivijure constellation, Postern, Prism, Slate, and Common Thread), so it lives at the hub in one copy
and every product repository points at it rather than carrying its own. A commitment that exists in
seven places is a commitment that will eventually say seven different things.

This file is a pointer so they can never drift. Do not paste the text here.

## What it says, in one line

Privacy, autonomy, and agency are the primary goal, ranked above feature completeness rather than
traded against it; when a feature cannot be built without violating that, **we drop the feature, not
the line**; public source is the audit mechanism that makes the promise checkable; and the CSAM and
NCII bright line is the one stated exception.

## How it applies to Common Thread now

**Common Thread is self-host only.** Skyphusion Labs retired all Common Thread hosting on
2026-11-09. Nobody runs an instance on the project's behalf, the project collects no data through
one, and there is no hosted API. So the commitment's self-host argument applies here in its plain
form: there is no hosted instance, so there is no Common Thread user data at Skyphusion Labs.

What the commitment asks of this repository is therefore what it asks of every self-host product:
keep the source public so the promise stays checkable, keep the code to what the product
mechanically needs, and say plainly what the code does with data so that an operator can write an
honest disclosure. [PRIVACY.md](PRIVACY.md) is that description.

**If you run an instance, the data path is yours.** The code still holds investigation material,
derived features, results and packets for whoever deploys it, and that is investigative material
about real accounts, more sensitive than most of what the code family handles. The design choices
below survive in the code and are yours to keep or drop.

## The design choices that survive in the code

- **Bring your own credentials.** Attribution runs on the practitioner's own AI credentials, read
  from the request, used for that request, and never written to a database or a log. The
  `PUBLIC_BYOK_ONLY` setting makes an instance **fail closed** when no caller credential is
  supplied, rather than silently billing a house key. That is Section 1.2 of the commitment applied
  to a real decision: the easier product fronted a shared key and metered usage, and the code
  chose the friction instead.
- **Content encryption keyed to the access token.** The analytic payload of an investigation is
  encrypted under a key derived from the token and never stored, so an operator cannot read it.
  The boundary is partial and [PRIVACY.md](PRIVACY.md) section 6 says exactly where
  ([#331](https://github.com/skyphusion-labs/common-thread/issues/331) records the gap between the
  shipped boundary and the stated model).

## The tripwire

**If any future hosting of this code by Skyphusion Labs persists a caller's model credentials, logs
them, backfills server-side credentials into a caller-driven request, or retains investigation
material beyond what the product needs to function, the commitment stops being true, and whoever
ships it owns updating the canonical document in the same PR.** Re-hosting at all is itself a change
to the canonical table and owes the same PR. See the canonical copy for the full set of drift
tripwires.

## History: the hosted era

From v0.1.2 until 2026-11-09 Skyphusion Labs ran a public instance at
`common-thread.skyphusion.org`, offered as a public good so that someone who could not stand up
their own deployment was not locked out. That put this repository in a small minority of products
where Skyphusion Labs was in the data path, and the earlier revision of this file said so rather
than reach for the self-host argument. The instance was torn down on 2026-11-09;
[PRIVACY.md](PRIVACY.md) records what that is and is not confirmed to have destroyed.

> The canonical table at the hub listed Common Thread among the hosted products. That row is now
> history and the hub document owes an update; it is flagged, not changed from here.

## Status: the policies for this repository

- [ACCEPTABLE-USE.md](ACCEPTABLE-USE.md) is a statement of the methodology's use limits, addressed
  to practitioners and operators; it was the hosted instance's active policy until 2026-11-09.
- [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md) say what applies now (nothing is collected;
  the AGPL-3.0-only license is the whole contract for the code) and keep the hosted-era drafts as
  historical record. The draft terms were never in force. The DECISION and COUNSEL markers in
  those drafts stay as a record of what was open when the instance was retired.

This file is a pointer to a commitment, not a substitute for those policies. Where a policy and the
code disagree, the code is what actually happens, and the policy is the defect.

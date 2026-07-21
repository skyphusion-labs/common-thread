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

## Why the pointer sits here, and why this repo is unusual

**Common Thread is one of exactly two products Skyphusion Labs hosts** (the other is the Vivijure
hosted instance). Everything else we make is strictly self-host, permanently. Both hosted instances
are offered deliberately, **as a public good**: they exist so that someone who cannot stand up their
own deployment is not thereby locked out. They are not the business model.

That puts this repository in a small minority: **we are actually in the data path here.** The
commitment's self-host argument ("there is no hosted instance, so there is no user data at
Skyphusion Labs") does not apply, and reaching for it would be a lie. What applies instead is the
harder version: we hold real material, so we say exactly what, and we keep it to what the product
mechanically needs.

For the public instance at `common-thread.skyphusion.org`, that means we hold the investigation
material you upload, the features extracted from it, attribution results, and the evidence packets
it generates. This is investigative material about real accounts, which makes it more sensitive than
most of what we handle, not less.

## The one thing we deliberately do not hold

**Attribution runs on your own Anthropic credentials, and we never hold them.** The key is read from
the request, used for that request, and never written to a database or a log. The public instance
carries no shared model key at all, so attribution **fails closed** until you supply your own rather
than silently billing to a house account.

That design is Section 1.2 of the commitment applied to a real decision: the easier product would
have fronted a shared key and metered usage. Not holding your credentials was worth the friction of
making you bring one.

## The tripwire

**If this instance ever persists a caller's model credentials, logs them, backfills server-side
credentials into a caller-driven request, or begins retaining investigation material beyond what the
product needs to function, the commitment stops being true, and whoever ships it owns updating the
canonical document in the same PR.** See the canonical copy for the full set of drift tripwires.

## Status: the policy for this instance is still owed

**The privacy policy and acceptable-use policy for the hosted instance are drafted but not merged**
([#190](https://github.com/skyphusion-labs/common-thread/pull/190)), and the public-release
readiness evaluation ([#187](https://github.com/skyphusion-labs/common-thread/issues/187)) is still
open, while the instance itself is reachable now.

This file is a pointer to a commitment, not a substitute for that policy. Section 4.4 of the
canonical copy states the same gap rather than hiding it, and both come out when #190 lands.

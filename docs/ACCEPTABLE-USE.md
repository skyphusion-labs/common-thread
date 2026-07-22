# Acceptable use (hosted instance)

**DRAFT for Conrad's review. Not legal advice.** This document restates, in
operational terms, the audience and use limits the methodology paper already
sets (paper section 1.2 and section 10). It applies to the hosted instance at
[common-thread.skyphusion.org](https://common-thread.skyphusion.org). Self-hosted
deployments are governed by the AGPL-3.0 license and by the operator's own
conscience; the methodology's commitments still describe what it means to run
"Common Thread" honestly (section 10.8).

## The core limit

Common Thread attributes coordinated inauthentic behavior to a **cluster** from
public behavioral signals. It stops at cluster-level attribution **by design**
and **never identifies natural persons** (section 3.3.3). Any use that tries to
push past that line, or that points the tool at people it is not for, is outside
acceptable use.

The methodology is honest that its safeguards are **partial**: cluster-only
output, declination by default, excluded signal categories, and audience
exclusions "make casual misuse harder. They do not eliminate misuse, and they
cannot" (section 10). Acceptable use depends on the practitioner, not on a
technical gate.

## Who this is for

The methodology serves under-resourced practitioners doing legitimate work:
pro se litigants documenting coordinated harassment, small newsrooms
investigating coordinated inauthentic behavior, OSINT researchers, academics, and
trust-and-safety teams at smaller platforms (section 10.6).

## Who this is NOT for (protected populations)

Paper section 1.2 and section 10.2 name populations the methodology refuses to be
used against. Attribution that would out, link, or unmask these people is a
**prohibited use** of the hosted instance:

- **Domestic-abuse survivors** using multiple accounts as a safety strategy
  (section 10.2.1).
- **LGBTQ people in unsafe jurisdictions** whose separate accounts are a safety
  mechanism (section 10.2.2).
- **Political dissidents** organizing under pseudonyms against state retaliation
  (section 10.2.3).
- **Witnesses, whistleblowers, and journalistic sources** (section 10.2.4).
- **Recovery-community members and mental-health support seekers**
  (section 10.2.5).
- **Children and minors -- a categorical exclusion.** The methodology offers no
  benefit that could outweigh the harm of misuse here. Encountering a
  minor-operated account is a **stop condition** (section 10.2.6).
- **Trans and gender-variant people**, including linking pre- and
  post-transition identities (section 10.2.7).
- **Sex workers** maintaining separated work/civilian accounts for safety
  (section 10.2.8).

If the operators you are investigating would, on reading the methodology,
recognize themselves as a protected population rather than as
coordinated-inauthenticity actors, your use is outside the intended audience
(section 10.7).

## Prohibited uses

Do not use the hosted instance to:

1. **Identify or attempt to identify a natural person** from a cluster, or bridge
   cluster attribution to an offline identity (section 3.3.3, section 10.5).
2. **Target any protected population** listed above (section 1.2, section 10.2).
3. **Investigate accounts operated by minors**, or continue an investigation that
   surfaces minor-operated accounts (section 10.2.6).
4. **Treat outputs as verdicts.** "Strongly consistent" is not "proven"
   (section 3.2.2). Presenting the tool's bands as proof of identity misrepresents
   the methodology.
5. **Pursue a personal grievance.** A practitioner whose "coordinated network" is
   calibrated to find what they want to find, or who is feeding a personal
   conflict, is operating outside the methodology (section 10.3).
6. **Exploit incidental discovery.** Sensitive matter that surfaces outside the
   investigation's stated scope (health, recovery, identity, immigration,
   employment) is not yours to capture, introduce, or publish (section 10.5).
7. **Misrepresent the methodology.** Publishing attribution the methodology
   declined to support, or lowering thresholds while presenting the result as
   "Common Thread," is disavowed (section 10.8).
8. **Scrape outside the defended contexts.** The methodology defends collection
   against platform terms of service only in the specific contexts it supports
   (section 10.4). Uses outside those contexts do not inherit that defense and
   need their own justification. Do not use the hosted instance to build
   collection pipelines for out-of-scope purposes.

## Practitioner responsibilities

Before running an investigation, the methodology asks you to engage with the
questions in section 10.7. In particular:

- **Honor declination.** When the methodology returns `insufficient`, accept it
  rather than seeking to manufacture attribution by other means.
- **Keep investigations bounded** to their stated scope, even when the data
  surfaces other matters.
- **Be prepared to defend the methodology's limits** in adversarial settings
  (court, publication), including conclusions less favorable to you than other
  methods might produce.
- **Consult counsel** before relying on outputs in legal filings; the
  methodology produces cluster-level claims, not admissible identity evidence,
  and admissibility predicates are the practitioner's responsibility
  (section 3.2.3).

## Enforcement (be honest about the ceiling)

The methodology's safeguards are largely **moral and reputational**, not
technical (section 10.8). The hosted instance cannot inspect a practitioner's
intent and cannot technically prevent a determined misuser who controls their own
practitioner role.

What the host **can** do, and will do, on credible reports of misuse:

- **Revoke** the offending investigation's capability token and access.
- **Rate-limit or block** abusive callers.
- **Decline** to support the use and, where appropriate, disavow it publicly
  (section 10.8): a forked or altered deployment that strips these commitments is
  not Common Thread, regardless of how it presents itself.

The host does not thereby take on a duty to police every use, and the absence of
enforcement in a given case is not endorsement.

## Reporting misuse

Report misuse of the hosted instance, or an acceptable-use violation, to
`common-thread@skyphusion.org` with subject prefix `[ABUSE]`. See
[contact.md](contact.md) for what to include and how the host responds.

## Relationship to other documents

- [PRIVACY.md](PRIVACY.md) -- what the hosted instance retains.
- [contact.md](contact.md) -- security and abuse channels.
- Paper section 1.2 (audience), section 3 (evidentiary framework), section 10
  (ethics) -- the canonical statements this document restates.

---

**Status:** DRAFT (Ernst, #187). This restates the paper's commitments for the
hosted instance; where it and the paper differ, the paper governs.

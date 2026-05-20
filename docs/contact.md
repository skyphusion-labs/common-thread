# Contact

This file specifies how to contact the project for different purposes. Most inquiries should use the public channels; private contact is reserved for the cases where public discussion is not appropriate.

## Public inquiries

**GitHub issues** are the default channel. Use them for:

- Bug reports against the reference implementation
- Methodology questions and clarification requests
- Feature suggestions and discussion of open problems from the paper's §11
- Proposed extensions to the methodology
- Documentation improvements
- General discussion of the project

Public issues are visible to all readers of the repo and produce a record that other practitioners can search and learn from. They are preferred for any inquiry that does not require private handling.

## Private inquiries

For inquiries that should not be public, use email:

**common-thread@rockenhaus.net**

Use this address for:

- Sensitive case consultation (whether a proposed application of the methodology meets the methodology's standards)
- Coordination on methodology extensions before public discussion
- Security disclosures regarding the reference implementation
- Journalism and academic inquiries that require pre-publication discretion
- Legal review questions where preliminary discussion is appropriate before public engagement

Response times are bounded. The maintenance posture described in the README applies: the author is not a full-time maintainer, and response may take days or weeks. For time-sensitive matters, indicate the time-sensitivity in your subject line.

## What to send and what not to send

**Send:**

- A brief description of what you want to discuss, in the body of the email
- The minimum context necessary to evaluate whether the inquiry is appropriate for this project
- A statement of any time-sensitivity that applies

**Do not send unsolicited:**

- Documents containing personal identifying information (PII) of any party
- Case-specific filings or pleadings from active litigation
- Witness statements, declarations, or affidavits
- Source-protected journalistic material
- Documents covered by attorney-client privilege, work-product doctrine, or equivalent protections in your jurisdiction
- Detailed information about specific accounts or networks you suspect of coordinated inauthentic behavior

If the inquiry develops to a point where sharing such material is appropriate, that will be discussed and agreed before any such material is sent. Sending sensitive material unsolicited creates obligations on the recipient that may be inappropriate to the relationship and may compromise the inquirer's own interests.

## What this project is not

To prevent inquiries that the project is not equipped to handle:

**The author is not an attorney.** Nothing in this repository, the methodology paper, or correspondence with the author constitutes legal advice. Practitioners using the methodology in legal contexts should consult licensed counsel in their jurisdiction.

**The author is not a licensed investigator.** The methodology is published as a documented practice, not as a service offering. The author does not conduct investigations on behalf of inquirers, does not accept retainers, and does not produce findings to specification. Practitioners who need investigations conducted on their behalf should engage licensed professionals.

**The author is not a mental health professional.** Inquiries that include indications of crisis should be redirected to appropriate professional resources in the inquirer's jurisdiction. For US-based inquirers, the 988 Suicide and Crisis Lifeline is available; the Crisis Text Line is available by texting HOME to 741741.

**The author is not a journalist.** Inquiries about specific networks or operators that would constitute investigative-journalism work are not within the project's scope. The methodology is intended to support such work by others, not to substitute for it.

## Encrypted communication

For inquiries that warrant encrypted communication beyond email transport security, the author can establish a Signal or PGP channel after initial email contact. Do not include the encrypted-channel request in unencrypted email beyond the request itself; specific channel details are exchanged after initial contact establishes that encrypted communication is appropriate.

The reference implementation's repository does not currently publish a PGP key. Practitioners requiring strong cryptographic identity verification before initial contact should consult with the author through a mutually trusted third party.

## Coordination with the author's other work

The methodology was developed during the author's pro se litigation in Michigan state court. The author's litigation is a matter of public record but is not the subject of this project, and inquiries about the litigation itself are not the project's purpose. Practitioners who wish to discuss the methodology in light of similar litigation should focus the conversation on the methodology rather than on the author's specific case.

Conversely, the author's litigation does not give the author authority to consult on other practitioners' cases. The methodology is published for general application; the author's familiarity with one application does not generalize to expertise in other applications.

## Scope of consultation

When private consultation does occur, the appropriate scope is:

- Whether a proposed application of the methodology falls within the methodology's intended use (§1.2 of the paper)
- Whether a proposed worked case study meets the methodology's anonymization standards (§9 of the paper)
- Whether a proposed methodology extension is consistent with the methodology's commitments (§3 and §10 of the paper)
- Coordination on contributions to the reference implementation

Out-of-scope:

- Evaluating specific evidence in active cases (this is investigation, not methodology consultation)
- Producing attribution outputs against specific accounts on the inquirer's behalf
- Generating expert reports or court declarations
- Litigation strategy

For out-of-scope inquiries, the response will redirect to appropriate professional resources rather than attempt to provide the inquiry's requested output.

## Bug reports for the reference implementation

Security-sensitive bug reports should use the private email channel and use the subject prefix `[SECURITY]`. Non-security bugs should use public GitHub issues.

The reference implementation has no SLA for security response. Severity is assessed on a case-by-case basis; vulnerabilities that affect the methodology's commitments (chain of custody integrity, attribution-output integrity, audience-exclusion enforcement) are prioritized over vulnerabilities that affect convenience or non-critical functionality.

---

**Last updated:** 5/19/2026

**Project status:** v1 in active stabilization; see README for maintenance posture.

# 8. Output and reporting

This section states how outputs from §7 become evidence packets. It states how those packets are used in court, journalism, academic publication, and an internal investigation. It also states the rules for publication when the operator may read the paper and the findings.

This section is more concrete than the earlier sections. The packet structure is a requirement. The practitioner rules are defaults. A practitioner may depart from a default if the departure is documented.

## 8.1 Evidence packet structure

The evidence packet is the deliverable of a Common Thread investigation. A reader can read it without the archive. The packet still holds the references that let a reader with the archive check every claim against the artifacts.

### 8.1.1 Components

A complete evidence packet has six parts.

**Cover page.** The cover page records the investigation identifier, the investigation date, and the packet date. It records the practitioner, the scope, and the band summary. Scope is the seed-set size, the time window, and the platforms. The band summary is the count of pair claims at each band.

**Narrative.** The narrative holds the attribution claims and their reasons. The form comes from §7.4.2 and is written for a person to read. It includes pair claims, cluster claims, and the alternative explanations the reasoning layer considered. It includes declined pairs and a short note on each declination.

**Signal appendix.** The appendix holds the signal-table rows that the narrative cites. A reader can read the appendix without a database. Each cited row includes the feature identifier, the value, and the confidence flag. It includes the provenance hash, the extractor version, and the timestamps of the computation window. A row that the narrative does not cite is omitted. The appendix witnesses the narrative.

It is not a dump of the signal table.

**Manifest extract.** The extract is the manifest entries for artifacts that contributed to the cited signals. The full manifest may be large. The packet includes only the entries that support the cited claims. If the original manifest is signed, the extract keeps that signing. The signature still validates against the extracted entries.

**Method metadata.** This part records the extractor versions, the model name, and the model version. It records the prompt version and the randomization seed, where a seed applies. It records every other parameter needed to reproduce the attribution run. This part is the reproducibility envelope. A reader with the archive and these parameters can recompute the signal table and run the same reasoning.

**Method reference.** This part points to this paper at one version and to the reference implementation at one commit. The pointer is an identifier. The packet does not embed the paper or the implementation. The reader can retrieve both from the cited locations.

### 8.1.2 Format

The reference implementation writes the packet as Markdown and as PDF. Markdown is the canonical source. The PDF is the rendered form for a court filing and for any context that needs a rendered file.

The PDF is built from the Markdown source. The reference choice is wkhtmltopdf with stylesheets. Another practitioner may use another renderer. The rendered file must keep the structure of the Markdown source. The rendering must be reproducible from that source.

A court filing system may require a specific PDF form. Examples are PDF/A, a required font, a required margin, and embedded fonts. The PDF should meet the rules of that filing system.

### 8.1.3 Signing

The packet is signed when the manifest is signed. The signature states that the packet matches the investigation by the named practitioner at the named time. A court packet must be signed. A packet published in an adversarial context must be signed. A signature is recommended for an internal investigation. It is not required there.

The reference implementation supports a detached Ed25519 signature. The signature covers the canonical Markdown form. A reader can check that signature against the PDF only when the renderer is reproducible. If the renderer is not reproducible, sign the source. Do not sign the output.

### 8.1.4 Self-containment versus archive reference

A reader in an adversarial context can read the packet without the archive. The reader can read the narrative, review the signals, and evaluate the method.

A check of the claims still needs the archive. The reader retrieves artifacts by their provenance hashes. The archive must be available for a check on reasonable terms. In court, that usually means production under subpoena or under the discovery rules of that jurisdiction.

Plan archive access at the start of the investigation. An archive on infrastructure the practitioner does not control can fail the reproducibility rule. The same failure occurs if the infrastructure will not last for the relevant proceeding.

## 8.2 Court filings and internal investigation

A method output may or may not belong in a court filing, a news report, or another adversarial context. The practitioner decides what to include. This subsection states the considerations.

### 8.2.1 What is appropriate for court filings

A claim at the consistent band or the strongly consistent band is a substantive output. It is appropriate in a filing when the case needs evidence of coordinated activity. A claim at the insufficient band is not a finding. Do not present it as a finding. It records that the method was applied to that pair and did not attribute.

Cite the narrative as output of the method. Do not cite it as the practitioner's standalone testimony. The practitioner is the witness who applied the method. The method is the tool. The distinction matters where a court treats method testimony differently from lay opinion.

State the alternative explanations from §7.4.3 in the filing. A filing that omits them misrepresents the output. The reasoning layer was required to consider them.

State the limits in §3.3. A filing that presents the output as certainty misrepresents the method. The same is true of a filing that hides the cluster limit. The method does not identify a natural person.

### 8.2.2 Expert testimony considerations

A practitioner who testifies about a Common Thread output faces a qualification question. The method does not require one credential. The practitioner who ran the investigation is best placed to testify about that application. Testimony about the method itself needs familiarity with this paper and with the reference implementation. That testimony covers what the method does, why it works, and where it stops.

The method is published and free to read. That fact supports expert testimony where public availability is a reliability factor. A *Daubert* jurisdiction, or a similar standard, needs its own analysis. The method meets the basic factors. They are testability, publication as review, a known error mode through declination, and public availability. Application to one case depends on the jurisdiction and on the case.

Consult counsel before you rely on an output in an adversarial proceeding.

### 8.2.3 What stays internal

Some outputs belong in internal use and not in an external presentation.

**Insufficient pair results** record that the method was applied and did not attribute. They show that the practitioner did not select only favorable pairs. They are not findings. Do not present them as findings.

**Working notes** are not part of the packet. They include narrative drafts, exploratory queries, and notes on scraper behavior. They document the process. They are not the output.

**Failed reasoning runs** did not pass validation under §7.2.2. The reference implementation keeps them in the manifest for audit. They are not shown to the practitioner as findings. They do not belong in a packet.

**The raw archive** is usually too large for the packet. The manifest extract points at the archive. The archive is produced under the discovery rules or the production rules that apply.

### 8.2.4 Adversarial party access

In court, an adverse party will usually receive the packet. That party may also seek the archive. The method expects this exposure. The deterministic layer can be recomputed. An adverse party can rebuild the signal table and check that the method was applied correctly.

An adverse party cannot easily rebuild the §7 narrative and get the same text. That layer is non-deterministic. Section 3.4.2 states this limit. The party can still run the reasoning layer on the same signal table with the same prompt version. The party can then compare outputs. That comparison is the reproducibility the method promises at that layer.

Expect a challenge to specific choices. Examples are the function-word list, the response-latency threshold, and the perceptual-hash threshold. The practitioner should be ready to defend those choices. The metadata in §8.1.1 is the basis for that defense.

## 8.3 Publishing conventions

Outside court, the conventions of the field apply together with the commitments of the method. The contexts are academic publication, journalism, community reporting, and an internal corporate disclosure.

### 8.3.1 Academic publication

An academic report of a method output cites this paper and the reference implementation. It discloses the investigation parameters. Those parameters are the extractor versions, the model name, the model version, the prompt version, and the schema version. The metadata field in §8.1.1 supports that disclosure.

An academic publication may also need an ethics review. In the United States that review is often an IRB review. Other places use an equivalent process. The limits on natural-person identification (§3.3.3 and §4.8.3) and the audience limits in §1.2 fit most ethics frameworks. They do not replace the review. Start that review when you design the investigation.

Do not wait for publication.

Peer review usually requires that another researcher can repeat the investigation from the published material. The reproducibility rules support that requirement. Publish the packet and the metadata. Where data-sharing rules allow it, publish the archive. Where they do not, publish instructions that are sufficient to reconstruct the archive.

### 8.3.2 Journalism

A newsroom that uses a method output usually applies editorial review. That review includes legal review for defamation, source protection, and the practice of asking a named subject for comment before publication.

Cluster attribution does not name a natural person. It supports a report that the network shows coordinated behavior. It does not support a report that a named individual operates the network. A step from the cluster to a natural person is work outside the method (§3.3.3). Journalistic standards govern that extra work.

Another journalist with the archive can recompute the signal table and reach the same cluster conclusion. That property supports collaborative reporting and a later fact check.

### 8.3.3 Pro se litigation

A pro se litigant publishes the output by filing it. A filed packet is usually a public record. It becomes part of the docket.

The audience limits in §1.2 matter here. A filing against a former intimate partner can be a real dispute and still be the wrong use. Pause and apply the test in §1.2. The method documents coordinated inauthentic behavior. It is not a tool to unmask a person whose pseudonym is a safety measure.

When the use really is coordinated harassment, or coordinated inauthentic behavior, in litigation, the method supports the filing. The archive rules in §3.1 and §5.4 support the custody standard of a civil case. The published method supports cross-examination. The declination rule (§3.2.1 and §7.3.2) is the position when the signals do not support a claim.

### 8.3.4 Internal investigation

A trust and safety team, a corporate investigation, or a similar group may use the method with no external publication. The packet is still an audit trail. An attribution with no documented method is harder to defend.

Internal use does not relax the commitments. The audience limits, the ban on natural-person identification, and the declination rule still apply.

### 8.3.5 Redaction conventions

In every publishing context, redact these categories from a published packet.

**Witnesses and victims** who are not the operators should be redacted unless they consent. The method may use a witness basis statement or a witness list of seed accounts. The witness identity is usually unnecessary. Do not expose it without consent.

**Control accounts** from §5.1.4 should be redacted unless the published claim needs them. A control is method hygiene. The identity is usually irrelevant to the claim.

**A quotation** that would identify the natural person behind a cluster should be paraphrased or summarized. A unique phrase crosses the boundary in §3.3.3.

**Personal data in artifacts** should be redacted from a published packet. Examples are a full name, an address, a phone number, and financial data that appears in a post. The archive may keep that data for completeness. The published packet should not.

## 8.4 Adversarial disclosure

The method assumes that an operator of an attributed network will read this paper, the reference implementation, and a published finding. That assumption shapes the output and the practitioner's posture.

### 8.4.1 What operators learn from reading the methodology

An operator who reads this paper learns the following facts.

- The operator learns which signals the method uses.
- The operator learns which signals the method excludes.
- The operator learns the band thresholds and the declination rule.
- The operator learns the packet format and how a reader can check it.
- The operator learns the known failure modes in §7.6.

Some of that knowledge helps an operator adapt. Section 3.3.4 states that adaptation. The same section states the limits of adaptation. Many signals are hard to defeat while the network stays useful. A later investigation can compare signals and see the change.

Some of that knowledge helps a reviewer, a judge, or another reader of the packet. The reader sees the declination rule, the duty to consider alternatives, and the ban on natural-person identification. That visibility is an argument for publication. A hidden method would be harder to defend.

### 8.4.2 Operator counter-narratives

An operator may answer a published output with a counter-narrative. Common patterns follow.

**A challenge to the method.** The operator says the method is unreliable. The response is this paper, the reference implementation, and the custody chain. A third party can check the application.

**A challenge to a parameter.** The operator says a threshold was unfavorable. The response is the recorded parameter in the packet metadata. A reviewer can evaluate the choice.

**A new alternative explanation.** The operator states an explanation that fits the signals and that the reasoning layer did not consider. Section 7.4.3 already requires the common alternatives. A new alternative is input to a later investigation. It is not, by itself, a refutation of the current one.

**A counter-investigation of the practitioner.** The operator publishes claims about bias, motive, or method. The response is to stay with the signals and the method. The method is not a defense against a personal attack.

### 8.4.3 Reading the methodology as design constraint

The expectation of an adversarial reader shapes decisions in this paper.

The declination rule (§3.2.1 and §7.3.2) assumes that an operator will learn the rule and will try to stay under it. A sophisticated operator can produce signals at the lowest band. The method is more useful against operators who do not invest in that work.

The exclusions in §4.8 are explicit in part so a legitimate pseudonymous operator does not think the method targets them. A reader of §4.8 can see that the method is not for that use. That is the audience work of §1.2, applied to signals.

The reproducibility rules in §3.4 let an operator who challenges a claim check the application. That check is more useful to the practitioner's credibility than a claim the operator cannot check.

The method is meant to stay useful when an adversary reads it. That property is the strongest argument for publication.

## Closing

Output and reporting is where the discipline of the method meets the context of use. The packet is the deliverable. The publishing rules are the practical guidance. Adversarial disclosure is a design assumption for both. Understand all three before you rely on an output.

Section 10 returns to ethics in more depth. Section 11 states limits and later work. Section 12 is a short conclusion. The substantive specification ends with this section. What follows is reflection on the character of the method and on its limits.

# 8. Output and reporting

This section specifies how attribution outputs from §7 are assembled into evidence packets, how the packets are used in different downstream contexts (court filings, journalism, academic publication, internal investigation), and what conventions govern publication of methodology outputs in adversarial contexts where the operator of the attributed network may read the methodology and the published findings.

The section is more concrete and prescriptive than the earlier methodology sections. The structure of the evidence packet is specified rather than recommended; the practitioner conventions are stated as defaults that practitioners can deviate from with documentation.

## 8.1 Evidence packet structure

The evidence packet is the deliverable that comes out of a Common Thread investigation. It is self-contained at the level of being readable without access to the archive, while preserving the references that allow a reader with archive access to verify every claim back to the underlying artifacts.

### 8.1.1 Components

A complete evidence packet has six components.

**Cover page.** Investigation identifier, date of investigation, date of evidence packet generation, practitioner identity, scope summary (seed set size, time window, platforms covered), and confidence-band summary (counts of pair claims at each band).

**Narrative.** The attribution claims with their reasoning, in the structured form produced by §7.4.2 but rendered for human reading rather than for machine consumption. The narrative includes pair-level claims, cluster-level claims, the alternative explanations the reasoning layer considered, and the declined pairs with brief notes on the reasons for declination.

**Signal appendix.** The rows from the signal table that the narrative cites, presented in a form readable without database access. Each cited row includes the feature identifier, the value, the confidence flag, the provenance hash linking back to the archive, the extractor version that produced it, and the timestamps that frame its computation window. Rows that are not cited in the narrative are not included in the appendix; the appendix is a witness reference for the narrative's claims, not a dump of the signal table.

**Manifest extract.** A subset of the investigation manifest containing the entries for artifacts that contributed to the cited signals. The full manifest may be large; the packet includes only the entries that are evidentially relevant to the cited claims. The extract preserves the manifest's signing if the original manifest is signed, so the signature still validates against the extracted entries.

**Methodology metadata.** The extractor versions, model identifier and version, prompt version, randomization seed (where applicable), and any other parameters required to reproduce the attribution run. This is the reproducibility envelope; a reader with the archive and these parameters can recompute the same signal table and run the same reasoning.

**Methodology reference.** A pointer to this paper at a specific version and to the reference implementation at a specific commit. The reference is by identifier rather than by inclusion: the evidence packet does not embed the methodology paper or implementation, but the reader can retrieve them from cited locations.

### 8.1.2 Format

The reference implementation produces the evidence packet in both Markdown and PDF. The Markdown is the canonical source; the PDF is the rendered form suitable for court filings and other contexts where rendered output is required.

The PDF is built from the Markdown source through a standard pipeline (wkhtmltopdf with stylesheets is the reference implementation's choice). Other practitioners may use alternative rendering pipelines; the methodology requires only that the rendered output preserves the structure of the Markdown source and that the rendering is reproducible from the source.

Practitioners producing evidence packets for court filings should be aware that court systems vary in their accepted formats. The PDF should comply with the filing system's requirements (PDF/A for systems that require archival-format compliance, specific font and margin conventions where required, embedded fonts where required).

### 8.1.3 Signing

The evidence packet is signed when the underlying manifest is signed. The signature attests that the packet's contents are authentic to the investigation as conducted by the named practitioner at the named time. The methodology requires signing for packets used in court filings and for packets published in adversarial contexts; signing is recommended but not required for internal investigations.

The reference implementation supports detached signatures using Ed25519 keypairs, with the signature on the canonical Markdown form of the packet. The signature can be verified against the rendered PDF only when the rendering pipeline is itself reproducible; practitioners using non-reproducible rendering should sign the source rather than the output.

### 8.1.4 Self-containment versus archive reference

The evidence packet is intended to be readable in adversarial contexts without access to the underlying archive. The narrative can be read, the signals can be reviewed, and the methodology can be evaluated, all without the archive being available.

Verification of the narrative's claims, however, requires the archive. A reader who wants to confirm that a cited signal-table row is supported by the artifacts has to retrieve the artifacts from the archive by their provenance hashes. The methodology requires that the archive be available for verification on reasonable terms; in court contexts, this typically means the archive is produced under subpoena or under the discovery rules of the relevant jurisdiction.

Practitioners should plan for archive accessibility from the beginning of the investigation. An archive stored on infrastructure that the practitioner does not control, or on infrastructure that will not exist for the duration of the relevant proceedings, undermines the methodology's reproducibility commitments.

## 8.2 Court filings and internal investigation

The methodology produces outputs that may or may not be appropriate for inclusion in court filings, journalistic publication, or other adversarial contexts. The decision about what to include is the practitioner's, guided by the considerations in this subsection.

### 8.2.1 What is appropriate for court filings

Attribution claims at the "consistent" or "strongly consistent" confidence bands are the methodology's substantive outputs and are appropriate for court filings when the case requires evidence about coordinated activity. Claims at the "insufficient" band are not findings and should not be presented as such; they are records that the methodology was applied to specific pairs and did not produce attribution.

The narrative in the evidence packet should be cited as a methodology-produced output, not as the practitioner's standalone testimony. The practitioner is the witness who applied the methodology; the methodology is the tool whose output is being introduced. This distinction matters for evidentiary rules in many jurisdictions, particularly those that treat methodology-based testimony differently from lay opinion testimony.

Alternative explanations from the reasoning layer (§7.4.3) should be acknowledged in the filing rather than only in the methodology output. A filing that presents attribution claims without acknowledging the alternative explanations the methodology required the reasoning layer to consider is misrepresenting the methodology's output.

The methodology's limits from §3.3 should be acknowledged. A filing that presents methodology outputs as if they were certainties, or that fails to acknowledge that the methodology produces cluster-level attribution rather than natural-person identification, is misrepresenting the methodology's commitments.

### 8.2.2 Expert testimony considerations

Practitioners testifying about Common Thread outputs in court face the question of who is qualified to do so. The methodology does not require a specific credential; the practitioner who conducted the investigation is in the best position to testify about how the methodology was applied in that investigation. For testimony about the methodology itself (what it does, why it works, what its limits are), familiarity with this paper and with the reference implementation is the relevant qualification.

The methodology is published and freely available, which supports expert testimony in jurisdictions that consider the public availability of the methodology as a reliability factor. Practitioners testifying in jurisdictions that apply *Daubert* or similar reliability standards should be familiar with how those standards apply to published methodologies; the methodology meets the basic factors (testability, peer review through publication, known error mode through the declination rule, public availability) but the application of these factors to a specific case is jurisdiction-dependent and case-specific.

Practitioners should consult counsel about expert testimony requirements in their specific jurisdiction before relying on methodology outputs in adversarial proceedings.

### 8.2.3 What stays internal

Several categories of output from a Common Thread investigation are appropriate for internal use but not for external presentation.

**Insufficient pair results** are records that the methodology was applied and did not produce attribution. They are useful for investigation completeness (showing that the practitioner did not selectively apply the methodology to favorable pairs) but they are not findings and should not be presented as if they were.

**Working notes** that practitioners accumulate during investigation are not part of the evidence packet. They include drafts of narratives, exploratory queries against the signal table, notes about scraper behavior, and other materials that document the investigation process but are not the investigation's output.

**Failed reasoning runs** are reasoning attempts that did not pass validation per §7.2.2. They are recorded for audit purposes (the reference implementation retains them in the investigation manifest) but they are not surfaced to the practitioner as findings and they should not appear in evidence packets.

**The raw archive** is typically not part of the evidence packet because it is too large. The manifest extract in the evidence packet provides the references that link to the archive; the archive itself is produced separately under whatever discovery or production rules apply.

### 8.2.4 Adversarial party access

In court contexts, adversarial parties will typically have access to the evidence packet and may seek access to the underlying archive. The methodology is designed for this exposure; the reproducibility properties of the deterministic layer mean that adversarial parties can recompute the signal table and verify that the methodology was applied correctly.

What adversarial parties cannot easily do is recompute the attribution reasoning at §7 and produce identical narratives, because the reasoning layer is non-deterministic. The methodology in §3.4.2 acknowledged this. Adversarial parties can, however, run the reasoning layer against the same signal table with the same prompt version and compare outputs, which is the form of reproducibility the methodology promises at that layer.

Practitioners should expect adversarial parties to challenge specific signals (the function-word list was inappropriate for the corpus, the response-latency threshold was too lenient, the perceptual hash threshold was too strict), and the practitioner should be prepared to defend these parameter choices. Documenting the parameter choices in the methodology metadata at §8.1.1 provides the basis for these defenses.

## 8.3 Publishing conventions

When methodology outputs are published outside the court context (academic publication, journalism, community reporting, internal corporate disclosure), the publishing conventions of the relevant field apply alongside the methodology's commitments.

### 8.3.1 Academic publication

Academic publication of methodology outputs typically requires citation of this paper, citation of the reference implementation, and disclosure of the investigation parameters (extractor versions, model identifier and version, prompt version, signal-table schema version). The methodology supports academic publication conventions through the methodology metadata field in the evidence packet (§8.1.1).

Academic publications may also need to satisfy ethics-review requirements (IRB approval in the US; equivalent processes elsewhere). The methodology's commitments around natural-person identification (§3.3.3, §4.8.3) and the audience exclusions (§1.2) align with most ethics frameworks but do not substitute for the ethics review itself. Academic practitioners using the methodology should engage their ethics review process at the investigation-design stage, not at the publication stage.

Peer review of methodology applications typically requires that another researcher could replicate the investigation from the published material. The methodology's reproducibility properties support this; the published material should include the evidence packet, the methodology metadata, and either the archive itself (where data-sharing requirements permit) or sufficient instructions for reconstructing the archive (where data-sharing requirements do not permit direct sharing).

### 8.3.2 Journalism

Journalism using methodology outputs typically operates under editorial review processes that include legal review for defamation exposure, source protection considerations, and the standard journalistic norm of approaching named subjects for comment before publication.

The methodology's cluster-level attribution interacts with journalistic norms in specific ways. A cluster attribution that does not identify natural persons supports reporting that the network exhibits coordinated behavior but does not support reporting that specific individuals are operating the network. Journalism that goes from cluster attribution to natural-person identification is doing additional work outside the methodology (per §3.3.3) and is responsible for that additional work under journalistic standards rather than methodological ones.

The methodology supports journalistic verification: another journalist with access to the archive can recompute the signal table and reach the same conclusions about the cluster attribution. This is a useful property for collaborative journalism and for fact-checking after publication.

### 8.3.3 Pro se litigation

Pro se litigants using the methodology in their own cases are publishing the methodology output by virtue of filing it. Filed materials are typically public record, and the evidence packet becomes part of the public docket.

The audience exclusions from §1.2 are particularly relevant in pro se litigation contexts. A pro se litigant who is in a position to file a Common Thread investigation against a former intimate partner, even when there is a legitimate dispute, should pause and consider whether the methodology is being applied to a use case it is not designed for. The methodology is designed for documenting coordinated inauthentic behavior, not for unmasking individuals whose pseudonymity is part of a safety mechanism.

When the use case is genuinely one of documenting coordinated harassment or coordinated inauthentic behavior in litigation, the methodology supports the filing. The chain of custody provided by the archival posture (§3.1, §5.4) is designed for the evidentiary standards of civil litigation; the published methodology supports cross-examination by opposing parties; the declination rule (§3.2.1, §7.3.2) provides a defensible position when signals do not support attribution.

### 8.3.4 Internal investigation

Trust and safety teams at smaller platforms, internal investigations at corporations, and similar contexts may use the methodology without external publication. The evidence packet still has value in these contexts as an audit trail; an internal investigation that produced attribution claims without documented methodology is less defensible than one that did.

Internal use does not relax the methodology's commitments. The audience exclusions, the natural-person identification exclusion, and the declination rule apply regardless of whether the output is published externally.

### 8.3.5 Redaction conventions

Across all publishing contexts, certain categories of information should be redacted from published evidence packets.

**Identifiers of witnesses and victims** who are not the network operators should be redacted unless they have consented to disclosure. The methodology may use information from witnesses (basis statements, identification of seed accounts) but the witness's identity is typically not necessary for the methodology output and should not be exposed without consent.

**Identifiers of accounts in legitimate communities** that were included in the seed set as controls (§5.1.4) should be redacted unless their inclusion is necessary for the published claim. Controls are methodology hygiene; their identity is typically not relevant to the substantive claim.

**Specific quotations from accounts** that would identify the natural person behind a cluster should be paraphrased or summarized. Quotation that uniquely identifies an individual through their phrasing crosses the cluster-to-natural-person boundary that §3.3.3 places out of scope.

**Personally identifying information visible in archived artifacts** (full names, addresses, phone numbers, financial information visible incidentally in the network's posts) should be redacted from any published evidence packet. The archive may contain this information for completeness, but the published packet should not.

## 8.4 Adversarial disclosure

The methodology assumes that operators of attributed networks will read the methodology paper, the reference implementation, and any published findings about their network. This assumption shapes the design of the output and the practitioner's posture in adversarial contexts.

### 8.4.1 What operators learn from reading the methodology

Operators reading this paper learn several things:

- Which signals the methodology uses
- Which signals the methodology explicitly excludes
- The confidence thresholds and the declination rule
- The format and verifiability of the evidence packet
- The methodology's known failure modes (§7.6)

Some of this information helps operators adapt. The §3.3.4 acknowledgment that operators can adapt is the methodology's response to this learning. The mitigations from the same section apply at the output layer as well: many signals are difficult to defeat while maintaining the operational utility of the network, and the methodology's reproducibility properties mean that adapted behavior in one investigation can be detected in a subsequent investigation by examining how the signals changed.

Some of this information helps reviewers, judges, and other downstream consumers of the evidence packet. Operators reading the methodology see the methodology's discipline around declination, the requirement for alternative-explanation consideration, the structural commitment against natural-person identification. This is the strongest argument for publishing the methodology rather than treating it as a trade secret: the methodology's defensibility against adversarial readers is itself part of the methodology, and concealing the methodology would reduce that defensibility.

### 8.4.2 Operator counter-narratives

Operators may produce counter-narratives in response to published methodology outputs. Common patterns include:

- **Challenging the methodology itself.** The operator argues that the methodology is unreliable. The methodology's response is the published paper, the reference implementation, and the chain-of-custody discipline that allows third parties to verify the application.

- **Challenging specific parameter choices.** The operator argues that the practitioner chose unfavorable thresholds. The methodology's response is the explicit parameter recording in the evidence packet metadata, which lets reviewers evaluate the choices independently.

- **Producing alternative explanations not considered by the reasoning layer.** The operator articulates an alternative explanation that fits the signals. The methodology's response is the alternative-explanation requirement (§7.4.3), which forces the reasoning layer to consider the most common alternatives in advance; new alternatives that the reasoning layer did not consider become inputs to future investigation rather than refutations of the current one.

- **Producing counter-investigations against the practitioner.** The operator publishes claims about the practitioner's bias, motives, or methods. The methodology's response is to remain focused on the signals and the methodology; the methodology is not a defense against personal attack and does not pretend to be.

### 8.4.3 Reading the methodology as design constraint

The expectation of adversarial reading is one of the methodology's design constraints. Decisions throughout the methodology paper are shaped by this expectation:

- The declination rule (§3.2.1, §7.3.2) is calibrated knowing that operators will learn the rule and design behavior to avoid triggering attribution. The methodology accepts that a sophisticated operator can produce signals consistent with the lowest band; the methodology is more useful against the cohort of operators that does not invest in this sophistication.

- The signal exclusions (§4.8) are stated explicitly partly to refuse the operators of pseudonymous-but-legitimate accounts the false impression that the methodology is positioned against them. Operators of legitimate pseudonymous accounts who read §4.8 see that the methodology is not for them; this is the audience-targeting work that §1.2 does at the introduction level, applied at the signal level.

- The reproducibility commitments (§3.4) support adversarial verification by operators who challenge attribution claims. The operator can verify that the methodology was applied correctly, which is more useful to the practitioner's credibility than the operator's inability to verify would be.

The methodology is designed to remain useful when read adversarially. This is not a defensive posture; it is the methodology's strongest argument for being published at all.

## Closing

Output and reporting is where the methodology's discipline meets the practical demands of the contexts in which the methodology is applied. The evidence packet is the operational deliverable; the publishing conventions are the practical guidance; the adversarial-disclosure considerations are the design assumptions that shape both. Practitioners using the methodology should understand all three before producing outputs that they intend to rely on.

The remaining sections of the paper return to ethical considerations at greater depth (§10), document the methodology's limits and future work (§11), and offer a brief conclusion (§12). The methodology's substantive content is complete with this section; what follows is reflection on the methodology's character and limits rather than additional methodological specification.

# 9. Case study

This section is reserved for a worked case study demonstrating the methodology end-to-end: seed selection with basis statements, scope definition, collection, archival, feature extraction, attribution reasoning, evidence packet assembly, and adversarial-context use. The case study is intended to make the abstract methodology concrete for practitioners who learn better from worked examples than from specification.

The case study is not included in this version of the paper. The reasons are specific to the methodology's own ethical commitments rather than to authorial convenience, and they are stated openly here in keeping with the methodology's posture of acknowledging its limits rather than concealing them.

## Why this section is currently a placeholder

The author has a specific investigation in mind for the worked case study. The investigation is the one through which the methodology was developed: a real network, real signals, real attribution claims, and real downstream consequences. Producing a publishable case study from this investigation requires careful work that has not been completed at the time of this paper's release.

**Anonymization at the methodology's own standard.** Section 3.3.3 commits the methodology to cluster-level attribution rather than natural-person identification. A worked case study that names the natural persons in the network would violate this commitment, regardless of whether those persons are public, well-known, or otherwise identifiable through offline investigation. Producing a case study that respects the cluster-level limit requires anonymization that goes beyond redaction: the case study must present the methodology's findings in a form that the methodology itself would produce, which means cluster-labeled accounts rather than named individuals. This anonymization is methodologically straightforward but has not yet been performed.

**The audience-exclusion commitments.** Section 1.2 and Section 10.2 enumerate populations the methodology refuses to support attribution against. The investigation through which the methodology was developed may, in its raw form, touch incidentally on individuals adjacent to the network who fall into protected categories. A case study that surfaced this incidental information would violate the audience exclusions. Producing a case study that respects the exclusions requires careful review of what to include and what to leave out, which has not been completed.

**The incidental-discovery discipline.** Section 10.5 commits the methodology to keeping investigations bounded by their stated scope and refusing to publish information that exceeds that scope, even when the methodology's collection happens to surface it. A worked case study that demonstrated the methodology end-to-end against a real investigation must demonstrate the discipline as well: what was collected but not analyzed, what was analyzed but not published, what was published only because it was germane to the attribution claims. This discipline cannot be reverse-engineered from a finished investigation; it must be applied at the time of case-study construction, and the work has not been completed.

**Adversarial reading by the network operator.** Section 8.4 acknowledges that operators of attributed networks will read the methodology paper and any published findings. A case study based on a real investigation will be read by the network's operator. The methodology accepts this exposure (the discussion in Section 8.4.2 covers the common operator counter-narratives and the methodology's responses), but a case study that prematurely surfaces specific tactical details about the practitioner's ongoing investigation could prejudice that investigation. Timing the case study to avoid this is a judgment call the author has not finished making.

## What the case study will contain when complete

When the case study is published, it will follow the structure that this paper's methodology produces. The structure is fixed in advance to prevent retroactive shaping of the case to fit the methodology.

The case study will include the basis statements for each account in the seed set, anonymized to cluster labels but preserving the operational basis for inclusion. It will include the scope-definition decisions (time bounds, account-scope level, content-scope decisions) with the justifications recorded at the time of investigation. It will include the collection-layer summary (which scrapers, what was archived, manifest signature). It will include a representative subset of the signal table with full provenance back to archived artifacts, demonstrating each of the eight signal categories in §4. It will include the attribution reasoning outputs at the confidence bands the signals supported, with the alternative explanations the reasoning layer was required to consider. It will include the evidence packet that resulted from the investigation and the conventions applied to publishing it (redactions, format, signing). It will include the practitioner's reflection on what the methodology surfaced, what it declined to surface, and what it missed.

The case study will be a single end-to-end worked example. It will not attempt to generalize beyond the specific investigation. Practitioners who learn better from multiple worked examples are referred to the open invitation in the next subsection.

## Open invitation to community case studies

Worked case studies from practitioners other than the methodology's author are welcomed and will strengthen the methodology's practical utility. Practitioners who apply the methodology to investigations they have completed and who can produce publishable case studies under the methodology's commitments are encouraged to contribute them as separate publications citing this methodology paper.

Community case studies should follow the structure outlined above (basis statements, scope, collection summary, signal table extract, attribution outputs, evidence packet, practitioner reflection) and should respect the methodology's anonymization commitments. The author is willing to consult on whether a proposed case study meets the methodology's standards; contributors should treat the author as a reviewer rather than as a co-author, and the case studies remain the contributors' work.

The reference implementation's repository may, at the author's discretion, link to community case studies that meet the methodology's standards. This linkage is curatorial rather than editorial; case studies that are linked are recognized as conforming applications of the methodology, not as endorsed by the author's own positions on the specific investigations they document.

## Reading without the case study

The methodology paper is complete as a methodology specification without the author's reserved §9 case study. A **synthetic** worked example ships in `examples/synthetic-network-case-study.md` for training purposes.

Practitioners who want to apply the methodology before the author's case study is available can do so by following the specification in §3 through §8 and the ethical commitments in §10. The reference implementation provides the operational realization of the methodology that this paper specifies; practitioners who would otherwise wait for the case study can equivalently work from the implementation, the synthetic example, and the methodology specification together.

The case study, when it lands, will be added to a subsequent version of the paper with a clear version-history note. Until then, this placeholder serves to acknowledge what is intended without overpromising what is delivered. The methodology is published in its current form because the methodology body is complete and useful, not because the case study is. Withholding the methodology until the case study is ready would have placed methodology specification behind case-anonymization timing, which is the wrong dependency direction.

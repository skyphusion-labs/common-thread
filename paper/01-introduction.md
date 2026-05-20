# 1. Introduction

This paper describes Common Thread, a methodology for attributing coordinated inauthentic behavior across multiple online accounts to a common operator using only signals observable from the public platform surface. The methodology is intended for pro se litigants, small-newsroom investigative journalists, OSINT practitioners, and academic researchers working on coordinated inauthentic behavior in the post-API-paywall environment, where existing tooling has largely become inaccessible. The paper is accompanied by a reference implementation, released under AGPL-3.0, that demonstrates the methodology end to end. The methodology produces probabilistic attribution claims at calibrated confidence levels with documented chain of custody, not verdicts, and is deliberately scoped to cluster-level attribution rather than natural-person identification. The remainder of this section frames the problem, identifies the intended audience, defines scope and non-goals, and states the methodology's ethical posture up front rather than burying it in a later section.

## 1.1 The problem

Coordinated inauthentic behavior on social platforms has two distinguishable flavors. The first is automated: programs that post on behalf of a controlling operator without human intervention at the per-post level. Detection of this flavor (bot detection) is a mature field. Botometer, BotSentinel, and related tools produce useful classifications at scale; the academic literature on automated account detection has substantial empirical depth. A practitioner who needs to know whether an account is automated has serviceable options.

The second flavor is operated: networks of accounts run by human operators, each post written or selected by a human, but with the network coordinated to produce a desired effect. The accounts pass casual scrutiny as individual users because they are, in the relevant sense, individual users; the inauthenticity is at the network level rather than at the account level. Detection of this flavor (sockpuppet attribution) is not a mature field. The tooling that exists is mostly artisanal: experienced investigators working by hand, often within organizations whose methods are not public. The academic literature is thinner. Commercial tools exist (Graphika, DFRLab, and similar) but are inaccessible to practitioners outside well-resourced institutions.

This gap has practical consequences. Coordinated inauthentic behavior of the human-operated variety appears in contexts where the relevant practitioners do not have access to the commercial tooling. It appears in harassment campaigns directed at individuals, where the target is a private person rather than a research subject. It appears in civil litigation, where parties without commercial OSINT resources need to document coordinated activity for the record. It appears in small-newsroom investigative reporting, where a journalist working on a local or specialized story does not have a research desk to delegate to. It appears in academic work that wants to study coordinated inauthentic behavior outside the small set of cases that have attracted major-platform attention.

The post-API-paywall environment compounds the gap. From 2023 onward, programmatic access to most major social platforms became prohibitively expensive for individual practitioners and small institutions. Tools that previously relied on free or low-cost API access broke or became uneconomical. The community-maintained tooling that had filled some of the gap for non-commercial users either decayed or moved to scraping-based approaches that require their own methodology decisions. The practical effect is that the practitioner gap widened at exactly the moment when coordinated inauthentic behavior of the human-operated kind became more visible.

Common Thread is designed to fill a specific subset of this gap: a documented, freely available, reproducible methodology for human-operated sockpuppet attribution, with a working reference implementation that practitioners can run themselves on infrastructure they control. The methodology does not claim to solve the broader problem of coordinated inauthentic behavior detection. It targets a narrower question (given these N accounts, are any of them operated by the same hand) and refuses to answer broader questions (find sockpuppets in the wild, identify the natural person behind this account) that the methodology is not equipped to handle responsibly.

## 1.2 Who this is for

The methodology is designed for four overlapping practitioner communities.

**Pro se litigants and civil litigation participants** documenting coordinated harassment or inauthentic behavior as part of a case. The methodology's chain-of-custody requirements (§3.1) are designed to produce attribution outputs that can be referenced in court filings, subject to the practitioner's own work establishing additional evidentiary predicates such as admissibility under whichever standard applies.

**Small-newsroom investigative journalists** working without the resources of major outlets or commercial OSINT firms. The methodology's reproducibility requirements (§3.4) are designed to support journalistic standards of evidence: a published investigation should be one that other journalists can verify against the same underlying material.

**OSINT practitioners** working on coordinated inauthentic behavior cases outside the institutional contexts that commercial OSINT tooling assumes. The methodology's signal taxonomy (§4) is designed to be exhaustive enough to support investigations that would otherwise rely on artisanal pattern recognition.

**Academic researchers** studying coordinated inauthentic behavior who want a published methodology to apply, cite, extend, or critique. The reference implementation is intended to support reproducible research; the methodology paper is intended to support citation and methodological discussion.

The methodology is **not for** several use cases that share surface similarity with the targeted ones. The exclusions are not exhaustive; they are illustrative of the boundary the methodology draws.

It is not for targeting pseudonymous individuals whose pseudonymity is itself a safety mechanism. Pseudonymity is a legitimate and often necessary practice for many populations, including domestic abuse survivors who use alternate accounts to avoid an abuser, LGBTQ people in jurisdictions where their identity carries legal or social risk, dissidents in authoritarian states, sex workers, addiction recovery community members, mental health support seekers, witnesses, and whistleblowers. The methodology is designed to detect coordination across accounts, not pseudonymity. The signal categories in §4 are chosen with this distinction in mind; signals that would primarily detect pseudonymous use rather than coordinated inauthenticity are deliberately excluded (see §4.8).

It is not for intimate-partner contexts. The methodology's outputs could in principle be applied to tracking a former partner across accounts. This use case is categorically excluded. The methodology's reference implementation does not check for misuse and cannot enforce the exclusion technically, but the exclusion is stated as a matter of methodological scope, and contributors and forks are expected to honor it.

It is not for unmasking journalists' sources, anonymous tip-line participants, or other parties whose protection depends on attribution being impossible. The methodology is a tool for investigating networks suspected of coordinated inauthentic behavior, not for piercing pseudonymity in general.

It is not for identifying members of communities whose participation depends on identity protection. This includes but is not limited to recovery communities, support groups, identity-related communities in unsafe jurisdictions, and communities organized around legally sensitive activity.

Practitioners considering whether their intended use falls inside or outside this audience should ask a simple test question: would the people whose accounts I am investigating, if they could read this work, recognize themselves as participating in coordinated inauthentic behavior. If the answer is yes, the methodology is likely appropriate. If the answer is no, the methodology is likely the wrong tool.

## 1.3 Scope and non-goals

The methodology, in its first published version, is scoped narrowly. The narrowness is deliberate: a methodology that overreaches into problems it cannot handle well produces unreliable outputs and harms the populations it is intended to serve.

**Scope: closed-world attribution of a seed account set.** Given a set of N accounts identified by the practitioner as potentially coordinated, the methodology produces attribution claims about which subsets within the seed are likely operated by a common hand. The seed set is provided by the practitioner. The methodology does not discover new accounts to add to the seed.

**Scope: cluster-level attribution.** The methodology identifies clusters of accounts that the signals suggest are operated by a common hand. It does not identify the natural person behind a cluster. The latter step requires offline investigation that is outside the methodology's scope and that has different ethical structure (see §3.3.3 and §4.8.3).

**Scope: probabilistic claims at coarse confidence bands.** The methodology produces outputs in three bands: insufficient evidence, consistent with same operator, strongly consistent with same operator. The bands are deliberately coarse to avoid implying a calibration the methodology has not earned.

**Scope: reproducible methodology with reference implementation.** The methodology is published with a working reference implementation. The implementation is designed to be platform-agnostic in architecture and Cloudflare-pinned in the reference deployment, with the deterministic feature-extraction layer portable to other environments.

**Non-goal: open-world sockpuppet discovery.** The methodology does not attempt to find sockpuppets in the wild from a seed of one or two accounts. Open-world discovery is much harder than closed-world attribution and is more ethically fraught because the discovery process produces casualties (accounts incorrectly identified as part of a network) at a higher rate than closed-world attribution. Open-world detection may be addressed in future work; it is not part of v1.

**Non-goal: bot detection.** Practitioners who need to know whether accounts are automated should use Botometer, BotSentinel, or similar tools. Common Thread is designed for the human-operated case; it will not produce useful outputs for automation detection and would be a worse choice than purpose-built tools.

**Non-goal: content-level disinformation tracking.** Practitioners who need to track the spread of specific narratives or pieces of content should use Hoaxy, similar academic tools, or commercial alternatives. Common Thread is account-focused, not content-focused.

**Non-goal: network-level analysis at scale.** Practitioners who need to characterize large networks should use Graphika-class tools or academic graph-analysis tooling. Common Thread is designed for investigations involving tens of accounts, not thousands.

**Non-goal: natural-person identification.** The methodology produces cluster attribution. Identifying the person behind a cluster is out of scope (see §4.8.3). Practitioners who need natural-person identification should do that work using established offline investigative techniques separately from the cluster attribution that the methodology provides.

## 1.4 Ethical posture

Methodologies in this space face an irreducible dual-use problem. The same techniques that identify coordinated harassment networks can be turned against pseudonymous individuals who have legitimate reasons to operate multiple accounts. The same methods that document election-interference operations can be used by stalkers to track victims. The methodology cannot eliminate this duality. It can only state its intended use clearly, design its decision points to discourage misuse, and accept that some misuse is the cost of publishing the methodology at all.

The methodology takes the following positions, stated up front and elaborated in the relevant sections.

**Coarse confidence bands.** The methodology produces three confidence levels rather than fine-grained probabilities (§3.2.1). Practitioners who want a numeric probability are using the wrong tool. Coarse bands resist false precision and the use of methodological outputs as harassment ammunition that depends on appearing more certain than the underlying evidence supports.

**Declination by default.** Below the threshold for the lowest confidence band, the methodology returns "insufficient evidence for attribution." Declination is the correct output when signals do not support a claim; it is the methodology refusing to manufacture certainty (§3.2.1, §7.3).

**No natural-person identification.** The reference implementation has no input for natural-person identifiers and no output that produces them. Practitioners who add natural-person identification on top of the methodology's outputs are doing additional work outside the methodology, with the ethical considerations that attach to that work (§3.3.3, §4.8.3).

**Excluded signal categories.** Section 4.8 enumerates signal categories the methodology refuses to use even when they would strengthen attribution: platform-internal data, signals that primarily detect pseudonymity, signals derived from offline information, direct messages, breach data, facial recognition, voice and video matching. The exclusions are structural rather than implementational; they shape what the methodology is, not just what the current implementation happens to support.

**Audience exclusions are stated.** Section 1.2 names use cases the methodology is not for. The naming is part of the abuse-mitigation surface: it makes intended misuse a violation of the methodology's stated scope, which has consequences for how practitioners present themselves when using the methodology and for how the methodology can be cited in adversarial contexts.

**Practitioners are accountable for downstream use.** The methodology cannot prevent misuse. It can only make trivial misuse harder and shift moral responsibility onto practitioners who choose to use the methodology in ways the methodology disclaims. Practitioners using Common Thread for purposes excluded by §1.2 or contrary to the ethical posture stated here are operating outside the methodology, not extending it.

This posture is unlikely to satisfy readers who expect either stronger technical controls against misuse (which the methodology cannot provide without losing its character as published research) or fewer ethical constraints (which the methodology refuses on the grounds that the dual-use problem is real). The posture is the result of weighing those competing considerations and settling on a position that is honest about its limits.

## What follows

Section 2 surveys related work and positions the methodology against existing tooling and academic literature. Section 3 lays out the evidentiary framework that all subsequent sections assume. Section 4 enumerates the signal taxonomy used to characterize and compare accounts. Section 5 specifies collection methodology. Section 6 describes feature extraction. Section 7 describes attribution reasoning. Section 8 specifies output and reporting conventions. Section 9 walks through a worked case study. Section 10 returns to the ethical considerations at greater depth. Sections 11 and 12 cover limitations, future work, and conclusion. Appendices document the reference implementation, prompt set, signal table schema, manifest format, and glossary.

Readers who want to understand the methodology's commitments before reading the technical sections should read §3 (evidentiary framework) and §4.8 (deliberately excluded signals) together. Readers who want to apply the methodology to an investigation should read §5 (collection methodology) before anything else, since collection decisions made early in an investigation are difficult to reverse later.

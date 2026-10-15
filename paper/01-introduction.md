# 1. Introduction

This paper describes Common Thread. The method attributes coordinated inauthentic behavior across online accounts to one operator. It uses only signals that a person can observe on the public platform surface.

The method is for four groups. They are pro se litigants, journalists in small newsrooms, OSINT practitioners, and academic researchers. They work on coordinated inauthentic behavior after platform APIs became expensive. Many older tools are no longer practical for them.

A reference implementation accompanies the paper. Its license is AGPL-3.0-only. The implementation shows the method from start to end.

The output is a probabilistic claim at a coarse confidence band. It is not a verdict. The scope is a cluster of accounts. The method does not name a natural person.

The rest of this section states the problem, the audience, the scope, and the ethical position.

## 1.1 The problem

Coordinated inauthentic behavior has two kinds.

The first kind is automated. A program posts for an operator. A person does not write each post. Detection of this kind is a mature field. Botometer, BotSentinel, and related tools classify accounts at scale. The research literature on automated accounts is deep.

A practitioner who must know whether an account is automated has usable tools.

The second kind is operated by people. A person writes or selects each post. The accounts are coordinated to produce one effect. A casual reader can take each account for a separate user, because a person does use it. The inauthenticity is in the network, not in one account. Detection of this kind is sockpuppet attribution.

It is not a mature field. Most current practice is manual work inside organizations that do not publish the method. The research literature is thinner. Commercial tools exist, including Graphika and DFRLab. Practitioners outside a well-funded institution usually cannot use them.

That gap has direct effects. Human-operated coordination appears where the practitioner has no commercial tool. It appears in harassment of a private person. It appears in civil cases, where a party must document coordination for the record. It appears in a small newsroom, where one journalist has no research desk. It appears in research that is outside the few cases large platforms already studied.

The loss of cheap APIs makes the gap wider. From 2023, programmatic access to most large platforms became too expensive for an individual or a small institution. Tools that used a free or cheap API broke, or they became too costly. Community tools decayed, or they moved to collection methods that need their own rules. The practitioner gap grew at the same time that human-operated coordination became easier to see.

Common Thread fills one part of that gap. It is a documented method for human-operated sockpuppet attribution. A practitioner can run the reference implementation on infrastructure they control. The method does not claim to solve all detection of coordinated inauthentic behavior.

The question is narrow. Given these N accounts, does one person operate any of them together? The method refuses two wider questions. It does not find sockpuppets in the open. It does not name the natural person behind an account.

## 1.2 Who this is for

The method is for four groups. The groups overlap.

**Pro se litigants and parties in a civil case** who must document coordinated harassment or inauthentic behavior. The chain-of-custody rules in §3.1 support a filing. The practitioner must still meet the admissibility rules of that court.

**Journalists in a small newsroom** who do not have the budget of a large outlet or a commercial OSINT firm. The reproducibility rules in §3.4 support a news standard. Another journalist should be able to check the same material.

**OSINT practitioners** who work on coordinated inauthentic behavior outside the settings that commercial tools assume. The signal list in §4 is broad enough to replace undocumented pattern recognition.

**Academic researchers** who want a published method to apply, cite, extend, or criticize. The reference implementation supports repeatable research. This paper supports citation and debate about the method.

The method is **not for** several uses that look similar. The list is illustrative. It is not a complete catalog.

Do not use it against a pseudonymous person whose pseudonym is a safety measure. Pseudonym use is lawful and often necessary. The populations include a survivor of domestic abuse and an LGBTQ person in a place of legal or social risk. They include a dissident, a sex worker, and a person in addiction recovery. They include a person who seeks mental-health support, a witness, and a whistleblower. The method detects coordination across accounts.

It does not detect pseudonym use. §4.8 excludes signals that would mainly detect pseudonym use.

Do not use it in an intimate-partner context. A person could try to track a former partner across accounts. That use is excluded. The reference implementation does not detect misuse, and it cannot enforce this exclusion in code. Contributors and forks must still honor the exclusion.

Do not use it to unmask a journalist's source, a tip-line participant, or any party whose safety depends on attribution being impossible. The method investigates a network that is suspected of coordinated inauthentic behavior. It is not a general tool against pseudonyms.

Do not use it to identify a member of a community that depends on identity protection. Examples are a recovery community, a support group, an identity community in an unsafe jurisdiction, and a community organized around legally sensitive activity.

Use this test. If the account holders could read this work, would they recognize their own conduct as coordinated inauthentic behavior? If yes, the method is likely appropriate. If no, the method is likely the wrong tool.

## 1.3 Scope and non-goals

The first published version is narrow on purpose. A method that claims jobs it cannot do well produces unreliable output. It also harms the people it is meant to serve.

**Scope: closed-world attribution of a seed set.** The practitioner supplies N accounts that may be coordinated. The method says which subsets of that seed are likely under one operator. The method does not discover new accounts for the seed.

**Scope: cluster-level attribution.** The method names clusters of accounts that the signals suggest share one operator. It does not name the natural person behind a cluster. That later step is offline work, and it has a different ethical structure (§3.3.3 and §4.8.3).

**Scope: three coarse confidence bands.** The bands are insufficient, consistent with the same operator, and strongly consistent with the same operator. The bands are coarse so the output does not imply a calibration the method has not earned.

**Scope: a published method and a reference implementation.** The architecture is not tied to one platform. The reference deployment uses Cloudflare. The deterministic extraction layer can run in another environment.

**Non-goal: open-world discovery.** The method does not find sockpuppets in the open from a seed of one or two accounts. That job is harder than closed-world attribution. It also harms more bystanders, because a false inclusion is more common. Later work may address it. It is not in v1.

**Non-goal: bot detection.** Use Botometer, BotSentinel, or a similar tool when the question is automation. Common Thread is for the human-operated case. It is a poor choice for automation detection.

**Non-goal: tracking a narrative or a piece of content.** Use Hoaxy, a similar research tool, or a commercial tool for that job. Common Thread is about accounts, not about one piece of content.

**Non-goal: a large network.** Use a Graphika-class tool, or academic graph tools, for thousands of accounts. Common Thread is for an investigation of tens of accounts.

**Non-goal: natural-person identification.** The output is a cluster. Naming the person is out of scope (§4.8.3). Do that work with established offline technique, separate from the cluster result.

## 1.4 Ethical posture

Methods in this field have a dual use. The same technique can document a harassment network or can be turned on a person who lawfully uses more than one account. The same technique can document election interference or can help a stalker track a victim. The method cannot remove that duality. It can state the intended use, discourage misuse at the decision points, and accept that some misuse is the cost of publication.

The positions below are stated here and developed in the later sections.

**Coarse confidence bands.** The method uses three bands, not a fine probability (§3.2.1). A numeric probability is the wrong tool. Coarse bands resist false precision. They also resist use of the output as harassment material that looks more certain than the evidence.

**Declination by default.** Below the lowest band, the output is "insufficient evidence for attribution." That output is correct when the signals do not support a claim. The method does not manufacture certainty (§3.2.1, §7.3).

**No natural-person identification.** The reference implementation has no input for a natural-person identifier and no output that produces one. A practitioner who adds that identification does work outside the method (§3.3.3, §4.8.3).

**Excluded signals.** §4.8 lists signals the method refuses, even when they would strengthen a claim. The list includes platform-internal data, signals that mainly detect pseudonym use, offline information, direct messages, breach data, face recognition, and voice or video matching. The exclusions define the method. They are not a gap in the current code.

**Named exclusions.** §1.2 names uses that are out of scope. The naming is part of the defense against abuse. Misuse is then a breach of the stated scope. That fact matters when a practitioner describes the work, and when someone cites the method in a dispute.

**The practitioner answers for later use.** The method cannot prevent misuse. It can make casual misuse harder. A use that §1.2 excludes, or that contradicts this section, is outside the method. It is not an extension of the method.

Some readers will want stronger technical blocks on misuse. Those blocks would change the work from published research into something else, and the method cannot provide them. Other readers will want fewer ethical limits. The method refuses that, because the dual-use problem is real. This position is the result of that weighing. It is explicit about its limits.

## What follows

Section 2 places the method against existing tools and research. Section 3 is the evidentiary framework. Later sections assume it. Section 4 is the signal list. Section 5 is collection. Section 6 is feature extraction.

Section 7 is attribution. Section 8 is output and reporting. Section 9 is the case-study placeholder. Section 10 returns to ethics. Section 11 is limits and later work. Section 12 is the conclusion.

v1.0 mentioned appendices for the implementation, the prompts, the signal-table schema, the manifest format, and a glossary. Those appendix files are not in this deposit. See `paper/ERRATA.md`.

Read §3 and §4.8 together if you need the commitments before the technical sections. Read §5 before you apply the method. An early collection decision is hard to undo.

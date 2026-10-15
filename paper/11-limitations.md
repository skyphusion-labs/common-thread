# 11. Limitations and future work

This section gathers the limits of the method and names open problems for later work. A limit is not a failure. It is an honest statement of where the method stops. The paper notes limits in §3.3, and also in §4.8, §5.3.5, §6.4, §7.6, and §10. This section puts those notes in one place and adds limits that were not stated before.

Later work is an open problem for the community. It is not a commitment by the author. A practitioner or a researcher who finds the method useful is invited to extend it. Publication of the method, and of the reference implementation under AGPL-3.0-only, is meant to support that extension. The author's maintenance commitment is bounded. The sunset arrangement in the repository governance documents states the path from one maintainer to community ownership.

## 11.1 Scope limitations

The first published version is narrow on purpose. Several capabilities a practitioner might expect are out of scope.

**Closed world only.** The method works on a seed set the practitioner supplies. It does not discover a new account for the seed. Open-world detection is much harder. It needs a larger collection and a different kind of reasoning. It also produces more false inclusions. The method accepts the closed-world limit as the price of a reliable output at the current state of the art.

**Cluster level only.** The method attributes at cluster level. It does not name the natural person behind a cluster. That limit is an ethical commitment (§3.3.3 and §4.8.3). It is not a gap for later work to remove. A practitioner who needs a natural-person name should do that work with offline technique, outside this method.

**One primary platform.** The method supports cross-platform signals (§4.6). Each investigation still has one primary platform. Cross-platform evidence is support. Symmetric attribution across several platforms, at scale, is not in v1. The technical problems and the method problems are tractable. They were deferred.

**Batch processing.** The method is for a batch investigation. It is not a real-time monitor. It does not continuously detect new activity, alert on a triggering event, or maintain an attribution while the network changes. A practitioner who needs continuous monitoring can rerun the method on a schedule. The method has no native stream and no native alert.

**Cohorts of tens.** The method is designed for a seed set of up to about 50 accounts. A larger investigation is technically possible. Pairwise cost scales as N squared (§6.5). Reasoning quality at large N is better if you split the investigation into pieces the method can handle. Plan for that constraint. Do not treat it as a defect to route around.

## 11.2 Signal limitations

Each category in §4 has limits in its own subsection. This subsection gathers the limits that bound the whole method.

**A stylometric signal needs enough text.** Reliable Burrows' Delta, and related methods, need about several thousand words per account. A short history, or an account that posts media or links rather than text, is not suited to stylometric attribution. The extraction layer flags these cases (§6.4.1). The reasoning layer treats a missing stylometric signal as an inability to assess. It does not treat the absence as evidence against attribution.

**Response latency needs a triggering event.** The strongest temporal signal (§4.2.2) needs an event the network has a reason to answer. A purely outbound network, or a network on a slow cadence, cannot use this signal. The method accepts that the signal is available only in some investigations.

**A network signal needs more than a timeline.** Follower data and engagement data may be unavailable at scale after API prices rose. A scraping technique may not collect a follower list for a large network. That limit reduces the use of network signals. When a follower list cannot be collected, the reference implementation falls back to engagement that was observed directly.

**A visual signal is often absent.** Many accounts post few images or none. Platform processing removes EXIF metadata from most uploaded images. A visual signal contributes most when it is present. It is absent in many investigations.

**A cross-platform signal needs more than one platform.** An investigation of one platform cannot use §4.6. The method degrades in a controlled way. Absence of these signals does not invalidate the investigation. The strongest cross-platform signal, timing correlation across platforms, is then unavailable.

**No platform-internal data.** The method uses only the public platform surface. A practitioner with legitimate access to internal data has stronger tools. That practitioner may be a platform employee, law enforcement under legal process, or a security researcher under contract. The method is for practitioners without that access.

## 11.3 Adversarial adaptation

An operator of an investigated network will read this paper and the reference implementation. The method was designed with that expectation (§3.3.4 and §8.4). Publication reduces effectiveness against a sophisticated operator. That loss is the trade for the benefits of publication argued in §10.6.

Adaptations an operator may apply include the following.

**Randomized response latency.** An operator who reads §4.2.2 may randomize response time to defeat that signal. The countermeasure is partial. The network still needs to amplify quickly when speed matters. A change that defeats the signal in one way often creates a different signal.

**Stylometric defense.** An operator with a defense tool in the Anonymouth line, from Brennan and Greenstadt, can defeat function-word frequency. The defense is real. The method does not overclaim against an adapted author.

**Account aging.** An operator who lets an account age before use defeats creation-date clustering. The countermeasure is patience. Not every operator can sustain it.

**Platform separation.** An operator who keeps platforms strictly separate defeats cross-platform signals. Separation means a different platform, no shared handle, and no cross-platform link. The countermeasure is real. It is costly for an operator who wants the network visible on several platforms.

**Stylebook discipline.** An operator who keeps a stylebook across personas can substantially defeat a linguistic signal. The stylebook would govern word choice, punctuation, and sentence structure. Few operators of a small network invest in that discipline.

The method accepts that a determined and well-resourced operator can defeat much of it. The method is most useful against operators who have not invested in a countermeasure. That group appears to be most operators of the small and medium networks that the target practitioners meet.

## 11.4 Linguistic and cultural calibration

The method was developed with English-language investigations in mind. The signal list (§4) and the extraction rules (§6) generalize reasonably to other languages. They have not been validated on non-English investigations at scale.

The known issues follow.

**Function-word lists depend on the language.** Stylometric signals use a list for one language. Lists exist for major languages. Quality and coverage vary. A less-resourced language may lack a published list at the quality the method assumes.

**Background corpora vary by language.** Normalization against a community baseline needs a reference corpus in the relevant language. The baselines include follower overlap, link-corpus overlap, and vocabulary distinctiveness. The Corpus of Contemporary American English is a defensible default for English. Equivalent corpora exist for other languages. Access varies.

**LLM quality is uneven across languages.** The reasoning layer in §7 uses an LLM that performs better on English than on most other languages. The response is to lower the achievable band by one level for a non-English investigation (§7.6.5). That response is a coarse mitigation. It is not a calibration.

**Cultural frames of pseudonymity differ.** The audience limits (§1.2 and §10.2) are framed against a mainly Western legal context and cultural context. Protected populations differ across cultures. The exclusions may not map cleanly outside that frame. A practitioner in a culture the author does not know should consult local ethics guidance in addition to the commitments in this paper.

Later work could produce calibration data per language and could extend the audience limits to more cultural contexts. Version 1 does not have those calibrations. Be conservative when you interpret a non-English output.

## 11.5 Empirical validation

The method has not been validated on a large labeled set of confirmed sockpuppet networks. Several facts explain that gap.

**Labeled data is rare.** A confirmed attribution needs platform-internal ground truth or an external admission that yields a reliable label. Both are rare. Labeled sets that exist, including some in platform removal reports, are limited in scope. They may not represent the networks the target practitioners meet.

**Available labels are contested.** The few sets that exist have drawn academic disagreement about label reliability and about representativeness. A test on a contested set does not yield a strong claim about accuracy.

**Platform-internal validation is not visible outside the platform.** A major platform can test a method against internal labels. That test is not visible outside. This method cannot repeat it.

**The method defends its claims through reproducibility, not through an accuracy number.** Section 3.4 commits to reproducibility. The deterministic parts produce the same output for the same input. The method does not claim a specific accuracy number. That choice is deliberate. Accuracy claims about adversarial attribution have aged poorly. The method declines to make them.

A practitioner or a reviewer who needs an accuracy number should treat the absence as a real limit. Reproducibility and explicit bands are usable substitutes while validated accuracy numbers do not exist. They are not a claim that accuracy data is unimportant.

Later work could validate the method on a labeled set obtained through a legitimate channel. The method supports that test. A researcher with a labeled set and the reference implementation can apply the method and report the result. The output format is designed to support that report.

## 11.6 Inter-rater reliability and reasoning consistency

The reasoning layer (§7) varies across runs. The mitigations constrain the variance. They do not remove it. The mitigations are citation requirements, randomized signal order, declination by default, and coarse bands. Two practitioners may receive somewhat different narratives for the same investigation and the same parameters. The method still requires that the substantive claims agree.

The method has not been tested empirically for inter-rater reliability. The open problems follow.

**Consistency across runs.** How often do two runs of the same investigation produce the same substantive claims at the same bands? The structural commitments should produce high consistency. The empirical question is unanswered.

**Consistency across practitioners.** How often do two practitioners with similar training produce the same substantive claims on the same archive? This question differs from consistency across runs. It includes practitioner judgment at the basis statement and at the scope (§5.1 and §5.2), plus LLM variability.

**Consistency across models.** How does the output change when the LLM is upgraded? Section 3.4.2 says an upgrade produces variation that should be measured, not hidden. The empirical work to characterize that variation has not been done.

Later work on inter-rater reliability would strengthen the claim to evidentiary use. Where that reliability matters, run the method more than once and report the agreement rate.

## 11.7 Platform model assumptions

The method assumes a generic platform. An account has a profile, a timeline of posts, a follower list, a followed list, and engagement records such as likes, reposts, and quotes. Direct messages exist and are excluded. That model fits the major Western social platforms reasonably well. Examples are Twitter, Facebook, Instagram, and threads of a similar structure.

The model fits less well where the structure differs.

**Reddit.** The signal list maps imperfectly to Reddit. Several Reddit features change which signals exist and how they are computed. They are threaded discussion, identity at subreddit level, and karma as an engagement metric. The absence of a follower list is another. You can apply the method to Reddit. Expect to adapt the extraction layer.

**Mastodon and the wider fediverse.** Federation creates differences the model does not address. An account may exist across instances. A follower list may be partial. The data architecture differs from a centralized platform.

**Bluesky.** The labeler architecture, decentralized identifiers, and the AT Protocol data model create extraction problems the method does not specifically address.

**Discord, Telegram, and chat platforms.** The primary unit in this method is the public post. A chat platform uses a message inside a channel or a direct message. The method does not address that unit directly.

**Niche platforms.** Platforms tied to one community may or may not fit the model. Examples are TikTok, BeReal, Truth Social, Gettr, and a smaller national platform. Assess the fit before you assume the method applies.

Later work could add a platform-specific extension. The reference implementation can take a platform adapter. The framework in this paper can specify an extractor that joins the general signal list.

## 11.8 Open problems for future work

The current scope surfaces several open problems. They are problems for the community. They are not commitments by the author.

**Open-world detection.** A move from closed-world attribution to open-world discovery is a large extension. Discovery would add accounts to the seed from signal patterns. The problems include the false-positive rate at scale, a discovery scope that does not prejudge the investigation, and a join to the existing closed-world pipeline.

**Multi-platform attribution at scale.** A symmetric investigation across platforms, with full extraction on each platform and integrated reasoning, is technically tractable and methodologically thin. The reference implementation can be extended. The framework supports the idea. The practitioner-facing work to make that investigation usable has not been done.

**Real-time monitoring.** A move from batch work to continuous monitoring has technical problems and method problems. The technical problems are an incremental signal table, a streaming reasoning run, and an alert. The method problem is a network whose membership changes during the monitoring period.

**Calibration per language and per culture.** The English-language default and the Western cultural default need extension before the method is reliable in other contexts. That work needs collaborators in the relevant languages and cultures.

**Empirical validation.** Validation on a labeled set, as such sets become available, is community work. The method supports the test. It does not perform the test. A researcher with a suitable set is invited to apply the method and publish the result.

**A join with bot detection.** A method that handles a network of bots and human-operated accounts together would be more useful than two separate methods. The reference implementation supports a sequence. Apply bot detection first, then this method. A more integrated approach has not been developed.

**Platform-specific extensions.** An adapter for Reddit, Mastodon, Bluesky, Discord, or another distinct structure would extend the reach. Each adapter needs familiarity with that platform's data model.

**Adversarial robustness.** Better mitigation against an operator who adapts to this method is an open problem. Current mitigations are partial. They are signal combinations, declination by default, and structural commitments. A more sophisticated mitigation would be valuable.

**Inter-rater studies.** Empirical work on practitioner consistency, and on consistency of the reasoning layer across runs and across models, would strengthen the evidentiary posture.

## 11.9 What the methodology does not promise

Commitments are stated throughout the paper. This subsection lists what the method does not promise, so a reader does not infer a claim the method has not earned.

**The method does not promise a specific accuracy.** Reproducibility and confidence bands are the operational commitments. A specific accuracy number is not claimed.

**The method does not promise to detect every coordinated network.** It supports an investigation of a seeded network. A network outside the seed is not its concern.

**The method does not promise to name a specific operator.** Cluster-level attribution is the limit. Natural-person identification is out of scope.

**The method does not promise admissibility in court.** The structural commitments support an admissibility argument where a court considers method reliability. Admissibility depends on the jurisdiction and on the case. Consult counsel.

**The method does not promise to stay useful without maintenance.** A platform change will degrade collection. A model change will alter reasoning output. Adversarial adaptation will degrade effectiveness against a sophisticated operator. The method needs ongoing maintenance to stay current. That maintenance is the community's responsibility.

**The method does not promise to prevent misuse.** A use outside the audience is outside the commitments. The method rejects that use. It cannot prevent it.

**The method does not promise to replace legal advice, an ethics review, or professional judgment.** In a court context, consult counsel. In an academic context, use the ethics-review process. In every context, the practitioner exercises judgment the method cannot replace.

## Closing

The limits in this section are real. The method is published with a full statement that its reach is bounded by its scope, its signal list, its calibration, and its adversarial posture. A practitioner who finds the method useful works inside those bounds. A practitioner who needs more needs another tool.

Later work, as open problems for the community, is the path forward. The author's maintenance commitment is bounded. Continuation depends on practitioners and researchers who find the work useful. They take up the extensions, the validations, and the adaptations that the bounded scope leaves open.

Section 12 is a short conclusion and the closing posture of the paper.

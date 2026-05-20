# 11. Limitations and future work

This section consolidates the methodology's limitations and identifies the open problems that future work could address. The limitations are not failures of the methodology; they are the honest acknowledgment of where the methodology's reach ends. The methodology paper has noted limits throughout (in §3.3 most directly, but also in §4.8, §5.3.5, §6.4, §7.6, and §10), and this section pulls those acknowledgments together in one place alongside additional limitations not previously surfaced.

Future work is framed as open problems for the community rather than as commitments by the author. Practitioners and researchers who find the methodology useful are invited to extend it; the publication of the methodology and the reference implementation under AGPL-3.0 is intended to support such extension. The author's commitment to maintenance is bounded; the sunset arrangement described in the project's repository governance documents specifies the path from sole maintainership to community ownership.

## 11.1 Scope limitations

The methodology in its first published version is scoped narrowly. Several capabilities that practitioners might reasonably expect from a methodology in this space are deliberately out of scope.

**Closed-world only.** The methodology operates on a seed set provided by the practitioner. It does not discover new accounts to add to the seed. Open-world detection is much harder than closed-world attribution; it requires both larger collection scope and different reasoning patterns, and it produces false-positive casualties at higher rates than closed-world attribution. The methodology accepts the closed-world constraint as a price of producing reliable output at the current state of the art.

**Cluster-level only.** The methodology produces attribution at the cluster level. It does not identify the natural person behind a cluster. This is a deliberate ethical commitment (§3.3.3, §4.8.3) rather than a limitation that future work should remove. Practitioners who need natural-person identification should do that work using offline investigative techniques outside the methodology's scope.

**Single platform at a time.** The methodology supports cross-platform signals (§4.6) but conducts each investigation against a single primary platform with cross-platform extensions as supporting evidence. True multi-platform attribution at scale, where a single investigation operates symmetrically across multiple platforms, is not addressed in v1. The technical and methodological problems are tractable but were deferred.

**Batch processing.** The methodology is designed for batch investigations. Real-time monitoring of a network (continuous detection of new activity, alerts on triggering events, ongoing maintenance of the attribution against changing networks) is not the methodology's mode of operation. Practitioners with continuous-monitoring needs can rerun the methodology on a schedule, but the methodology does not provide native streaming or alerting.

**Cohort sizes in tens.** The methodology is designed for seed sets of up to approximately 50 accounts. Larger investigations are technically possible but the pairwise computation costs scale as N-squared (§6.5), and the reasoning quality at large N benefits from sharding the investigation into smaller pieces that the methodology can handle robustly. Practitioners conducting large-scale investigations should plan for this constraint rather than treating it as a defect to work around.

## 11.2 Signal limitations

The signal categories in §4 each carry known limitations that have been documented in their respective subsections. This subsection consolidates the limitations that bear on the methodology's overall reach.

**Stylometric signals require sufficient text.** The minimum corpus size for reliable Burrows' Delta and related stylometric methods is approximately several thousand words per account. Accounts with shorter active histories or that primarily post media or links rather than text are not amenable to stylometric attribution. The methodology flags these cases at the extraction layer (§6.4.1) and the reasoning layer treats stylometric absence as inability to assess rather than as evidence against attribution.

**Response-latency signals require triggering events.** The strongest temporal signal (§4.2.2) requires events that the network has reason to respond to. Investigations of networks that do not engage with triggering events (purely outbound networks, networks that operate on a slow cadence) cannot use this signal. The methodology accepts the signal's contingent availability.

**Network signals require collection beyond timelines.** Follower and engagement data may not be available at scale post-API-paywall. Practitioners using scraping techniques may not be able to collect follower lists for large networks, which limits the network signals' applicability. The reference implementation falls back to direct-observation engagement data when follower lists are not collectable.

**Visual signals are often absent.** Many accounts post few or no images, and the platform's media stripping removes EXIF metadata from most uploaded images. Visual signals contribute most strongly when present but are absent in many investigations.

**Cross-platform signals require multi-platform collection.** Investigations limited to a single platform cannot use cross-platform signals (§4.6). The methodology degrades gracefully (the absence of these signals does not invalidate the investigation) but the strongest individual signal in the cross-platform category (timing correlation across platforms) is unavailable.

**No platform-internal data.** The methodology operates exclusively on the public platform surface. Practitioners with access to platform-internal data through legitimate means (platform employees, law enforcement under appropriate legal process, security researchers under contract) have stronger tools available; the methodology is positioned for practitioners without such access.

## 11.3 Adversarial adaptation

Operators of investigated networks will read the methodology paper and the reference implementation. The methodology was designed with this expectation (§3.3.4, §8.4) and accepts the trade-off: publication degrades the methodology's effectiveness against sophisticated operators in exchange for the broader benefits of publication argued at §10.6.

The specific adaptations operators may apply include:

**Randomized response latency.** Operators who read §4.2.2 may deliberately randomize their response timing to defeat the response-latency signal. The countermeasure is partial: maintaining consistent operational utility (amplifying content quickly when it matters) is difficult to fully randomize, and adaptation that defeats this signal in one direction often degrades it in another way that produces a different signal.

**Stylometric defense.** Operators with access to stylometric defense tools (the Anonymouth lineage of Brennan and Greenstadt) can defeat function-word-frequency signals. The defense is real and acknowledged; the methodology declines to overclaim against adapted authors.

**Account aging.** Operators who let accounts age before deploying them defeat creation-date clustering. The countermeasure is patience that not all operators can sustain.

**Platform separation.** Operators who maintain strict platform separation (different platforms entirely, with no cross-platform handle reuse or link references) defeat cross-platform signals. The countermeasure is real but operationally costly for operators who want their network to be visible across platforms.

**Stylebook discipline.** Operators who maintain a stylebook across personas, with explicit guidance on word choice, punctuation, and sentence structure, can substantially defeat linguistic signals. The countermeasure is sustained discipline that few operators of small networks invest in.

The methodology accepts that determined, well-resourced operators can substantially defeat the methodology. The cohort the methodology is most useful against is operators who have not invested in countermeasures, which empirically appears to be the majority of operators of the small-to-medium networks the methodology's target practitioners typically encounter.

## 11.4 Linguistic and cultural calibration

The methodology was developed with English-language investigations in mind. The signal taxonomy (§4) and the feature extraction (§6) generalize reasonably to other languages but have not been validated against non-English investigations at scale.

The specific known issues:

**Function-word lists are language-specific.** The methodology's stylometric signals use language-specific function-word lists. Lists exist for major languages but vary in quality and coverage. Less-resourced languages may not have published function-word lists at the quality the methodology assumes.

**Reference corpora for background calibration vary by language.** The methodology's normalization against community baselines (for follower overlap, link corpus overlap, vocabulary distinctiveness) requires reference corpora in the relevant language. The Corpus of Contemporary American English is a defensible default for English; equivalent corpora for other languages exist but vary in accessibility.

**LLM reasoning quality is uneven across languages.** The attribution-reasoning layer in §7 uses an LLM that performs better on English than on most other languages. The methodology's response (lower the achievable confidence band by one level for non-English investigations, per §7.6.5) is a coarse mitigation rather than a calibration.

**Cultural framings of pseudonymity vary.** The methodology's audience exclusions (§1.2, §10.2) are framed against a primarily Western legal and cultural context. The specific protected populations vary across cultures, and the methodology's exclusions may not map cleanly to non-Western contexts. Practitioners conducting investigations in cultures the methodology's author is not familiar with should consult locally-grounded ethics guidance in addition to the methodology's stated commitments.

Future work could produce per-language calibration data and could extend the audience-exclusion framework to additional cultural contexts. The methodology in v1 does not have these calibrations; practitioners conducting non-English investigations should be conservative in their interpretation of methodology output.

## 11.5 Empirical validation

The methodology has not been validated against large labeled datasets of confirmed sockpuppet networks. Several factors explain this:

**Labeled datasets are rare.** Confirmed sockpuppet attribution requires either platform-internal data that produces ground-truth attribution or external admissions that produce reliable labels. Both are rare. The labeled datasets that exist (some published by major platforms in coordinated-inauthentic-behavior removal reports) are limited in scope and may not be representative of the networks the methodology's target practitioners encounter.

**Available datasets are contested.** The few datasets that exist have been subject to academic disagreement about labeling reliability and representativeness. Validation against contested datasets does not produce strong claims about the methodology's accuracy.

**Platform-internal validation is not externally accessible.** Major platforms maintain internal labeling and can validate methodologies against it, but the validation is not externally visible. The methodology cannot replicate this validation.

**The methodology's claims are defended through reproducibility rather than empirical accuracy.** The methodology in §3.4 commits to reproducibility (the deterministic parts produce the same outputs for the same inputs) rather than to specific accuracy numbers. This is a deliberate choice: empirical accuracy claims about adversarial attribution methodologies have historically aged poorly, and the methodology declines to make them.

Practitioners and reviewers who require empirical accuracy data should treat the methodology's lack of such data as a real limitation. The methodology's response is that reproducibility and explicit confidence calibration are usable substitutes in the absence of validated accuracy numbers, not that accuracy data is unimportant.

Future work could produce empirical validation against datasets that become available through legitimate channels. The methodology supports such validation: any researcher with access to a labeled dataset and to the reference implementation can apply the methodology and report results. The reference implementation's output format is designed to support such validation reporting.

## 11.6 Inter-rater reliability and reasoning consistency

The LLM-assisted reasoning layer (§7) produces outputs that vary across runs. The methodology's mitigations (citation requirements, randomized signal presentation, declination defaults, coarse confidence bands) constrain the variance but do not eliminate it. Two practitioners applying the methodology to the same investigation with the same parameters may receive somewhat different attribution narratives, although the methodology requires that the substantive claims agree.

The methodology has not been empirically evaluated for inter-rater reliability. Several open problems:

**Cross-run consistency.** How often do two runs of the same investigation produce the same set of substantive claims at the same confidence bands? The methodology's structural commitments should produce high consistency, but the empirical question has not been answered.

**Cross-practitioner consistency.** How often do two practitioners with similar training produce the same substantive claims when applying the methodology to the same archive? This is a different question from cross-run consistency because it involves practitioner judgment at the basis-statement and scope-definition stages (§5.1, §5.2) in addition to the LLM variability.

**Cross-model consistency.** How does the methodology's output change when the LLM is upgraded? The methodology's posture (§3.4.2) is that LLM upgrades produce variation that should be measured rather than concealed, but the empirical work to characterize the variation has not been done.

Future work on inter-rater reliability would substantially strengthen the methodology's claims to evidentiary use. Practitioners conducting investigations where inter-rater reliability matters should consider running the methodology multiple times and reporting the agreement rates explicitly.

## 11.7 Platform model assumptions

The methodology assumes a generic platform model: accounts with profiles, timelines of posts, follower and followed lists, engagement records (likes, reposts, quotes), and direct messages (excluded). This model fits the major Western social platforms (Twitter, Facebook, Instagram, threads of similar structure) reasonably well.

The model fits less well to platforms with significantly different structures:

**Reddit.** The methodology's signal taxonomy maps imperfectly to Reddit's structure. Threaded discussion, subreddit-level identity, karma as an engagement metric, and the absence of follower lists all change which signals are available and how they are computed. The methodology can be applied to Reddit investigations but practitioners should expect to adapt the extraction layer.

**Mastodon and the broader fediverse.** Federation produces structural differences that the methodology's model does not address: an account may exist across multiple instances, follower lists may be partial, and the platform's data architecture is fundamentally different from centralized platforms.

**Bluesky.** The labeler architecture, the use of decentralized identifiers, and the AT Protocol's data model produce extraction challenges that the methodology does not specifically address.

**Discord, Telegram, and chat platforms.** The methodology's primary unit of analysis is the public post; chat platforms have a different unit of analysis (the message within a channel or DM) that the methodology does not address directly.

**Niche platforms.** Many platforms specific to particular communities (TikTok, BeReal, Truth Social, Gettr, smaller national platforms) have structural variations that may or may not fit the methodology's model. Practitioners working on niche platforms should expect to assess fit before assuming the methodology applies.

Future work could produce platform-specific extensions of the methodology. The reference implementation's architecture supports adding platform adapters; the methodology paper's framework supports specifying platform-specific feature extractors that integrate with the general signal taxonomy.

## 11.8 Open problems for future work

Several open problems are surfaced by the methodology's current scope. These are framed as community open problems rather than as author commitments.

**Open-world detection.** Extending the methodology from closed-world attribution to open-world discovery (finding new accounts to add to the seed set based on signal patterns) is a substantial extension. The challenges include managing the false-positive rate at scale, defining the discovery scope without prejudicing the investigation, and integrating the discovery step with the existing closed-world attribution pipeline.

**Multi-platform attribution at scale.** Conducting an investigation symmetrically across multiple platforms, with full feature extraction on each platform and integrated attribution reasoning, is technically tractable but methodologically underexplored. The reference implementation can be extended to support this; the methodology paper's framework supports it conceptually; the practitioner-facing work to produce a usable multi-platform investigation has not been done.

**Real-time monitoring.** Extending the methodology from batch processing to continuous monitoring of a network has both technical challenges (incremental updates to the signal table, streaming reasoning runs, alert generation) and methodological challenges (how to handle a network whose composition is changing during the monitoring period).

**Per-language and per-culture calibration.** The methodology's English-language and Western-cultural defaults need extension to be reliably usable in other linguistic and cultural contexts. This is community work that requires collaborators in the relevant languages and cultures.

**Empirical validation.** Empirical validation against labeled datasets as they become available is community work that the methodology supports but does not undertake. Researchers with access to suitable datasets are invited to apply the methodology and publish results.

**Integration with bot detection.** A combined methodology that handles networks containing both bots and human-operated accounts would be more useful than separate methodologies for each. The reference implementation supports the workflow (apply bot detection first, then the methodology), but a more integrated approach has not been developed.

**Platform-specific extensions.** Adapters for Reddit, Mastodon, Bluesky, Discord, and other platforms with distinct structures would extend the methodology's reach. Each adapter is community work that requires familiarity with the specific platform's data model.

**Adversarial robustness.** Better mitigations against operators who specifically adapt to the methodology are an open problem. The methodology's current mitigations (combinations of signals, declination defaults, structural commitments) are partial; more sophisticated mitigations would be valuable.

**Inter-rater reliability studies.** Empirical work on how consistently practitioners apply the methodology, and how consistently the LLM reasoning layer produces equivalent outputs across runs and models, would substantially strengthen the methodology's evidentiary posture.

## 11.9 What the methodology does not promise

The methodology's commitments are stated throughout the paper. This subsection lists what the methodology does not promise, to prevent inferences that the methodology has not earned.

**The methodology does not promise specific accuracy.** Reproducibility and confidence calibration are the operational commitments; specific accuracy numbers are not claimed.

**The methodology does not promise to detect all coordinated networks.** It supports investigations of seeded networks. Networks not in the seed are not the methodology's concern.

**The methodology does not promise to identify specific operators.** Cluster-level attribution is the limit. Natural-person identification is out of scope.

**The methodology does not promise admissibility in court.** The structural commitments support admissibility arguments in jurisdictions that consider methodological reliability factors, but admissibility is jurisdiction-dependent and case-specific. Practitioners must consult counsel.

**The methodology does not promise to remain useful indefinitely.** Platform changes will degrade the methodology's collection layer. Model changes will alter the reasoning layer's outputs. Adversarial adaptation will degrade the methodology's effectiveness against sophisticated operators. The methodology requires ongoing maintenance to remain current; the maintenance posture is the community's responsibility.

**The methodology does not promise to prevent misuse.** Practitioners using the methodology for purposes outside the audience the methodology serves are operating outside the methodology's commitments. The methodology disavows such use but cannot prevent it.

**The methodology does not promise to substitute for legal advice, ethics review, or professional judgment.** Practitioners using the methodology in court contexts should consult counsel. Practitioners using the methodology in academic contexts should engage their ethics review process. Practitioners in any context exercise judgment that the methodology cannot replace.

## Closing

The limitations identified in this section are real. The methodology is published with full acknowledgment that its reach is bounded by what its scope, its signal taxonomy, its calibration, and its adversarial posture support. Practitioners and researchers who find the methodology useful are operating within these bounds; practitioners and researchers who need capabilities beyond these bounds need other tools.

Future work as community open problems is the methodology's path forward. The author's commitment to maintenance is bounded; the methodology's continuation depends on practitioners and researchers who find the work useful taking ownership of the extensions, validations, and adaptations the methodology's bounded scope leaves open.

The final section (§12) offers a brief conclusion and the paper's closing posture.

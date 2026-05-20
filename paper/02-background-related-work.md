# 2. Background and related work

This section establishes the conceptual and empirical landscape against which the methodology is positioned. The first part (§2.1) defines the terms the methodology uses. The middle parts (§2.2 through §2.8) survey the prior work that bears on the methodology, organized by the layer of the problem each line of work addresses: automated-account detection, coordinated-behavior detection at the network level, authorship attribution, OSINT practitioner methodology, commercial and proprietary tooling, visual forensics, and the legal and ethical context. The final part (§2.9) states what the methodology contributes that the surveyed prior work does not.

The section is intended to position the methodology accurately rather than exhaustively. Practitioners and researchers using the methodology should treat the citations here as entry points to the broader literature rather than as a comprehensive bibliography of any of the fields surveyed.

## 2.1 Definitions

The terminology in this domain is contested and inconsistent across the relevant literatures. The methodology adopts the following definitions and uses them consistently throughout the paper.

**Sockpuppet.** An account operated by a person other than the one the account presents itself as, or an account that is one of several operated by a single person who presents the accounts as independent. The term originates in online forum culture from the late 1990s and has been adopted with various refinements in the academic literature. The methodology uses the term to refer to the structural condition (multiple accounts operated by a common hand and presented as independent) rather than to any specific intent.

**Persona.** A presented identity associated with an account. A single operator may maintain multiple personas across multiple accounts; the methodology investigates whether multiple personas share an operator.

**Alias.** A name used by an operator in place of another name. The methodology uses "alias" specifically for the relationship between an account's presented identity and the operator's other presented identities, not as a synonym for sockpuppet.

**Pseudonym.** A name used by an operator in place of their legal name. Pseudonyms are not inherently inauthentic. Many legitimate uses of pseudonymity are protected by professional, ethical, and legal norms. The methodology is designed to distinguish coordinated inauthentic use of pseudonyms from legitimate pseudonymity (the discussion in §2.3 develops this distinction).

**Automated account or bot.** An account whose posting and engagement is performed by software, with limited or no human intervention at the per-post level. Bot detection is a separate problem from sockpuppet attribution. The methodology is designed for human-operated accounts and does not produce useful outputs against fully automated accounts.

**Coordinated inauthentic behavior (CIB).** The term, originated by Meta (then Facebook) in 2018 to describe networks of accounts working together to mislead about their identity or coordination, has been adopted across the platform and academic literatures. The methodology uses the term in this sense: networks of accounts working in coordination while presenting themselves as independent.

**Parallel operator.** One natural person operating multiple accounts. The methodology attributes accounts to parallel operators rather than to natural persons (§3.3.3 develops this distinction).

**Network attribution.** The act of determining that a set of accounts are operated by a common hand. The methodology produces network attribution at the cluster level, not at the natural-person level.

## 2.2 Automated-account detection

The detection of automated accounts on social platforms has substantial academic and applied literature. The Botometer service (originally BotOrNot) developed by the Indiana University Observatory on Social Media is the most cited academic tooling in this space, with multiple papers describing its methodology and evaluation. Subsequent work has refined the underlying classifiers, addressed adversarial robustness, and extended the methodology to platforms beyond Twitter.

Applied bot detection tooling outside the academic mainstream includes BotSentinel (focused on Twitter, with a journalistic rather than academic methodology), DataReportal indicators, and various platform-internal bot-detection systems. The applied tooling differs from the academic tooling in transparency: applied tools typically do not publish their classifiers' weights or their training data, while academic tools more often do.

The methodology distinguishes itself from this body of work by addressing the human-operated case rather than the automated case. The detection problems are structurally different: automated accounts produce signal patterns (millisecond response latencies, exact temporal regularities, classifier-detectable text generation) that are absent from human-operated accounts. The methodologies developed for bot detection do not transfer cleanly to sockpuppet attribution, and the literature on the bot detection problem does not directly inform the methodology's signal taxonomy except as a contrast.

The relationship between the two problems is complementary. Practitioners who suspect a network may contain both bots and human-operated accounts can apply bot detection first to remove the automated accounts from the seed set, then apply the methodology to the remaining accounts. The reference implementation supports this workflow but does not implement bot detection internally; practitioners should use established bot-detection tooling for that purpose.

## 2.3 Coordinated-behavior detection at the network level

A separate body of work addresses coordinated inauthentic behavior at the network level rather than at the individual-account level. Pacheco and colleagues at the Indiana University Observatory on Social Media have published methodologies for uncovering coordinated networks using social-graph analysis, content similarity, and temporal correlation. The work typically operates over substantial portions of a platform's social graph and produces network-level claims (this set of accounts is coordinated) rather than pair-level attribution claims (these two accounts share an operator).

The Atlantic Council's Digital Forensic Research Lab (DFRLab) has published numerous investigation reports applying network-level methodology to specific cases (state-sponsored influence operations, coordinated disinformation campaigns, election-period coordinated activity). The DFRLab methodology is closer to investigative-journalism practice than to academic methodology, with explicit case-by-case reasoning that the methodology paper here aims to systematize for accessibility.

Graphika, a commercial firm, has produced substantial analytic work on coordinated inauthentic behavior, often in partnership with platforms or with academic researchers. The Graphika methodology is proprietary; their public reports describe findings but not in sufficient detail to support replication outside their tooling.

The methodology presented here differs from this body of work along three dimensions. First, it operates at the cluster level rather than at the platform-network level, allowing investigations that have only the bandwidth to focus on tens of accounts rather than thousands. Second, it does not require platform partnership or paid API access at the scale that network-level analysis typically demands. Third, it is published with explicit methodology and a reference implementation, making it accessible to practitioners outside the institutional contexts that the existing network-level work serves.

These differences are not improvements over the network-level work; they are different design points. Practitioners with platform partnership and the resources for network-level analysis should use the network-level tooling. Practitioners without those resources have been served less well by the existing tooling; the methodology aims to serve them.

## 2.4 Authorship attribution

Authorship attribution as a computational field predates social media by decades. Mosteller and Wallace's 1964 work on the Federalist Papers is the canonical early demonstration that authorship can be inferred from statistical analysis of word frequencies. The field has developed substantially since, with successive surveys (Koppel, Schler, and Argamon's work on computational methods, Stamatatos's broader survey of modern authorship attribution methods) establishing the state of the art at multiple points in its history.

Burrows' Delta, introduced in 2002, remains a foundational stylometric method and is the methodology's specified baseline for the linguistic signals at §4.3.1 and §6.2.3. The Delta method's strength is its simplicity and the stability of its results across implementations: an investigation that specifies Burrows' Delta and a specific function-word list produces reproducible distances across any compliant implementation.

The literature on stylometric defense (work by Brennan and Greenstadt and the subsequent Anonymouth tool developed at Drexel) demonstrates that motivated authors can defeat stylometric attribution by modifying their writing systematically. This work shapes the methodology's posture: §3.3.4 acknowledged that adversarially adapted operators are harder to detect, and the stylometric defense literature is the specific work that demonstrates this.

The application of authorship attribution to social-media-length texts faces particular challenges that the field has addressed in mixed ways. Tweets and similar short-form posts provide much less text per author than the corpora most stylometric methods were developed against; the minimum corpus size requirements specified at §6.4.1 (typically several thousand words per author) reflect the practical lower bound. Below this bound, stylometric signals become unreliable, and the methodology's response is to flag insufficient-data cases rather than to produce attribution from inadequate input.

Adversarial scenarios where authors specifically intend to defeat attribution (the scenario the methodology faces with sophisticated operators) are not the typical evaluation setting for authorship attribution research. The academic literature evaluates methods against authors who have not adapted their writing. The methodology accepts that performance against adapted authors is below the published performance against unadapted authors and does not represent the published numbers as applicable to the methodology's adversarial setting.

## 2.5 OSINT practitioner methodology

Open-source intelligence (OSINT) practice has developed a substantial body of methodology that is largely community-maintained rather than academic. Bellingcat, an investigative-journalism organization, has published an online investigator's guide that is widely regarded as the canonical practitioner reference for OSINT methodology applied to social-media investigations. The Bellingcat guide covers collection techniques, verification standards, ethical considerations, and case studies; it overlaps substantially with the methodology in scope but differs in its target output.

The Bellingcat guide is designed for investigators conducting one-off investigations of specific subjects, typically producing investigative reports rather than structured methodology outputs. The methodology presented here is designed for investigations that produce evidence packets suitable for use beyond the investigation itself (court filings, peer review, replication by other practitioners). The two approaches are complementary; practitioners conducting OSINT investigations should be familiar with both.

Various community-maintained resources extend or specialize the Bellingcat methodology. The OSINT Curious project, the IntelTechniques community, Trace Labs, and several others maintain practitioner resources at varying levels of formality. These resources address specific techniques (geolocation, archive preservation, social engineering, blockchain analysis) rather than the network-attribution problem the methodology focuses on.

The methodology distinguishes itself from the OSINT practitioner literature by its emphasis on structured methodology with explicit confidence calibration and chain-of-custody discipline. OSINT practice tends toward case-specific judgment, which is appropriate for the journalistic and investigative-research contexts most OSINT work operates in. The methodology accepts that some of the flexibility OSINT practice offers is sacrificed in exchange for the reproducibility properties that court and peer-review contexts require.

## 2.6 Commercial and proprietary tooling

The commercial tooling landscape includes Graphika, the various enterprise products from Recorded Future, Flashpoint, ZeroFox, and similar firms, and the internal trust-and-safety tooling maintained by major platforms. These tools produce capability that exceeds the methodology's reach in several dimensions: scale of data ingestion, sophistication of analysis, dedicated research staff applying the tooling to specific cases, and integration with downstream operational systems.

The commercial tooling is inaccessible to the methodology's intended practitioner audience in two related ways. First, the licensing costs typically exceed what individual practitioners, small newsrooms, and most academic researchers can afford. Second, the methodologies are proprietary; even practitioners who can afford the tooling cannot publish work that depends on it in a form that supports external verification, because the methodology itself is not externally documented.

Major platforms maintain internal coordinated-behavior detection systems that operate over platform-internal data the methodology does not have access to. These systems are the most capable in the landscape but are also the least externally accountable: they operate without external visibility into their methodology, error rates, or decision processes. The methodology in §10.6 argues that the existence of these closed methodologies is itself part of the case for publishing an open methodology, because the open methodology brings external accountability to a domain where closed methodologies operate without it.

## 2.7 Image and visual forensics

The methodology's visual-signal category (§4.5) draws on a body of work in image forensics that is separate from the social-media-investigation literature.

Perceptual hashing, the basis for the methodology's profile-image comparison, has a literature dating to the late 1990s and consolidated in the 2000s. Zauner's 2010 thesis on the implementation and benchmarking of perceptual hash functions is the methodology's reference for the technique. The pHash and dHash hash families specified at §6.2.5 are standard in the literature and have widely available implementations.

GAN-generated image detection is a more recent and rapidly evolving field. The methodology's §4.5.5 cites Marra and colleagues' 2018 work on detection of GAN-generated fake images and Wang and colleagues' 2020 work on CNN-generated image detection as foundational references, but practitioners using the methodology should be aware that the field is in active development and that detector performance against the latest generation of synthesis models lags the synthesis models themselves. The arms-race dynamics noted at §4.5.5 are visible in the literature; multiple subsequent papers extend, refine, or refute earlier detection methods.

Reverse image search as a forensic technique is community practice rather than academic literature; the Bellingcat investigator's guide and similar resources document the practitioner techniques.

## 2.8 Legal and ethical context

The legal context for scraping public platform data has been shaped substantially by the *hiQ Labs v. LinkedIn* litigation in the United States federal courts (2017 through 2022). The Ninth Circuit's rulings in this case narrowed the application of the Computer Fraud and Abuse Act (CFAA) to scraping of public profiles, holding that public data scraping does not constitute unauthorized access for CFAA purposes. The case did not eliminate legal exposure for scraping; terms-of-service claims, copyright claims, and state-law claims remain available, and the legal context outside the United States varies substantially by jurisdiction.

The ethical context for online harassment has been developed substantially in the legal-academic literature. Danielle Citron's *Hate Crimes in Cyberspace* (2014) is a foundational academic treatment of online harassment as a phenomenon distinct from offline harassment, with particular attention to the gendered patterns of online abuse. Citron's subsequent work has extended into the legal frameworks available for addressing online harassment.

The media-manipulation context relevant to coordinated inauthentic behavior has been addressed in practitioner-oriented academic work, most notably Marwick and Lewis's 2017 Data and Society report on media manipulation and disinformation online. The Marwick and Lewis framework documents the techniques used to manipulate media and platform attention, including coordinated inauthentic behavior, and provides the conceptual vocabulary that subsequent practitioner work has built on.

The platform-policy context for coordinated inauthentic behavior has been substantially shaped by Meta's 2018 framing of the concept and subsequent operational definitions. Meta, Twitter (before its post-2022 changes), Google, and other major platforms have published policies on coordinated inauthentic behavior, removal reports describing enforcement actions, and methodology notes describing detection approaches. The platform-side documentation is uneven in detail and reliability but provides operational context for understanding what platforms consider in scope for their own enforcement.

## 2.9 What this methodology contributes

The methodology contributes three things that the surveyed prior work does not, in combination, provide.

**A documented practitioner methodology with explicit commitments.** OSINT practitioner methodology (§2.5) is documented but generally lacks the chain-of-custody and confidence-calibration commitments the methodology specifies. Academic authorship-attribution methodology (§2.4) has explicit commitments but does not address the broader signal taxonomy the methodology requires. Commercial tooling (§2.6) operates under undocumented methodology that supports neither external verification nor replication. The methodology fills the gap of a documented methodology with explicit commitments that practitioners can adhere to and that reviewers can evaluate against.

**Accessibility to practitioners outside well-resourced institutions.** The commercial tooling (§2.6) is inaccessible to individual practitioners, small newsrooms, and most academic researchers. The network-level academic methodology (§2.3) typically requires platform partnership or substantial paid API access. The methodology presented here is designed to be applicable on infrastructure that the methodology's intended practitioners can afford, using scraping techniques (§5.3) that work in the post-API-paywall environment.

**A reference implementation alongside the methodology.** Many methodology papers in this space publish methodology without working implementation, leaving practitioners to build their own implementations and to converge or diverge from the published methodology in implementation-specific ways. The methodology is published alongside a reference implementation under AGPL-3.0, which gives practitioners a working starting point and gives reviewers a concrete artifact to evaluate the methodology against. The reference implementation is one realization of the methodology, not the only valid one, and the methodology is platform-agnostic in architecture despite the reference implementation being Cloudflare-pinned.

The combination of these three contributions defines the methodology's position. The methodology does not claim to do something none of the prior work does at any individual layer; it claims to combine commitments, accessibility, and reference implementation in a form that the prior work has not provided together. Practitioners with access to the prior work's individual contributions (paid OSINT tooling, platform partnerships, academic resources) may prefer those over the methodology presented here. Practitioners without access to the prior work's individual contributions have a methodology that meets standards similar to the existing alternatives without requiring the resources that the existing alternatives demand.

## Closing

This section has surveyed the conceptual and empirical landscape against which the methodology positions itself. The remaining sections of the paper develop the methodology itself: the evidentiary framework that everything rests on (§3), the signal taxonomy that the methodology operates on (§4), the collection methodology that produces the underlying archive (§5), the feature extraction that yields the deterministic signal table (§6), the attribution reasoning that produces the substantive output (§7), the output and reporting conventions that govern downstream use (§8), the case study that demonstrates the methodology end-to-end (§9), the ethical considerations that govern the methodology's character (§10), and the limitations and future work that define what the methodology does not yet do (§11). The conclusion (§12) is brief.

A note on citation completeness. The citations in this section are entry points to the broader literature rather than comprehensive bibliographies of any of the surveyed fields. Practitioners and researchers using the methodology should consult the cited works' own bibliographies for the deeper literature, and should treat this section as orientation rather than as authoritative survey. Specific citation details (publication venues, exact titles, page numbers) should be verified against the original sources before publication of work that depends on them.

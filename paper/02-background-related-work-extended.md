# 2. Background and related work

This section places the method against prior work. Section 2.1 defines the terms. Sections 2.2 through 2.10 survey the work that bears on the method. The survey follows the layer of the problem. The layers are automated accounts, network-level coordination, and authorship attribution. They also include OSINT practice, commercial tools, and visual forensics.

They also include networked privacy, threat models for vulnerable people, and the legal and ethical context. Section 2.11 states what this method adds.

The section positions the method. It does not exhaust any field. Treat the citations as entry points. Full details are in the References section. Confirm a publication detail against the original source before you rely on it.

## 2.1 Definitions

Terms in this domain differ across literatures. The method adopts the definitions below and uses them throughout the paper.

**Sockpuppet.** A sockpuppet is an account operated by a person other than the person the account presents. It is also one of several accounts that one person operates while presenting the accounts as independent. The term comes from online forum culture of the late 1990s. Academic work adopted it with later refinements. Examples are Solorio and colleagues, Bhattacharya and colleagues at Stony Brook, and the broader literature on coordinated inauthentic behavior. The method uses the term for the structural condition.

Several accounts share one operator and are presented as independent. The term does not name a specific intent.

**Persona.** A persona is the identity an account presents. One operator may keep several personas on several accounts. The method asks whether those personas share one operator.

**Alias.** An alias is a name an operator uses in place of another name. The method uses alias for the link between one presented identity and the operator's other presented identities. Alias is not a synonym for sockpuppet.

**Pseudonym.** A pseudonym is a name an operator uses in place of a legal name. A pseudonym is not inauthentic by itself. Many lawful uses are protected by professional norms, ethical norms, and legal norms. The literature on networked privacy treats pseudonymity as a privacy practice. See boyd, Marwick, and Nissenbaum, and see §2.8. The method separates coordinated inauthentic use of a pseudonym from legitimate pseudonymity.

Sections 2.3 and 2.8 develop that distinction.

**Automated account or bot.** An automated account posts and engages through software. A person does little or no work on each post. Bot detection is a different problem from sockpuppet attribution. The method is for accounts that people operate. It does not produce a useful output against a fully automated account.

**Coordinated inauthentic behavior (CIB).** Meta, then Facebook, introduced the term in 2018. It named networks of accounts that work together and mislead others about identity or about coordination. Platform literature and academic literature adopted the term. The method uses it in that sense. The accounts work together and present themselves as independent. Later work made the operational definition more precise.

Examples are Pacheco and colleagues, the Stanford Internet Observatory, and the Berkman Klein Center. The method keeps the Meta term and states that the boundary is debated.

**Parallel operator.** A parallel operator is one natural person who operates more than one account. The method attributes accounts to a parallel operator. It does not attribute them to a named natural person. Section 3.3.3 develops that distinction.

**Network attribution.** Network attribution is the act of finding that one operator runs a set of accounts. The method produces that result at cluster level. It does not produce it at the level of a natural person.

## 2.2 Automated-account detection

Detection of automated accounts has a large academic literature and a large applied literature. Cresci (2020), "A decade of social bot detection," in Communications of the ACM, is the best single survey. It is the recommended entry point. The survey covers a decade of work. The sources are the Indiana University Observatory on Social Media, Cresci's group at IIT-CNR in Pisa, and the wider community.

Botometer is the most cited academic tool in this area. Davis, Varol, Ferrara, Flammini, and Menczer introduced it in 2016 as BotOrNot. Later papers refine the classifiers. Yang and colleagues address scale. Varol and colleagues address detection, estimation, and characterization. Cresci and colleagues address adversarial social bots.

The line also extends beyond Twitter. Ferrara and colleagues (2016), "The rise of social bots," is the standard popular account of the problem.

Applied tools outside that academic line include BotSentinel, DataReportal indicators, Truthnest, and platform-internal systems. Bouzy founded BotSentinel. It focuses on Twitter and uses a journalistic method. Applied tools usually do not publish classifier weights or training data. Academic tools more often do.

The Indiana University group also published BotSlayer (Hui et al. 2019) for real-time detection of bot amplification. The Observatory on Social Media keeps a suite of tools for academic users and for journalists. Use those tools as a first filter when a seed set may mix automated accounts and human-operated accounts.

This method addresses the human-operated case. Automated accounts produce patterns that human-operated accounts do not. Examples are a response in milliseconds, exact temporal regularity, and text that a classifier marks as generated. Bot-detection methods do not transfer cleanly to sockpuppet attribution. That literature informs the signal list only as a contrast.

The two problems complement each other. If a network may contain both kinds of account, apply bot detection first. Remove the automated accounts from the seed set. Then apply this method to the rest. The reference implementation supports that order. It does not implement bot detection.

Use an established bot-detection tool for that step.

## 2.3 Coordinated-behavior detection at the network level

A separate literature studies coordinated inauthentic behavior at network level, not at the level of one account. The closest academic frame is Pacheco and colleagues (2021), "Uncovering coordinated networks on social media." That work comes from the Indiana University Observatory on Social Media. It usually covers a large part of a platform graph. It claims that a set of accounts is coordinated. It does not claim that two accounts share one operator.

Nizzoli and colleagues applied coordinated-behavior detection to elections. The cases include the 2019 UK general election and the 2020 US presidential election. That work is useful background for an election investigation.

The Atlantic Council Digital Forensic Research Lab (DFRLab) has published many case reports. The cases include state influence operations, coordinated disinformation, and election-period activity. The DFRLab method is closer to investigative journalism than to an academic method. It reasons case by case. This paper aims to systematize that kind of reasoning so more practitioners can use it. The DFRLab toolkit and method notes are recommended reading.

The Stanford Internet Observatory, under DiResta and others, has published detailed analyses of state networks. Examples include Internet Research Agency operations and Chinese state activity. The work joins technical analysis to a policy frame. Read it beside the more methodological academic literature.

Starbird's group at the University of Washington writes on disinformation campaigns and on crowdsourced participation in a coordinated narrative. The frame is participatory disinformation. It explains how a real community of belief can be drawn into a campaign when not every participant knows about the coordination.

Graphika, a commercial firm, has published substantial analysis, often with a platform or with academic partners. The joint Stanford work on the Internet Research Agency is one example. The Graphika method is proprietary. Public reports state findings. They do not give enough detail for replication outside Graphika tools.

This method differs on three points. It works at cluster level, so an investigation of tens of accounts is in scope. It does not need a platform partnership or paid API access at network-analysis scale. It is published with an explicit method and a reference implementation, so a practitioner outside those institutions can use it.

These differences are different design points. They are not a claim of improvement. A practitioner with a platform partnership and the resources for network-level analysis should use that tooling. This method is for practitioners who do not have those resources.

## 2.4 Authorship attribution

Computational authorship attribution predates social media by decades. Mosteller and Wallace (1964), "Inference and Disputed Authorship: The Federalist," showed that word frequencies can support an authorship inference. Their study of the disputed Federalist Papers set the method that later work extended. Holmes (1998), "The evolution of stylometry in humanities scholarship," gives the history through the 1990s.

Later surveys consolidate the field. Juola (2008), "Authorship attribution," in Foundations and Trends in Information Retrieval, is the fullest treatment through the mid-2000s. Koppel, Schler, and Argamon (2009), "Computational methods in authorship attribution," in JASIST, survey the methods with a focus on supervised learning. Stamatatos (2009), "A survey of modern authorship attribution methods," also in JASIST, is the most cited survey.

Burrows' Delta remains the baseline stylometric method. Burrows (2002), "'Delta': A measure of stylistic difference and a guide to likely authorship," introduced it in Literary and Linguistic Computing. That journal is now Digital Scholarship in the Humanities. This method specifies Delta for the linguistic signals in §4.3.1 and §6.2.3. Delta is simple, and a stated function-word list produces a reproducible distance across compliant implementations. Later work, including Hoover and Eder, studies the properties and the limits.

Motivated authors can defeat stylometric attribution by a systematic change of style. Brennan and Greenstadt (2009), "Practical attacks against authorship recognition techniques," set that frame at IAAI. McDonald, Afroz, Caliskan, Stolerman, and Greenstadt (2012), "Use fewer instances of the letter 'I'," developed it into the Anonymouth tool at Drexel. Afroz, Brennan, and Greenstadt also studied the inverse problem, detection of deliberate stylistic concealment. Section 3.3.4 states that an adapted operator is harder to detect. That defense literature is the specific demonstration.

Narayanan and colleagues (2012), "On the feasibility of internet-scale author identification," showed that attribution among millions of authors is technically feasible. The paper is an IEEE Security and Privacy paper. It raises method questions and ethical questions. The audience limits in §1.2 are informed in part by what large-scale attribution can do.

Short social-media texts are a hard case. A tweet gives much less text than the corpora most stylometric methods used. Section 6.4.1 sets the practical lower bound at several thousand words per account. Below that bound the stylometric signal is unreliable. The method flags insufficient data. It does not attribute from inadequate text.

Academic evaluations usually test authors who have not adapted their writing. A sophisticated operator in this method intends to defeat attribution. Performance against an adapted author is below the published number for an unadapted author. Do not treat the published number as the performance of this method in an adversarial setting.

## 2.5 OSINT practitioner methodology

Open-source intelligence practice is largely maintained by communities, not by academic journals. Bellingcat, founded by Higgins, published an online investigator's guide. That guide is the standard practitioner reference for OSINT on social media. It covers collection, verification, ethics, and case studies. It overlaps this method in scope. The target output differs.

Higgins (2021), "We Are Bellingcat," gives the history and the operational context.

The Bellingcat guide serves a one-off investigation of a specific subject. The usual product is an investigative report, not a structured method output. This method produces an evidence packet for use beyond the investigation. Examples are a court filing, peer review, and replication by another practitioner. The two approaches complement each other. A practitioner should know both.

Other community resources extend or specialize that guide. Bazzell, "Open Source Intelligence Techniques," now in a tenth edition, is the standard reference for specific tools. OSINT Curious, the IntelTechniques community, Trace Labs, and others keep practitioner resources at different levels of formality. Those resources cover geolocation, archive preservation, social engineering, and blockchain analysis. They do not focus on the network-attribution problem in this paper.

Academic work on OSINT method is thinner and is growing. Glassman and Kang (2012), "Intelligence in the internet age," give an academic frame. Crossover work appears in the Journal of Strategic Security and in the International Journal of Intelligence and Counterintelligence.

This method stresses an explicit confidence band and a custody chain. OSINT practice tends toward judgment on one case. That fit is right for much journalism and investigative research. This method gives up some of that flexibility. It gains the reproducibility that a court and a peer review require.

## 2.6 Commercial and proprietary tooling

Commercial tools include Graphika, Recorded Future, Flashpoint, ZeroFox, Maltego, and Palantir platforms. Major platforms also keep internal trust and safety tools. These tools exceed this method on several axes. They ingest more data. The analysis is more elaborate. Dedicated staff apply the tool to a case.

The tool connects to later operational systems.

The intended practitioner cannot use most of this tooling, for two related reasons. The license cost is beyond an individual, a small newsroom, and most academic researchers. The method inside the tool is proprietary. Even a practitioner who can pay cannot publish work that an outsider can check, because the method is not documented outside the firm.

Major platforms also run internal detection on data this method does not have. Public documents describe findings and do not disclose enough method for an outside evaluation. Examples are the Meta threat-report series, Twitter transparency reports from the open-API period, and publications from the Google Threat Analysis Group. Those systems are the most capable in the landscape. They are also the least accountable to an outsider. There is no outside view of the method, the error rate, or the decision process.

Section 10.6 argues that closed methods are part of the case for an open method. An open method brings outside accountability to a domain where closed methods have none.

## 2.7 Image and visual forensics

The visual signals in §4.5 draw on image forensics. That literature is separate from social-media investigation.

Perceptual hashing dates to the late 1990s and was consolidated in the 2000s. Zauner (2010), "Implementation and Benchmarking of Perceptual Image Hash Functions," is the reference for the technique. The thesis is from the University of Applied Sciences, Hagenberg. The pHash family and the dHash family in §6.2.5 are standard, and implementations are widely available. Farid (2009), "Image forgery detection," in IEEE Signal Processing Magazine, surveys techniques beyond perceptual hashing. Read it before you rely on a visual signal.

Detection of GAN images is newer and changes quickly. Marra, Gragnaniello, Cozzolino, and Verdoliva (2018) were an early contribution on GAN images over social networks. Wang, Wang, Zhang, Owens, and Efros (2020), "CNN-generated images are surprisingly easy to spot... for now," is the most cited paper on the detection problem. Several later detectors build on it. Rossler and colleagues (2019), "FaceForensics++," extend detection to face manipulation beyond pure GAN synthesis.

Verdoliva (2020), "Media forensics and deepfakes: an overview," gives the state of the field.

The field is an arms race. Detector performance against the latest synthesis model lags the model. Section 4.5.5 states the response. Treat a positive detection as a strong signal. Treat a negative detection as inconclusive.

Reverse image search is community practice, not a single academic literature. The Bellingcat guide and Bazzell document the technique. Google, Yandex, TinEye, and Bing index different sources. Standard practice is to use more than one.

## 2.8 Networked privacy and pseudonymity scholarship

Scholarship on networked privacy and pseudonymity bears directly on the ethical posture, and on the audience limits in §1.2 and §10.2. This subsection surveys work that treats pseudonymity as a legitimate privacy practice and that documents the people for whom it is a safety measure.

Nissenbaum (2009), "Privacy in Context," sets the contextual-integrity frame. Privacy is the appropriate flow of information inside the norms of a context. It is not a binary of public and private. A person who uses one account in one context and another account in another context exercises that integrity. The person is not engaged in inauthentic behavior. The exclusion in §4.8.2, of signals that mainly detect legitimate pseudonymity, rests on this frame.

boyd (2014), "It's Complicated: The Social Lives of Networked Teens," documents how younger users build privacy. They use obscurity, separate identities on separate platforms, and audience management. They do not rely only on a technical access control. boyd and Marwick (2014), "Networked privacy," in New Media & Society, is the frame most relevant to multi-account use as a privacy practice.

Marwick's wider work includes the 2018 volume "Privacy at the Margins," edited with Fontaine and Lewis. It documents how marginalized people build privacy under conditions that a mainstream frame does not cover. The volume treats LGBTQ youth, sex workers, undocumented immigrants, and survivors of intimate-partner violence. Section 1.2 names those populations as outside the scope of this method.

Tufekci (2017), "Twitter and Tear Gas," describes platform-mediated organization in social movements. Activists in an authoritarian context use pseudonymity for safety and for effect. The cases include protests in Turkey, the Egyptian uprising, and protests in Hong Kong. Attribution applied there would have caused direct harm.

Phillips and Milner (2017), "The Ambivalent Internet," describe how online communities build identity through a complex relation to authenticity. That relation includes lawful use of more than one account and more than one persona.

Donovan, at the Shorenstein Center and later at her own center, developed media manipulation as a frame distinct from disinformation. The work shows that a vulnerable population can be the target of a manipulation campaign and can also use a pseudonym for a legitimate purpose. A frame that treats every pseudonym as suspect cannot hold both facts.

## 2.9 Threat modeling for vulnerable populations

A later literature builds threat models for specific vulnerable populations. Platform tools and investigation methods can cause harm even when the intent is good.

Matthews and colleagues (2017), "Stories from survivors," is a foundational CHI paper on intimate-partner abuse. It documents how a survivor builds privacy under an ongoing threat from a person who knows their identity well. Read it before you apply an attribution method where intimate-partner abuse may be relevant.

Lerner, Zeng, and Roesner (2020) study threat models for queer YouTube users. The work explains how a content creator uses a pseudonym against possible exposure. It generalizes to wider queer use of platforms. It is background for the exclusion in §10.2.2.

McGregor and colleagues at the University of Washington write on threat models for journalists who work with sources. Source protection can require the journalist's own pseudonymity. That model overlaps the protection for a journalist's source in §10.2.4.

A wider literature on usable security for vulnerable people supplies the frame. Examples are Wuyts and colleagues on threat-model method, and papers at USENIX SOUPS on population-specific threat models. The exclusions in §1.2 and §10.2 follow what that literature has shown. The populations that need structural protection against attribution are already named there. The exclusions are not a new claim.

## 2.10 Legal and ethical context

United States federal litigation in *hiQ Labs v. LinkedIn* (2017 through 2022) shaped the legal context for collection of public platform data. Ninth Circuit rulings narrowed the Computer Fraud and Abuse Act for scraping of a public profile. Public-data scraping is not unauthorized access for CFAA purposes under those rulings. *Van Buren v. United States* (2021) is not a scraping case.

It narrowed CFAA interpretation more broadly and is relevant context. Law outside the United States differs by jurisdiction. The EU GDPR creates duties for personal data even when the data is technically public. Other jurisdictions have specific scraping statutes. Consult counsel.

The ethical literature on online harassment is substantial. Citron (2014), "Hate Crimes in Cyberspace," treats online harassment as distinct from offline harassment, with attention to gendered patterns. Citron (2022), "The Fight for Privacy," extends the frame to privacy as a civil right. Work with Franks addresses regulation of nonconsensual intimate imagery and related harms.

Phillips (2015), "This Is Why We Can't Have Nice Things," gives cultural context for troll communities and harassment culture. That context helps a reader understand the social setting of a sockpuppet network. The later book with Milner, cited above, extends the cultural frame.

Marwick and Lewis (2017), "Media Manipulation and Disinformation Online," from Data & Society, is the foundational practitioner-academic document. It is the recommended entry point. Later Data & Society reports extend the frame to specific cases and populations.

Platform policy on coordinated inauthentic behavior follows Meta's 2018 framing and later operational definitions. Several public series show what platforms treat as in scope. They include quarterly Meta reports and Twitter transparency reports from the open-API period. They include Google Threat Analysis Group publications and similar documents from other platforms. The detail and the reliability are uneven. They are still a baseline for comparison.

Four academic centers produce much of the work in this space. They are the Berkman Klein Center at Harvard and the Stanford Internet Observatory. They include the Oxford Internet Institute programme, formerly the Computational Propaganda Project and now the Programme on Democracy and Technology. They include the Shorenstein Center at Harvard Kennedy School. Their publications are recommended for a practitioner or a researcher who uses this method.

## 2.11 What this methodology contributes

The method contributes three things that the surveyed work does not provide together.

**A documented practitioner method with explicit commitments.** OSINT practice (§2.5) is documented and usually lacks the custody rule and the confidence calibration specified here. Academic authorship attribution (§2.4) has explicit commitments and does not cover the wider signal list. Network-level detection (§2.3) addresses platform-scale coordination, not cluster attribution at the scale one practitioner faces. Commercial tools (§2.6) use an undocumented method. An outsider cannot check the work or repeat it. This method fills that gap.

A practitioner can follow the commitments. A reviewer can evaluate the work against them.

**Access for practitioners outside a well-resourced institution.** Commercial tools (§2.6) are out of reach for an individual, a small newsroom, and most academic researchers. Network-level academic work (§2.3) usually needs a platform partnership or substantial paid API access. This method is meant to run on infrastructure those practitioners can afford. Collection in §5.3 is designed for the period after API prices rose.

**A reference implementation beside the method.** Many papers in this space publish a method and no working implementation. Practitioners then build their own code and drift from the paper in ways a reader cannot see. This method is published with a reference implementation under AGPL-3.0-only. A practitioner has a working start. A reviewer has a concrete artifact. The reference implementation is one realization.

It is not the only valid one. The architecture is not tied to one platform. The reference deployment uses Cloudflare.

Together, these three points define the position. The method does not claim a result that no prior work achieves at any single layer. It claims the combination. A practitioner who already has paid OSINT tools, a platform partnership, or academic resources may prefer those. A practitioner without them has a method that meets a similar standard and does not demand those resources.

The method also takes the privacy literature and the threat-model literature (§2.8 and §2.9) as constraints. Pseudonymity is a legitimate privacy practice for many people. An attribution method can harm those people. The audience limits in §1.2, the excluded signals in §4.8, and the ethics in §10 accept those constraints. The constraints are part of what makes the method defensible.

## Closing

This section surveyed the landscape the method stands in. Later sections develop the method. Section 3 is the evidentiary framework. Section 4 is the signal list. Section 5 is collection. Section 6 is feature extraction.

Section 7 is attribution. Section 8 is output and reporting. Section 9 is the case-study placeholder. Section 10 is ethics. Section 11 is limits and later work. Section 12 is a short conclusion.

Bibliographic details are in the References section. Confirm a citation detail against the original source before you publish work that depends on it. Where a venue, a date, or a title is uncertain, the References section marks the entry for confirmation.

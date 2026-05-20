# 10. Ethical considerations

The methodology is published in a domain where the same techniques that document coordinated inauthentic behavior can be used to unmask people who have legitimate reasons to operate behind pseudonyms. The mitigations developed throughout the paper (cluster-level attribution, declination by default, deliberately excluded signal categories, audience exclusions, the prohibition against natural-person identification) are partial. They make casual misuse harder. They do not eliminate misuse, and they cannot.

This section returns to the ethical issues already raised in §1.4 and threaded through §3.3, §4.8, §5.3.5, §8.3.3, and §8.4, and engages with them at the depth they require. The questions taken up here are: what dual-use means as a substantive ethical problem rather than as a design constraint (§10.1), what specific safety harms the methodology could enable and what its structural commitments do about them (§10.2), how to think about the unresolved trade-off between utility and harm (§10.3), the ethics of scraping platforms that prohibit it (§10.4), responsible handling of information that exceeds the methodology's intended scope (§10.5), the argument for publishing the methodology rather than concealing it (§10.6), practitioner accountability and the questions practitioners should ask themselves before applying the methodology (§10.7), and how the methodology responds when its own constraints fail (§10.8).

Ethics in this domain is not a checklist. The methodology takes positions that some readers will disagree with, accepts costs that the methodology itself cannot fully bear, and depends on practitioner judgment in ways that no published methodology can mechanically enforce. The discussion that follows is the honest articulation of these positions, not a defense against criticism.

## 10.1 Dual-use as substantive ethical problem

Dual-use is the standard framing for technologies that can be applied for good or harm. The phrase is often used as a way to acknowledge the problem without engaging with it. The methodology requires a more substantive engagement.

The substantive problem is this: every capability the methodology provides to a practitioner investigating a coordinated harassment network is the same capability it provides to a stalker investigating a former partner who has set up new accounts to escape them. Every signal that helps document election interference helps a repressive regime track dissidents who use multiple accounts to organize. The capabilities are not separable from their misuse. A methodology that successfully attributes coordinated networks will, by construction, sometimes also successfully attribute legitimate pseudonymous networks.

The methodology's mitigations narrow this surface but do not eliminate it. Cluster-level attribution makes natural-person identification a separate step that the methodology does not perform, but a determined misuser who has cluster attribution can take the next step using offline tools the methodology does not control. The declination rule prevents the methodology from manufacturing weak attribution claims, but a misuser who controls the practitioner role can override the rule in their own implementation. The audience exclusions are statements of intent, not technical controls.

The ethical question is therefore not whether the methodology could be misused (it can) but whether publishing the methodology with these partial mitigations produces a net change for the better or worse. This is the substantive question, and it does not have a clean answer.

The arguments for publication are developed at §10.6. They rest on three claims: that closed methodologies in this space already exist and harm the populations that lack access to comparable techniques, that publishing a methodology with explicit ethical commitments shifts practice toward better defaults than artisanal work without published commitments, and that the practitioners served by the methodology (pro se litigants, small newsrooms, OSINT researchers, academics) are systematically underserved by the existing tooling landscape in ways that produce real harm.

The arguments against publication rest on the observation that mitigations are partial, that determined misusers will use the methodology in ways the methodology disavows, and that some populations of legitimate pseudonymous users will be harmed at the margin by the methodology's existence regardless of what the methodology says about its intended use.

The methodology takes the position that the arguments for publication are stronger than the arguments against, and explains the reasoning at §10.6. Readers who reach a different conclusion are entitled to it. The methodology is published in a state of partial certainty about its own ethical character, not in confidence that the position taken is unimpeachable.

## 10.2 Specific safety harms

The audience exclusions stated at §1.2 named populations the methodology is not for. This subsection engages with what could happen if the methodology is misused against those populations, and what the methodology's structural commitments do (and do not do) to prevent it.

### 10.2.1 Domestic abuse survivors

A survivor of intimate-partner abuse may operate multiple accounts as a safety strategy: an account known to the abuser that maintains the appearance of pre-separation life, an account known to support networks that documents the abuse, an account used to communicate with attorneys and shelters. The accounts may be linked behaviorally in ways the methodology could detect: shared writing style, correlated activity patterns, shared follower bases.

The methodology in §1.2 names this use case as outside its scope and refuses to support it. The structural commitments at §3.3.3 (no natural-person identification) and §8.3.3 (specific guidance against intimate-partner use) reinforce the refusal. The methodology, as published, instructs practitioners not to apply it in these contexts.

What the methodology cannot do is technically prevent a misuser from running the reference implementation against accounts they believe belong to a survivor. The mitigation is the audience exclusion as a statement, the lack of natural-person identification in the output, and the practitioner's responsibility to refuse misuse. None of these prevents a determined abuser who controls their own practitioner role.

The methodology's honest position is that survivors are at marginally greater risk because the methodology exists than they would be otherwise. The marginal risk is real and is not erased by the methodology's stated intent.

### 10.2.2 LGBTQ people in unsafe jurisdictions

LGBTQ people in jurisdictions where their identity carries legal or social risk often operate multiple accounts: an account presenting an identity that is safe in their immediate context, an account participating in queer communities that would not be safe in their immediate context, and various transitions between the two. The accounts may show stylometric and behavioral patterns that the methodology could detect.

The methodology refuses this use case at §1.2 and at §4.8.2 (signals that primarily detect legitimate pseudonymity are deliberately excluded). The methodology's stated intent is to detect coordinated inauthentic behavior, not pseudonymity that is itself a safety mechanism. Practitioners using the methodology to out queer people in unsafe contexts are operating outside the methodology's scope.

The same limit as §10.2.1 applies: the methodology cannot technically prevent misuse, and the affected populations are at marginally greater risk because the methodology exists.

### 10.2.3 Political dissidents

Dissidents in authoritarian states use multiple accounts to organize, to circumvent platform-level censorship, to communicate with international audiences, and to protect themselves from state retaliation. Repressive states and their allied actors are among the most resourced potential misusers of attribution methodology.

The methodology refuses this use case but is most exposed to misuse here because state actors typically have the resources to implement methodologies independently of the methodology authors' intent. A repressive state that finds this paper useful will fork the reference implementation, strip out the constraints, and run the methodology with their own modifications. The methodology cannot prevent this, and the constraints stated in the paper cannot bind a state actor.

The methodology's position is that the question for state misuse is not whether the methodology is published; state actors have access to attribution techniques regardless of whether this methodology specifically is published. The marginal contribution of this paper to state misuse capability is small, and the marginal benefit to the legitimate practitioners the methodology serves is comparatively larger. This is a calculation, not a guarantee, and reasonable readers may disagree.

### 10.2.4 Witnesses, whistleblowers, and sources

Witnesses in legal proceedings, whistleblowers documenting institutional malfeasance, and journalistic sources protected by source-protection norms may use pseudonymous accounts for legitimate purposes. The methodology refuses to support attribution against these uses.

The methodology's particular concern here is that the practitioners served by the methodology (pro se litigants, journalists) overlap with the contexts where these populations exist. A journalist using the methodology must take care that the methodology is not turned against their own sources. A pro se litigant using the methodology must take care that the methodology is not turned against witnesses in their own case. The practitioner's vigilance is the safeguard; the methodology's audience-exclusion statements do not substitute for it.

### 10.2.5 Recovery community members and mental health support seekers

Members of recovery communities (substance use disorder, eating disorders, gambling, behavioral compulsions) and mental health support seekers often operate accounts that they would not want connected to their other online identities. The methodology refuses to support attribution against these uses.

The harm scenario is specific. A practitioner who uses the methodology against a person they are in conflict with may inadvertently surface this person's recovery-community participation, even if the practitioner does not specifically target it, because the recovery account shares stylometric or behavioral patterns with the conflict-context account. The methodology's cluster-level attribution would link the accounts. The natural-person identification step that the methodology does not perform is then performed by the practitioner using offline tools.

The methodology's structural commitments do not prevent this. The mitigations are practitioner restraint and the natural-person identification exclusion at §3.3.3. The methodology takes the position that practitioners using the methodology against people they are in conflict with should pause and consider whether the investigation's incidental discoveries are something they can responsibly handle.

### 10.2.6 Children and minors

The methodology specifically excludes its use against accounts operated by minors and against networks whose members are minors. This is a categorical exclusion. Children using pseudonymous accounts for any reason are not a population the methodology is designed to investigate, and the methodology offers no benefit that could outweigh the harm of misuse against this population.

Practitioners encountering minor-operated accounts in an investigation should treat the encounter as a stop condition: the investigation does not extend to the minor accounts, and the practitioner is responsible for not surfacing information about minors as a byproduct of the investigation.

### 10.2.7 Trans and gender-variant people

Trans and gender-variant people often maintain accounts that reflect different points in their identity journey. Pre-transition accounts may still exist alongside post-transition accounts. The accounts may share behavioral patterns the methodology could detect. The methodology refuses to support attribution that would out a trans person against their will or that would link their pre-transition and post-transition identities without their consent.

This exclusion is in the same category as §10.2.2 (LGBTQ populations in unsafe contexts) but warrants specific mention because the pattern of pre- and post-transition accounts is structurally common across trans communities and produces signal patterns that look like sockpuppetry from a methodology blind to the context.

### 10.2.8 Sex workers

Sex workers maintain multiple accounts for safety reasons: a work account with operational privacy from civilian life, a civilian account with operational privacy from clients, accounts used to communicate with workplace networks. The methodology refuses to support attribution against these uses.

The harm scenarios include outing to family or employers, exposure to law enforcement in jurisdictions where the work is criminalized, and exposure to stalkers using attribution to bridge across the safety separations the worker has constructed. The methodology's cluster-level attribution would defeat these separations if applied. The practitioner is responsible for not applying it.

## 10.3 The unresolved trade-off

The mitigations developed throughout the paper raise the floor of casual misuse. They do not raise the ceiling. A determined misuser with technical resources and access to the reference implementation can apply the methodology against populations the methodology refuses to serve, and the methodology cannot prevent this.

The unresolved trade-off is that the populations the methodology serves and the populations the methodology refuses to support overlap structurally. A pro se litigant documenting coordinated harassment is sometimes a stalker constructing a paper trail. A small-newsroom journalist investigating coordinated inauthenticity is sometimes a journalist with an agenda against a target. An OSINT researcher studying coordinated networks is sometimes a researcher whose definition of "coordinated network" is calibrated to find what they want to find. The methodology cannot distinguish these cases from the outside.

The methodology accepts that some practitioners will use it for purposes the methodology disavows. The methodology's response is the position taken at §10.7 (practitioner accountability) and at §10.8 (the methodology's disavowal of misuse). These responses are moral, not technical. They are the strongest responses the methodology can offer.

Readers who find this insufficient are not wrong to find it insufficient. Insufficiency is the honest state of the trade-off.

## 10.4 Platform terms of service and the ethics of scraping

Most major social platforms prohibit scraping in their terms of service. The methodology operates by collecting data that is, in most cases, prohibited from being collected at the scale and form the methodology requires. This raises an ethical question independent of the legal exposure already noted at §5.3.5.

The ethical question is whether operating against platforms' stated wishes is defensible. The methodology takes the position that it is, for reasons specific to the platforms' role in the harms the methodology addresses.

Platforms are not neutral parties in the existence of coordinated inauthentic behavior on their services. The same platforms whose terms of service prohibit scraping also operate trust-and-safety systems that fail to detect coordinated networks at scale, charge for the API access that would make detection feasible without scraping, and benefit financially from the engagement that coordinated networks generate. The platforms' terms of service in this area do not reflect a principled position on data ethics; they reflect a commercial position on who is entitled to operate against their service.

The methodology operates against platforms' terms of service when the alternative is non-detection. Practitioners working on coordinated inauthentic behavior, particularly small practitioners who cannot afford paid API access at the volumes detection requires, have a defensible interest in collecting public platform data despite the platforms' prohibition. The defensibility is contextual: a journalist scraping to investigate a documented harassment campaign has a stronger position than a casual user scraping to feed a personal grievance.

The methodology does not endorse scraping against platform wishes in general. It defends scraping in the specific contexts the methodology supports. Practitioners using the methodology for purposes outside those contexts do not inherit the methodology's defense of scraping; they need their own justification for the collection their use requires.

Legal exposure for scraping is a separate question from ethical exposure, and the legal question is jurisdiction-dependent in ways the methodology cannot speak to. The §5.3.5 instruction to consult counsel before relying on collected data in adversarial contexts stands.

## 10.5 Responsible handling of incidental discovery

Investigations frequently surface information that exceeds the methodology's scope. A network being investigated for coordinated inauthenticity may include accounts that incidentally reveal mental health information, addiction recovery participation, sexual or gender identity, immigration status, employment information, financial difficulty, or other sensitive matters. The practitioner did not investigate these matters and is not investigating them, but the data is in front of them.

The methodology's position is that incidental discoveries are not the practitioner's to handle. The investigation is bounded by its stated scope; data that exceeds the scope is not part of the investigation's output, is not part of the evidence packet, and is not part of any downstream publication.

The practical implication is that practitioners conducting investigations should maintain discipline about what their investigation is about. An investigation into coordinated inauthentic behavior is about that, and it remains about that even when the investigation surfaces other things. Reframing an investigation midstream to take advantage of incidental discoveries is methodologically and ethically improper.

This applies particularly to investigations conducted in legal contexts. A pro se litigant who discovers that an opposing party operates accounts revealing sensitive personal information does not get to introduce that information into the case because the methodology surfaced it. The information may be relevant to a different proceeding under different rules; it is not relevant to the proceeding the methodology was applied for.

The reference implementation supports this discipline by structuring outputs around the cited signals and the attribution claims, not around incidental observations. Practitioners who want to record incidental observations for their own reference can do so in working notes that stay internal (per §8.2.3), but the evidence packet and any published output are limited to the investigation's stated scope.

## 10.6 The argument for publishing the methodology

The case for publishing the methodology, rather than concealing it or restricting its distribution, rests on three claims.

**First, closed methodologies in this space already exist and produce harm.** Major platforms maintain internal coordinated-behavior detection that they do not publish and that operates without external accountability. Commercial OSINT firms maintain proprietary methodologies that serve clients with budgets that pro se litigants and small newsrooms cannot match. Intelligence services maintain attribution methodologies that operate at scales the methodology cannot approach. The capability exists in the world. It is unevenly distributed. The populations harmed by the uneven distribution are the same populations the methodology serves: pro se litigants, small newsrooms, OSINT researchers, academics, and trust-and-safety teams at smaller platforms.

A published methodology shifts the distribution. It gives the underserved populations access to a comparable capability, accountable to the explicit commitments stated in the paper, with the chain-of-custody and reproducibility properties that allow downstream verification. Closed methodologies in this space do not have these properties; even when they are applied with care, their applications are not externally verifiable.

**Second, published methodologies with explicit commitments shift practice toward better defaults.** Practitioners working on coordinated-behavior attribution before this paper was published have already been doing this work, mostly artisanally, mostly without explicit methodology, mostly without chain-of-custody discipline, and mostly without the audience exclusions and signal exclusions that the methodology requires. A methodology paper raises the baseline expectation for what good practice looks like. Practitioners who continue to do artisanal work after the methodology is published can be measured against a published standard. Reviewers, judges, peer reviewers, and editors can evaluate practitioners' work against the methodology's commitments.

The publication is therefore not a contribution to the field's existence (the field already exists) but a contribution to the field's standards.

**Third, the practitioners served by the methodology have legitimate interests that are currently underserved.** Pro se litigants documenting coordinated harassment in their cases have legitimate evidentiary interests that current tooling does not serve. Small-newsroom journalists investigating coordinated inauthentic behavior have legitimate investigative interests that commercial OSINT firms do not serve at a price they can afford. Academic researchers studying coordinated inauthentic behavior have legitimate research interests that platform-internal data does not serve, because platform-internal data is not academically available. These interests are real, the absence of accessible tooling produces real harm, and the publication of the methodology addresses the gap.

The countervailing claim is that the methodology marginally increases the capability of misusers and marginally harms the populations the methodology cannot fully protect. The methodology's position is that the marginal harm to legitimate-pseudonymity populations is real but is smaller than the marginal benefit to legitimate practitioners, and that publication is therefore on balance the right choice.

This is a position, not a proof. Readers who weigh the harms differently are entitled to a different conclusion. The methodology takes its position openly so that the disagreement, if it exists, is visible.

## 10.7 Practitioner accountability

The methodology cannot police itself. The mitigations specified throughout the paper depend on practitioner adherence, and adherence is voluntary. Practitioners using the methodology accept responsibility for downstream use that the methodology specifies as outside its scope but that the practitioner could nonetheless undertake.

The methodology asks practitioners to engage with several questions before applying it to a specific investigation:

**Does my use fall inside the audience the methodology is designed to serve?** The audience exclusions at §1.2 are tests. If the investigation targets accounts whose operators would, on reading the methodology, recognize themselves as protected populations rather than as coordinated-inauthenticity actors, the use is outside the methodology's intended audience.

**Am I prepared to acknowledge the methodology's limits in adversarial settings?** Court filings, journalistic publication, academic publication, and other adversarial contexts will subject the methodology's output to scrutiny. Practitioners using the methodology should be prepared to defend not just the application but the methodology's commitments, including the commitments that produce conclusions less favorable to the practitioner than alternative methodologies might produce.

**Am I treating the basis statements as factual context or as conclusions to be confirmed?** §5.1.1 required basis statements before any signal extraction. The discipline is wasted if the practitioner writes basis statements that effectively prejudge the investigation's outcome.

**Am I prepared to honor the declination rule?** When the methodology returns "insufficient evidence," the practitioner is prepared to accept that result rather than seeking to manufacture attribution through alternative means. Practitioners who set up an investigation in advance of an expected attribution and then find the methodology unwilling to support that attribution must respect the methodology's conclusion.

**Am I prepared to acknowledge incidental discoveries as out of scope?** §10.5 requires practitioners to keep investigations bounded by their stated scope even when the data surfaces other matters. Practitioners who would find it difficult to discipline themselves in this way should not begin investigations they will not be able to keep contained.

The methodology does not require practitioners to commit to these answers formally. It requires only that practitioners engage with the questions before applying the methodology. The reference implementation does not check whether practitioners have engaged; this check is the practitioner's own.

## 10.8 When the methodology's constraints fail

The methodology's constraints are not technically enforced. The reference implementation could be forked to strip out the declination rule, lower the confidence thresholds, remove the audience exclusions, or add natural-person identification. Practitioners could publish attribution outputs the methodology refused to support. Implementers could lower the thresholds in deployments that present themselves as Common Thread implementations but operate outside the methodology's commitments.

The methodology's response is disavowal. Forks that strip out the abuse mitigations are not extensions of the methodology; they are forks that no longer implement it. Publications that present unsupported attribution claims using the methodology's name are misrepresenting the methodology. Implementations that lower the thresholds are not running Common Thread, regardless of how they present themselves.

Disavowal is a moral act, not a technical control. The methodology cannot prevent forks, cannot prevent misuse of its name, and cannot prevent misrepresentation of its outputs. What the methodology can do is be specific about what it does and does not commit to, so that practitioners, reviewers, and downstream consumers can evaluate whether a specific application meets the methodology's stated requirements.

The published paper and the reference implementation are the canonical statements. Implementations that diverge from these in ways that affect the ethical commitments should not be treated as the methodology. Authors of such implementations should rename their work; users of such implementations should be aware that they are operating outside the methodology's commitments.

The methodology's strength against fork-based misuse is reputational rather than technical. The methodology asks users, reviewers, and the broader community to enforce the distinction between Common Thread as published and other work that uses the name or the techniques without the commitments. This enforcement is partial and is not a substitute for the technical controls that the methodology cannot provide, but it is the strongest tool the methodology has.

## Closing

Ethics in this domain is not resolved by careful design. The methodology has costs that its mitigations cannot eliminate. The methodology has benefits that its publication is intended to make available to populations underserved by existing tooling. The argument for publication is that the benefits outweigh the costs in the aggregate. The argument has uncertainties that the methodology states openly rather than concealing.

Practitioners using the methodology should be aware that their specific use makes the methodology better or worse for the world. The methodology, taken in the abstract, neither helps nor harms; it is the applications, conducted by practitioners who understand or do not understand the commitments, that determine the methodology's effect in any specific case. The practitioner is responsible for whether their use is the kind the methodology is for.

The next section returns to the methodology's limits and to the future work the methodology suggests but does not undertake. Limitations and ethical considerations are related; the limits define what the methodology cannot do, and the ethical considerations define what the methodology should not do even when it could. Both shape the methodology's character together.

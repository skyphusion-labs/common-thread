# 10. Ethical considerations

The same technique that documents coordinated inauthentic behavior can unmask a person who has a legitimate reason to use a pseudonym. The mitigations in this paper are partial. They are cluster-level attribution, declination by default, excluded signals, audience limits, and the ban on natural-person identification. They make casual misuse harder. They do not remove misuse, and they cannot.

This section returns to issues raised in §1.4 and carried through §3.3, §4.8, §5.3.5, §8.3.3, and §8.4. It treats them at the depth they need. Section 10.1 treats dual use as an ethical problem, not only as a design constraint. Section 10.2 names specific safety harms and what the structural commitments do about them. Section 10.3 states the unresolved trade-off between utility and harm. Section 10.4 treats the ethics of collection against a platform term of service.

Section 10.5 treats information that exceeds the stated scope. Section 10.6 argues for publication. Section 10.7 states practitioner accountability and the questions to ask before use. Section 10.8 states the response when a constraint fails.

Ethics here is not a checklist. The method takes positions some readers will reject. It accepts costs it cannot fully bear. It depends on practitioner judgment that no paper can enforce in code. The discussion below states those positions. It is not a defense against criticism.

## 10.1 Dual-use as substantive ethical problem

Dual use is the usual frame for a technology that can help or harm. The phrase often names the problem and then leaves it. This method needs a more direct treatment.

The problem is this. The method gives a practitioner a set of capabilities for a harassment network. A stalker who investigates a former partner with new accounts receives the same capabilities. Every signal that documents election interference helps a repressive state track a dissident who uses several accounts to organize. The capability and the misuse are not separable. A method that attributes a coordinated network will, by its design, sometimes also attribute a legitimate pseudonymous network.

The mitigations narrow that surface. They do not remove it. Cluster-level attribution makes natural-person identification a later step the method does not perform. A determined misuser who has the cluster can take that step with offline tools the method does not control. The declination rule stops the method from inventing a weak claim. A misuser who controls the practitioner role can override the rule in their own code.

An audience limit is a statement of intent. It is not a technical control.

The ethical question is therefore not whether misuse is possible. Misuse is possible. The question is whether publication with these partial mitigations changes the balance for the better or for the worse. That question has no clean answer.

Section 10.6 develops the arguments for publication. They rest on three claims. Closed methods in this space already exist, and they harm people who lack a comparable technique. A published method with explicit commitments moves practice toward better defaults than undocumented work. The people this method serves are pro se litigants, small newsrooms, OSINT researchers, and academics. Existing tools underserve them in ways that cause real harm.

The arguments against publication are also real. The mitigations are partial. A determined misuser will apply the method to a use the method rejects. Some legitimate pseudonymous users will be harmed at the margin by the existence of the method, whatever the paper says about intended use.

The method holds that the arguments for publication are stronger. Section 10.6 explains that judgment. A reader who reaches a different conclusion is entitled to it. The method is published with partial certainty about its ethical character. It does not claim that the position is beyond challenge.

## 10.2 Specific safety harms

Section 1.2 names populations the method is not for. This subsection states what can happen if the method is misused against those populations. It also states what the structural commitments do, and what they do not do.

### 10.2.1 Domestic abuse survivors

A survivor of intimate-partner abuse may keep several accounts as a safety strategy. One account, known to the abuser, keeps the appearance of life before separation. One account, known to a support network, documents the abuse. One account is used with an attorney or a shelter. The accounts may be linked in ways the method could detect. Examples are a shared writing style, a correlated activity pattern, and a shared follower base.

Section 1.2 places this use outside the scope and refuses to support it. Section 3.3.3 bans natural-person identification. Section 8.3.3 gives specific guidance against intimate-partner use. The published method tells the practitioner not to apply it in these contexts.

The method cannot technically stop a misuser from running the reference implementation against accounts they believe belong to a survivor. The mitigations are the audience statement, the lack of a natural-person name in the output, and the practitioner's duty to refuse misuse. None of these stops a determined abuser who controls their own practitioner role.

The honest position is this. Survivors are at marginally greater risk because the method exists. That risk is real. The stated intent does not erase it.

### 10.2.2 LGBTQ people in unsafe jurisdictions

An LGBTQ person in a jurisdiction where identity carries legal risk or social risk often keeps several accounts. One account presents an identity that is safe in the immediate context. Another participates in a queer community that would not be safe there. Transitions between the two are common. The accounts may show stylometric patterns and behavioral patterns the method could detect.

The method refuses this use in §1.2 and in §4.8.2. Signals that mainly detect legitimate pseudonymity are excluded. The stated intent is coordinated inauthentic behavior, not a pseudonym that is itself a safety measure. A practitioner who uses the method to expose a queer person in an unsafe context is outside the scope.

The same limit as §10.2.1 applies. The method cannot technically prevent misuse. The affected people are at marginally greater risk because the method exists.

### 10.2.3 Political dissidents

A dissident in an authoritarian state uses several accounts. The uses are organization, passage around platform censorship, and contact with an international audience. Another use is to reduce the risk of state retaliation. A repressive state and its allies are among the best-resourced misusers of an attribution method.

The method refuses this use. It is most exposed here. A state actor has the resources to implement a method without regard to the author's intent. A state that finds this paper useful will fork the reference implementation, remove the constraints, and run the changed code. The method cannot prevent that. A sentence in the paper cannot bind a state.

The position is that state misuse does not turn on whether this paper is published. State actors have attribution techniques whether or not this method is public. The marginal addition of this paper to state capability is small. The marginal benefit to the legitimate practitioners is larger by comparison. This is a calculation, not a guarantee. A reasonable reader may disagree.

### 10.2.4 Witnesses, whistleblowers, and sources

A witness, a whistleblower, and a journalistic source may use a pseudonymous account for a legitimate purpose. Source-protection norms cover the journalistic case. The method refuses attribution against these uses.

The particular concern is overlap. The practitioners this method serves include pro se litigants and journalists. Those are also the contexts where these populations exist. A journalist must take care that the method is not turned on their own sources. A pro se litigant must take care that the method is not turned on a witness in their own case. Practitioner vigilance is the safeguard.

The audience statements do not replace it.

### 10.2.5 Recovery community members and mental health support seekers

A member of a recovery community often keeps a separate account. A person who seeks mental-health support often does the same. They do not want that account linked to their other online identities. Recovery here includes substance use, an eating disorder, gambling, and a behavioral compulsion. The method refuses attribution against these uses.

The harm is specific. A practitioner in conflict with a person may surface that person's recovery participation without aiming at it. The recovery account may share a stylometric pattern or a behavioral pattern with the account in the conflict. Cluster attribution would link the accounts. The natural-person step, which the method does not perform, is then performed offline by the practitioner.

The structural commitments do not prevent this. The mitigations are practitioner restraint and the exclusion in §3.3.3. A practitioner who uses the method against a person they are in conflict with should pause. They should ask whether they can handle an incidental discovery in a responsible way.

### 10.2.6 Children and minors

The method excludes use against an account a minor operates, and against a network whose members are minors. The exclusion is categorical. A child who uses a pseudonymous account, for any reason, is not a population this method is designed to investigate. No benefit of the method outweighs the harm of misuse against this population.

If an investigation meets a minor-operated account, stop. Do not extend the investigation to that account. The practitioner must not surface information about a minor as a byproduct.

### 10.2.7 Trans and gender-variant people

A trans person or a gender-variant person often keeps accounts from different points in an identity. A pre-transition account may still exist beside a post-transition account. The accounts may share behavioral patterns the method could detect. The method refuses attribution that would expose a trans person against their will. It refuses a link between pre-transition and post-transition identities without consent.

This exclusion is in the same family as §10.2.2. It needs a specific mention. Pre-transition and post-transition accounts are common across trans communities. The pattern can look like sockpuppet activity to a method that ignores the context.

### 10.2.8 Sex workers

A sex worker keeps several accounts for safety. A work account is separate from civilian life. A civilian account is separate from clients. Other accounts support a workplace network. The method refuses attribution against these uses.

The harms include exposure to family or to an employer. They include exposure to law enforcement where the work is criminalized. They include exposure to a stalker who uses attribution to cross a separation the worker built. Cluster attribution would defeat those separations if it were applied. The practitioner is responsible for not applying it.

## 10.3 The unresolved trade-off

The mitigations raise the floor of casual misuse. They do not raise the ceiling. A determined misuser with technical resources and with the reference implementation can apply the method to a population the method refuses. The method cannot prevent that.

The populations the method serves and the populations it refuses overlap in structure. A pro se litigant who documents coordinated harassment is sometimes a stalker who builds a paper trail. A journalist in a small newsroom is sometimes a journalist with an agenda against a target. An OSINT researcher is sometimes a researcher whose definition of a coordinated network is set to find the desired result. The method cannot tell these cases apart from the outside.

The method accepts that some practitioners will use it for a purpose the method rejects. The response is §10.7 and §10.8. Those responses are moral. They are not technical. They are the strongest responses the method can offer.

A reader who finds this insufficient is not wrong. Insufficiency is the honest state of the trade-off.

## 10.4 Platform terms of service and the ethics of scraping

Most large social platforms prohibit scraping in their terms of service. The method collects data that, in most cases, those terms prohibit at the scale and in the form the method needs. That fact raises an ethical question separate from the legal exposure in §5.3.5.

The question is whether action against a platform's stated wish is defensible. The method holds that it is, for reasons tied to the platform's role in the harms the method addresses.

A platform is not a neutral party in coordinated inauthentic behavior on its service. The same platform that prohibits scraping also runs trust and safety systems that miss coordinated networks at scale. It charges for the API access that would make detection feasible without scraping. It gains financially from the engagement those networks generate. The term of service in this area is not a principled position on data ethics. It is a commercial position on who may operate against the service.

The method collects against those terms when the alternative is no detection. A practitioner may work on coordinated inauthentic behavior and be unable to pay API prices at the needed volume. That practitioner has a defensible interest in public platform data despite the prohibition. The defense is contextual. A journalist who collects to investigate a documented harassment campaign has a stronger position than a casual user who collects to feed a personal grievance.

The method does not endorse collection against a platform wish in general. It defends collection in the contexts the method supports. A use outside those contexts does not inherit that defense. That practitioner needs their own justification.

Legal exposure is separate from ethical exposure. The legal question depends on the jurisdiction. The method cannot speak for every jurisdiction. The instruction in §5.3.5 stands. Consult counsel before you rely on collected data in an adversarial context.

## 10.5 Responsible handling of incidental discovery

An investigation often surfaces information beyond the scope. A network under study may incidentally show sensitive facts. Examples are mental-health information, recovery participation, and sexual or gender identity. Other examples are immigration status, employment, and financial difficulty. The practitioner did not investigate that matter. The data is still in front of them.

Incidental discoveries are not the practitioner's to handle as output. The investigation is bounded by its stated scope. Data past that scope is not part of the output, not part of the evidence packet, and not part of a later publication.

Keep discipline about the subject of the investigation. An investigation of coordinated inauthentic behavior stays on that subject when other facts appear. A mid-course change that takes advantage of an incidental discovery is improper in method and in ethics.

This rule matters in a legal context. A pro se litigant may find sensitive personal information on an opposing party. The method does not give a right to put that information into the case. The information may matter in a different proceeding under different rules. It does not belong in the proceeding for which the method was applied.

The reference implementation supports the discipline. Outputs are built from cited signals and from attribution claims, not from incidental observations. A practitioner may record an incidental observation in working notes that stay internal (§8.2.3). The packet and any published output stay inside the stated scope.

## 10.6 The argument for publishing the methodology

The case for publication, rather than concealment or a restricted distribution, rests on three claims.

**First, closed methods already exist and cause harm.** Major platforms keep internal detection that they do not publish and that has no outside accountability. Commercial OSINT firms keep proprietary methods for clients whose budgets a pro se litigant and a small newsroom cannot match. Intelligence services keep attribution methods at a scale this method cannot approach. The capability exists. It is unevenly distributed. The people harmed by that unevenness are the people this method serves.

They are pro se litigants, small newsrooms, OSINT researchers, academics, and trust and safety teams at smaller platforms.

A published method shifts the distribution. It gives underserved practitioners a comparable capability. The capability is accountable to the commitments in this paper. The custody chain and the reproducibility rules let a later reader check the work. A closed method does not have those properties. Careful application is still not checkable from outside.

**Second, a published method with explicit commitments moves practice toward better defaults.** Practitioners already did this work before the paper. Most of that work had no written method and no custody chain. Most of it also lacked the audience limits and the signal exclusions required here. A paper raises the baseline for good practice. Later undocumented work can be measured against a published standard. A reviewer, a judge, a peer reviewer, and an editor can evaluate the work against the commitments.

Publication is therefore not the start of the field. The field already exists. Publication is a contribution to its standards.

**Third.** The practitioners this method serves have legitimate interests that current tools do not meet. A pro se litigant who documents coordinated harassment has an evidentiary interest. Current tools do not serve that interest. A journalist in a small newsroom has an investigative interest that a commercial OSINT firm does not serve at a price the newsroom can pay. An academic researcher has a research interest that platform-internal data does not serve, because that data is not available for academic work. These interests are real.

The absence of an accessible tool causes real harm. Publication addresses the gap.

The opposing claim is that the method marginally increases the capability of a misuser and marginally harms people the method cannot fully protect. The position of the method is that the marginal harm to legitimate pseudonymity is real and is smaller than the marginal benefit to legitimate practitioners. Publication is therefore the right choice on balance.

This is a position, not a proof. A reader who weighs the harms differently may reach a different conclusion. The method states its position so the disagreement, if it exists, is visible.

## 10.7 Practitioner accountability

The method cannot police itself. The mitigations depend on practitioner adherence. Adherence is voluntary. A practitioner accepts responsibility for a later use that the method places outside its scope and that the practitioner could still undertake.

Ask these questions before you apply the method to one investigation.

**Does this use sit inside the audience the method is for?** The exclusions in §1.2 are tests. Read the method as the operators would. If they would recognize themselves as a protected population, the use is outside the intended audience. Actors in coordinated inauthentic behavior are the intended audience.

**Can you state the limits in an adversarial setting?** A court filing will scrutinize the output. A news report, an academic paper, and other adversarial contexts will do the same. Be ready to defend the application and the commitments. That includes a commitment that produces a conclusion less favorable to you than another method might produce.

**Is a basis statement context, or a conclusion you already hold?** Section 5.1.1 requires a basis statement before signal extraction. The discipline is wasted if the statement prejudges the outcome.

**Will you honor a declination?** When the output is "insufficient evidence," accept that result. Do not manufacture an attribution by another means. If you expected an attribution and the method does not support it, respect that conclusion.

**Will you keep an incidental discovery out of scope?** Section 10.5 requires a bound even when the data shows other matters. If you cannot keep that bound, do not start the investigation.

The method does not require a formal pledge. It requires that you engage the questions before you apply the method. The reference implementation does not check that engagement. The check is yours.

## 10.8 When the methodology's constraints fail

The constraints are not enforced in code. A fork can remove the declination rule, lower a threshold, delete an audience limit, or add natural-person identification. A practitioner can publish an attribution the method refused. An implementer can lower a threshold and still present the deployment as Common Thread.

The response is disavowal. A fork that removes an abuse mitigation is not an extension of the method. It no longer implements the method. A publication that presents an unsupported claim under the name of the method misrepresents the method. An implementation that lowers a threshold is not Common Thread, whatever it calls itself.

Disavowal is a moral act. It is not a technical control. The method cannot prevent a fork, misuse of its name, or misrepresentation of an output. It can be specific about what it commits to and what it does not. A practitioner, a reviewer, and a later reader can then judge whether one application meets the stated requirements.

This paper and the reference implementation are the canonical statements. An implementation that diverges in a way that affects an ethical commitment should not be treated as the method. The author of that implementation should rename the work. A user should know that they are outside the commitments.

The strength against fork-based misuse is reputational. The method asks users, reviewers, and the wider community to keep a distinction. Common Thread as published is not the same as other work that uses the name, or the technique, without the commitments. That enforcement is partial. It does not replace a technical control the method cannot provide. It is the strongest tool the method has.

## Closing

Careful design does not settle ethics in this domain. The method has costs its mitigations cannot remove. It has benefits that publication is meant to give to people that existing tools underserve. The argument for publication is that the benefits outweigh the costs in aggregate. The method states the uncertainties. It does not hide them.

A specific use makes the method better or worse for the world. The method in the abstract neither helps nor harms. The application does. The practitioner is responsible for whether the use is the kind the method is for.

Section 11 returns to limits and to later work the method suggests and does not undertake. Limits and ethics are related. A limit defines what the method cannot do. An ethical consideration defines what the method should not do even when it could. Both shape the character of the method.

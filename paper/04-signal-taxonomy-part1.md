# 4. Signal Taxonomy

This section lists the signals the method uses to describe accounts and to compare them. Each signal has the same parts. The parts are what it observes, what it can detect, and what it cannot detect. They also include failure in each direction, the extraction method, and citations where prior work applies.

No single signal carries attribution alone. The method attributes by a combination of signals. The bands in §3.2 are set against combinations, not against one signal. A strong signal in one category is not sufficient evidence. That use misapplies the method. The framework requires a combination across categories.

The reference implementation enforces that rule in the reasoning layer.

The list has eight categories. This file covers the first four. They are account metadata, temporal patterns, linguistic style, and network relationships. Sections 4.5 through 4.8 cover visual signals, cross-platform signals, metadata leakage, and signals the method refuses.

Category boundaries are not sharp. A signal could fit more than one category. Placement marks where the signal is most useful as a start. It is not a claim about the essence of the signal. The reference implementation shows signals by category. The reasoning layer is not bound to a category.

It considers every available signal together.

## 4.1 Account metadata signals

An account-metadata signal is visible from the profile alone. You do not need to watch activity. These signals are the cheapest to collect. One profile fetch yields most of them. They are the weakest in isolation. Use them as a filter and as corroboration.

They can include an account or exclude an account at low cost. They can support a stronger signal from another category.

### 4.1.1 Creation-date clustering

**What it detects.** The signal detects accounts created close together in time. When an operator builds a network, the accounts often share a creation window. The window may be hours, days, or weeks. A wider window is a weaker signal.

**What it does not detect.** The signal does not detect a legitimate cohort. Accounts created in a platform migration, a viral signup, or a news surge share dates with no shared operator. The signal means something only against the background rate of account creation in that community.

**False-positive modes.** A cohort effect is the main false positive. After Elon Musk acquired Twitter, millions of accounts were created on Bluesky and on Mastodon in a short window. That pattern is not a sockpuppet signal. The same effect appears at smaller scale around a news event, a feature launch, or a class assignment that requires an account.

**False-negative modes.** A patient operator creates accounts months or years before use. That practice defeats creation-date clustering. The signal is most useful against an unsophisticated network. A sophisticated network will not produce it.

**Extraction.** Parse the creation timestamp from profile metadata. Compute pairwise time deltas across the account set. Compare the deltas with the base rate of account creation in the relevant community over the same window. Take that rate from a control corpus.

### 4.1.2 Display name and handle patterns

**What it detects.** The signal detects names that follow a template. Display names may share a structure, a capitalization habit, or a use of emoji or punctuation. Handles may share a pattern. Bios may match a template. One common structure is a first name, a last name, and a numeric suffix.

**What it does not detect.** The signal does not detect an operator who varies names across personas on purpose. It targets careless network building. It does not target careful network building.

**False-positive modes.** Platform default handles are one false positive. A platform offers those handles when the preferred handle is taken. A niche naming custom is another. Examples are a gaming clan and a language-learning group. A generational pattern inside one demographic cohort is a third.

**False-negative modes.** Deliberate variation defeats the signal. An operator who reads this paper will vary names across personas as a basic countermeasure.

**Extraction.** Compute pairwise edit distance across display names, bios, and handles. Tokenize each bio and apply n-gram similarity. Flag an account whose distance to at least one other seed account is below a threshold set from the community.

### 4.1.3 Bio template matching

**What it detects.** The signal detects a bio built from a recognizable template. An operator may use a template such as name, location, hobby, pet, and a political identifier. The template can remain visible when the specific words change.

**Extraction.** Parse each bio into typed slots. Examples are a location string, an occupation, and an identifier. Compare the slot pattern across accounts. A network that fills the same slots in the same order is more template-bound than a community that fills slots without a shared template.

This signal is close to §4.1.2. The two are often shown together.

### 4.1.4 Verification status

**What it detects.** The signal detects a coordinated purchase of platform verification. On most large platforms, verification is no longer an identity check. The badge is a paid signal. Accounts that bought verification on nearby dates may be coordinated.

**What it does not detect.** The signal does not detect a legitimate individual purchase. Many users buy verification for an ordinary reason. A cluster by purchase date is weak alone.

**Extraction.** Record whether the badge is present. Record the purchase date when the platform API or the account history shows it.

The signal is most useful with creation-date clustering. Creation and verification in nearby windows is stronger than either signal alone.

### 4.1.5 Profile customization patterns

**What it detects.** The signal detects uniform customization or uniform neglect. Uniform customization includes a matching banner scheme and a similar pinned-post pattern. Uniform neglect includes a default avatar, no banner, and no pinned post. An operator may share a pattern of non-use. The accounts treated as disposable personas may ignore the same profile features.

**False-positive modes.** A new user who has not customized a profile is one false positive. A privacy-conscious user who keeps profile information small is another.

**Extraction.** List the profile fields. Score each account against the platform default. Cluster accounts by that customization profile.

### 4.1.6 Stated location

**What it detects.** The signal detects a location claim in the location field. An operator in one region may give personas the same stated location. That match is suspicious because the locations correlate. The operator may also separate the locations with care. That separation can itself be a fingerprint across personas.

**False-positive modes.** Real people in real places are the false positive. The signal means something only against a base rate.

**Extraction.** Extract the location string. Geocode it where possible. Compute pairwise similarity. Compare that similarity with the background rate for the community.

## 4.2 Temporal signals

A temporal signal comes from when an account posts. The collection window must be long enough to show a pattern. A cadence signal usually needs several weeks. A response-latency signal needs at least one triggering event. Temporal signals are stronger than metadata signals in isolation. In a well-resourced investigation they are often the most distinctive signals.

The operator's schedule is hard to hide while the accounts stay useful.

### 4.2.1 Posting cadence correlation

**What it detects.** The signal detects accounts that post at similar times of day, on similar days, and at a similar rate. An operator of several accounts tends to post on all of them during the operator's active hours. That tendency remains when the operator tries to avoid simultaneous posts.

**What it does not detect.** The signal does not detect an operator who posts on a deliberate schedule with a scheduling tool. The miss is larger when each account has a different configuration.

**False-positive modes.** A shared timezone is one false positive. People in one region share active hours. A professional schedule is another. People with a daytime job are active in similar windows. A news cycle is a third. Many people post when an event breaks.

**False-negative modes.** Deliberate randomization of cadence defeats the signal. A scheduling tool defeats it. An operator who posts from several devices in several timezones defeats it.

**Extraction.** Bin posts by hour of day and by day of week. Compute the distribution for each account. Compare distributions with Jensen-Shannon divergence or with cosine similarity. Normalize against the background rate of activity in the relevant community over the same window.

### 4.2.2 Response latency to triggering events

This signal is one of the strongest in the list when it applies. You must identify triggering events. A triggering event is a moment when the operator has a reason to act on several accounts in quick sequence.

**What it detects.** The signal detects a characteristic latency after a triggering event. A sockpuppet network produces a latency distribution that differs from organic readers and from a bot network. Organic readers respond in hours or days. A bot network responds in milliseconds. The sockpuppet band is usually minutes to tens of minutes. That band reflects an operator who switches accounts and writes or selects a response.

**What it does not detect.** The signal does not detect a single coincidence. It needs several triggering events. One 41-minute response from two accounts can be chance. Ten such responses across ten events are not chance.

**False-positive modes.** Users with a push notification for the triggering account see the trigger together and may respond at similar speeds. A niche community with a norm of quick response is another false positive.

**False-negative modes.** An operator who randomizes the delay defeats the signal. An operator who delays some accounts on purpose defeats it.

**Extraction.** Identify triggering events in the collection. Examples are a filing that was served, a post by an opposing party, and a news event that matters to the network. For each event and each seed account, measure the time from the event to the first response or the first amplification. Build a latency distribution per account. Compare the distributions pairwise.

Be conservative about which events count. The trigger must be public and observable. A private trigger, such as a direct message to the operator, produces a latency that looks organic. That latency is not useful for this signal.

### 4.2.3 Active-hour distribution

**What it detects.** The signal detects the hours an account is active and the hours it is silent. An operator must sleep, eat, and work. Accounts under one operator have correlated active periods.

**What it does not detect.** The signal does not detect scheduled posts that fill hours when the operator is absent. It does not detect an atypical schedule. Examples are shift work, care of an infant, and insomnia.

**False-positive modes.** A shared timezone is one false positive. A shared professional schedule is another.

**False-negative modes.** Scheduled posts defeat the signal. Two people in different timezones can produce a distribution that is active across 24 hours. That pattern defeats the signal.

**Extraction.** Compute the hour-of-day frequency for each account. Cluster accounts whose distributions correlate strongly.

### 4.2.4 Quiet-period correlation

**What it detects.** The signal detects gaps in activity that occur together. An operator takes leave, becomes ill, or loses network access. Coordinated accounts go silent together for the same reason.

**What it does not detect.** The signal does not detect silence from a platform-wide cause. Examples are an outage, a holiday, and a news cycle in which many users are silent. Those causes correlate across the community. They are not specific to the seed set.

**False-positive modes.** Platform-wide silence is the false positive, as noted above.

**False-negative modes.** Scheduled posts during an offline period defeat the signal.

**Extraction.** Find silence longer than a threshold for each account. Example thresholds are 24 hours, 72 hours, and one week. For each pair, compute the fraction of silence periods that overlap. Compare that fraction with the community base rate.

### 4.2.5 Burst correlation

**What it detects.** The signal detects accounts that increase activity together. It is not response latency. Response latency measures speed after one event. Burst correlation measures whether several accounts raise their posting rate around the same time.

**Extraction.** For each account, find burst windows. A burst is a window where the posting rate exceeds the account baseline by a configurable threshold. The typical threshold is 2 to 3 standard deviations. For each pair, measure the overlap of burst periods.

## 4.3 Linguistic signals

A linguistic signal comes from what an account says and from how it says it. This category has the deepest prior literature. Authorship attribution predates modern computing. The signals are stronger than metadata signals. In a well-resourced investigation they compete with temporal signals. They resist most casual countermeasures.

**Terminology.** The taxonomy uses linguistic for this category. Section 4.3.1 uses stylometric for the authorship markers from the stylometrics literature. The reference implementation records every §4.3 feature under the category name `stylometric`. See §6.2.3 and §7.3.1. The two names are one category. A practitioner who compares paper text with implementation output should read `stylometric` as the implementation label for §4.3.

Read the prior literature. The field is mature. It has established methods, known failures, and a substantial empirical record. Read at least Burrows (2002) on Delta, Koppel et al. (2009) on the general problem, and Stamatatos (2009) on the survey of methods. For adversarial work, read Brennan and Greenstadt (2009) and the later defense literature.

That work shows how a writer can hide a stylometric signal. A sophisticated operator will try to do that.

### 4.3.1 Stylometric markers

**What it detects.** The signal detects an authorial fingerprint in writing style. Markers include sentence length, function-word frequency, punctuation habit, capitalization, and characteristic transitions.

Function-word frequency is the main stylometric marker. The most frequent words in a language carry a strong authorship signal because writers use them without attention. Examples are "the," "of," "and," "to," "a," "in," "is," "it," "you," and "that." A writer's distribution over those words is stable across topics. A conscious change is difficult and makes the prose sound stiff.

Punctuation and capitalization carry a similar signal at a smaller scale. Stable habits include the Oxford comma and the end mark of an informal sentence. They include capitalization of a hashtag or a proper noun. They include whether casual writing uses a capital at the start of a sentence. Those habits appear across personas.

**What it does not detect.** The signal does not detect writing that was heavily edited. It does not detect writing rewritten by an AI system. It does not detect writing hidden with a stylometric defense technique.

**False-positive modes.** A shared stylebook is one false positive. Writers at one publication share function-word patterns and punctuation patterns. A shared education produces a similar effect. Writers from the same program, the same language, and the same level of formality share more style than the population average.

**False-negative modes.** AI-assisted writing is now a large false negative. Text passed through an LLM reads more like the model than like the writer. A defense tool such as Anonymouth, and its successors, is built to flatten the stylometric signal.

**Extraction.** Compute a feature vector for each account. Include function-word frequencies for the top 100 to 500 common words. Include sentence length, punctuation rate, and capitalization rate. Compare accounts with Burrows' Delta or with a similar normalized distance. Exclude an account with too little text for a reliable measure. The minimum corpus size depends on the language.

It is typically several thousand words.

### 4.3.2 Topic vocabulary overlap

**What it detects.** The signal detects shared specialized vocabulary. Two personas may claim different identities and still share niche words. Examples are technical jargon, in-group slang, and a specialized reference. That overlap is a signal.

**What it does not detect.** Members of one legitimate community share niche vocabulary. The signal means something only against a community baseline.

**False-positive modes.** Legitimate membership in the community is the false positive.

**False-negative modes.** An operator who avoids shared vocabulary across personas defeats the signal.

**Extraction.** Compute TF-IDF for each account against a background corpus from the wider community. Identify the distinctive vocabulary, the terms with the highest TF-IDF. Compute pairwise overlap on the top N terms, weighted by rarity.

### 4.3.3 Idiosyncratic phrase reuse

**What it detects.** The signal detects verbatim reuse, or near-verbatim reuse, of a distinctive phrase. Writers have a pet phrase, a rhetorical tic, and a characteristic transition. A phrase is larger and rarer than one word. Reuse across accounts is a strong signal.

**What it does not detect.** The signal does not detect a meme, a viral phrase, or shared community vocabulary. A more common phrase is a weaker signal.

**False-positive modes.** A meme is the main false positive. A viral phrase appears across thousands of accounts in a short window.

**False-negative modes.** A paraphrase defeats the signal. An operator who varies phrasing across personas defeats it.

**Extraction.** Compute n-grams for each account, typically from 3-grams through 7-grams. Weight each n-gram by novelty against a background corpus from the wider community. Find n-grams that are rare in the background and that appear in more than one seed account. Show the most distinctive shared n-grams for review.

### 4.3.4 Code-switching patterns

**What it detects.** The signal detects a pattern of switching language, register, or formality. An operator who switches between two languages may show the same pattern in personas that claim to use one language. An operator whose natural register is informal may leave an informal form in a persona that claims to be formal.

**What it does not detect.** The signal does not detect an operator who keeps a strict register. It does not detect an operator who speaks only one language.

**Extraction.** Classify each post by register and by language. The registers are formal, neutral, and informal. Analyze the sequence of register switches. Compute the register distribution and the switching frequency for each account.

### 4.3.5 Typo and error patterns

**What it detects.** The signal detects a repeated typo, a grammatical error, and an autocorrect signature. These marks sit at motor level and at habit level. They are harder to change on purpose than a higher-level style choice.

**What it does not detect.** The signal does not detect heavily edited text. It does not detect text rewritten by an AI system. It does not detect text passed through a grammar checker.

**False-positive modes.** A shared autocorrect dictionary is one false positive. A shared first language is another. Writers with the same first language make similar errors in a second language.

**False-negative modes.** Editorial cleanup defeats the signal. A modern AI writing assistant flattens it.

**Extraction.** Build an error taxonomy. Examples are their, there, and they're, then and than, an apostrophe error, and a common autocorrect substitution. Compute the error rate for each account. Compare the rates pairwise.

## 4.4 Network signals

A network signal comes from a relationship between accounts. The relationship may be who follows whom, who engages with whose content, or who appears in whose mentions. Collection must go beyond one timeline. It includes follower lists and engagement records.

A network signal has a strength the earlier categories lack. It describes a relationship the operator cannot fully control alone. The operator chooses the text, the time, and the style. The operator cannot fully choose who follows an account or who engages with the content. Some network signals therefore resist a countermeasure that defeats another category.

The relevant background is the literature on coordinated inauthentic behavior. See Pacheco et al. 2020 and the related work on network analysis of disinformation.

### 4.4.1 Follower overlap

**What it detects.** The signal detects follower sets with abnormally high overlap. Two accounts in one operator's network often share followers, especially early in the life of the accounts. Those followers may come from the operator's mutual contacts or from amplification inside the network.

**What it does not detect.** The signal does not detect two accounts in the same niche with no shared operator. Raw overlap means nothing without a community baseline.

**False-positive modes.** Membership in a niche community is the main false positive. Two accounts on the same specialized topic share followers with no shared operator. A follower-purchase service creates artificial overlap that can resemble a sockpuppet network and is not one.

**False-negative modes.** An operator who gives each persona a distinct follower base defeats the signal. An older account with an established follower base outside the network also defeats it.

**Extraction.** Collect the follower list for each seed account. Compute pairwise Jaccard similarity. Normalize against a community baseline from control accounts in the same niche.

### 4.4.2 Mutual-follow patterns

**What it detects.** The signal detects accounts that follow each other early, especially when both accounts are new. A network often forms a mutual follow at the start. The operator wants the accounts to amplify each other from the beginning.

**What it does not detect.** The signal does not detect a mutual follow built over a long time inside a legitimate community.

**False-positive modes.** Some communities expect a returned follow. A mutual follow is then routine.

**False-negative modes.** An operator who avoids a mutual follow between their own accounts defeats the signal.

**Extraction.** For each pair in the seed set, determine whether the accounts follow each other. If they do, record the time of the second follow, the follow that closed the mutual relation. Compare that time with the creation timestamps.

### 4.4.3 Coengagement timing on thirdparty content

**What it detects.** The signal detects several accounts that engage the same third-party content in a short window. The timing matters more than the bare fact that both engaged. An operator tends to engage from each account in close succession. The operator is looking at the same content in the same browser session.

**What it does not detect.** The signal does not detect a large amplification cascade. In a cascade, many accounts engage at nearly the same time as a post spreads. The signal needs a small set of engaging accounts. A broad cascade is a different event.

**False-positive modes.** A push notification can drive engagement. Followers who see the content together are the false positive.

**False-negative modes.** Deliberate separation in time defeats the signal. Different devices for different accounts break the link to one browser session.

**Extraction.** For each third-party post that two or more seed accounts engaged, measure the time between engagements. Build a distribution of those deltas for each pair. Compare it with the wider platform distribution.

### 4.4.4 Crossaccount amplification

**What it detects.** The signal detects amplification of one seed account by other seed accounts at a rate above the ordinary rate. The signal is distinctive when the amplified account is new or has little organic following. A consistent set of amplifying accounts inside the network is evidence of coordination.

**What it does not detect.** The signal does not detect amplification by accounts outside the seed set. The method has no view of that amplification.

**False-positive modes.** A friend network can amplify in a genuine way that is not sockpuppet coordination.

**False-negative modes.** Amplification through accounts outside the seed set defeats the signal. An indirect path defeats it.

**Extraction.** For each seed account, identify the accounts that engage its content most often. Cross-check that list with seed-set membership. Compute the fraction of amplification that comes from inside the seed set. Normalize that fraction against a baseline.

### 4.4.5 Block and mute coordination

**What it detects.** The signal detects a shared block pattern or a shared mute pattern. Where a platform shows a block list or a mute list, a shared list is a strong signal of one operator.

**Practical limit.** The signal is rarely available. Most platforms do not show a block list or a mute list. Tools that once showed this data on Twitter are deprecated or are no longer reliable. The signal is listed for completeness. It is operationally weak in the current environment.

**Extraction.** Where a platform API or a public list shows block data or mute data, collect the set for each account. Compute pairwise Jaccard similarity.

## Combining signals from §4.1-§4.4

The four categories have different ratios of cost to strength. Metadata is cheap and weak. Temporal signals cost more and are strong when a triggering event exists. Linguistic signals need a large corpus and are strong and robust. Network signals are expensive to collect and are structurally distinctive.

Collect signals from at least three of these four categories before you make an attribution claim. A claim that rests on one category is exposed to the failures of that category. Signals from several categories combine to reach the bands in §3.2.

Sections 4.5 through 4.8 cover the remaining categories. They are visual signals, cross-platform signals, metadata leakage, and signals the method refuses. The structure is the same. Each signal has a definition, a detection claim, a non-detection claim, failure modes, and an extraction method.

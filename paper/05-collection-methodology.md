# 5. Collection methodology

This section specifies how investigations are scoped, how seed accounts are selected, what is collected, what is not, and how the collection process itself is documented. The methodology in §4 and the deterministic feature extraction in §6 assume the collection meets the requirements stated here. Investigations that do not meet these requirements may still produce useful internal exploration but cannot meet the reproducibility commitments of §3.

Collection is the operational predicate for everything that follows. Investigations that are poorly scoped at the collection stage produce signal tables that reflect collection bias rather than the underlying network behavior, and no amount of careful feature extraction or attribution reasoning later in the pipeline recovers from that. The discipline of getting collection right at the outset is the single highest-leverage decision in a Common Thread investigation.

## 5.1 Seed account selection

The seed set is the set of accounts the investigation will examine. Every signal in §4 is computed within or across the seed set. Decisions about who is in the seed set therefore shape what the investigation can find, and care taken at the seed-selection stage pays for itself many times over downstream.

### 5.1.1 Basis statements

For each account in the seed set, the investigation should produce a written basis statement: a brief factual statement of why the account was included. The basis statement is not an accusation. It is a record of the investigator's reason for paying attention to the account at the moment the seed set was assembled, before any signals have been computed.

A basis statement might say: "Account observed engaging with the named target on three occasions in the relevant time window, using language consistent with the target's claimed harassers." It might say: "Account identified by witness X as a member of the network." It might say: "Account flagged by automated tooling as having unusually high amplification of the target's content." It might say: "Account included as a control: not suspected of coordination, used to validate that the methodology does not false-positive."

The discipline of writing the basis statement before any signal extraction has two effects. First, it forces the investigator to articulate the actual reason for inclusion, separating "this account caught my attention" from "this account is suspected of coordination." Second, it creates a record that downstream readers can evaluate. An investigation whose seed set was assembled from a single witness's accusations is more vulnerable to confirmation bias than one whose seed set includes accounts identified by multiple independent indicators; both are valid, but the difference is auditable only if the basis statements exist.

The reference implementation requires a basis statement field for every account added to a seed set. The statement is stored in the investigation manifest and is included in any output evidence packet.

### 5.1.2 Sources for seed accounts

Seed accounts come from a few common sources. None of them is inherently more reliable than the others; they have different failure modes that the methodology accommodates differently.

**Witness identification.** A person with first-hand knowledge of the network identifies specific accounts. This is high signal but high bias: the witness has reasons for the identification that are not part of the platform record, and their accusations may reflect personal conflict rather than coordinated inauthenticity. Basis statements from witness identification should record the witness's relationship to the network and the witness's stated basis for the identification.

**Observed coordinated activity.** The investigator notices accounts engaging with the same content in patterns that suggest coordination, or amplifying each other in ways that exceed organic engagement. This is the most common seed-selection source for investigative journalism and OSINT work. The risk is selection bias: the patterns that catch attention may not be the patterns that distinguish coordinated networks from organic ones.

**Tip-line or community submission.** Some networks come to the investigator's attention through tip lines, community submissions, or third-party reporting. These tend to carry the biases of the reporting community and should be treated with the same caution as witness identification.

**Automated tooling output.** Existing tools (bot detectors, amplification analyzers, network-graph tools) sometimes flag accounts that warrant investigation. Tooling output is best treated as a hypothesis, not a verdict; the methodology is designed to evaluate the hypothesis using a broader signal set than any single tool considers.

**Self-identification by the target.** A person who is the subject of a coordinated harassment campaign may identify the accounts attacking them. This source is biased in predictable ways (the target sees harassment, not coordination) but is also high signal in many cases (the target has more sustained attention to the relevant accounts than any outside investigator). Basis statements from self-identification should note that the source is the target and describe what the target observed.

### 5.1.3 Avoiding circular seed selection

A common failure mode is to assemble the seed set from the accounts that an existing accusation identifies, then use the methodology to "confirm" the accusation. This is circular: the seed set already reflects the accusation, and the methodology's conclusion that the seed set is coordinated does not add information.

The methodology mitigates this in two ways. First, basis statements make the circularity visible: a seed set whose basis statements all trace to the same accusation is recognizably narrow. Second, the inclusion of control accounts (§5.1.4) provides a check on whether the methodology is finding coordination because it is present in the network or because the seed selection guaranteed the appearance of coordination.

Practitioners working in adversarial contexts (litigation, journalism with named subjects) should expect the seed-selection process to be challenged. Documented basis statements and the use of controls are the methodology's answer to that challenge.

### 5.1.4 Control accounts

Where possible, the seed set should include accounts that are not suspected of coordination. These control accounts serve as a check on the methodology: an investigation that returns "consistent with same operator" for accounts that are known not to share an operator has uncovered either a methodology defect or an unexpected real coordination.

Suitable control accounts are accounts in the same broad community as the suspected network (same niche, same platform usage patterns, same general topic interests) that are independently known not to be part of the operator's network. Practitioners with deep familiarity with the community can usually identify several plausible controls. Practitioners working in unfamiliar communities should consult with someone who has community knowledge.

The reference implementation tags control accounts in the manifest and reports their signal-table comparisons separately in the output. Attribution claims that depend on signal patterns also present between targets and controls are flagged as unreliable.

## 5.2 Scope definition

After seed account selection, the next decision is the scope of collection: how far back in time, how far out from the seed accounts, and what types of content.

### 5.2.1 Time bounds

Collection requires a start date and an end date. The default end date is the moment of collection; the start date requires justification.

The start date is typically chosen to cover the period of activity relevant to the investigation. For a coordinated harassment campaign, the start date might be the earliest known event in the campaign. For a network suspected of disinformation activity, the start date might be the creation date of the oldest account in the seed set. For litigation contexts, the start date is often dictated by the events at issue in the case.

The start date should be recorded in the investigation manifest with a justification. Different investigations will reach different defensible decisions about how far back to collect; the requirement is that the decision is documented.

Collection deeper than the investigation requires is generally not harmful and may be useful later; collection shallower than the investigation requires forces re-collection (§5.5) when the gap is discovered, and re-collection may not recover content that has been deleted in the intervening period. The methodology errs toward more collection rather than less when the marginal cost is small.

### 5.2.2 Account scope

The methodology's first published version is scoped to closed-world attribution: the analysis operates on the seed set and does not seek to discover new accounts beyond the seed. Account scope decisions are therefore about which adjacent accounts to collect data on for context, not about expanding the seed.

**Seeds-only.** The minimum collection scope. Each seed account's profile, timeline, and engagement history are collected. This is sufficient for signals from §4.1, §4.2, §4.3, §4.5, §4.6, and §4.7.

**Seeds plus first-degree network.** For signals from §4.4 (follower overlap, mutual-follow patterns, co-engagement timing), the methodology requires data about who follows and is followed by each seed account. The first-degree network is the set of accounts that follow or are followed by any account in the seed set. Collection of first-degree network data is typically limited to handles and follow timestamps; full profile and timeline collection of every first-degree account is rarely justified and expands the collection scope into territory that raises additional privacy concerns.

**Seeds plus N-degree network.** Some advanced network analysis (which is out of scope for v1; see §1.3) requires data about second-degree or further accounts. Practitioners conducting such analysis should treat the expanded collection as a separate investigation with its own basis-statement requirements.

### 5.2.3 Content scope

For each account in the collection scope, the following content types are typically collected:

- Profile metadata (creation date, display name, bio, location, verification status, follower and followed counts)
- Profile imagery (avatar, banner, pinned-post media)
- Timeline (all posts within the time bound)
- Reposts and quote-posts (treated as engagement records, not as authored content for §4.3 linguistic signals)
- Likes and other engagement records, where the platform exposes them
- Follower and followed lists (if first-degree network scope or larger)
- Media attached to posts (images, video thumbnails, video where feasible)
- External links shared by the account

The following are deliberately not collected:

- Direct messages (per §4.8.4)
- Any content that requires authentication beyond what the account naturally provides (the methodology operates on the public surface, not on data behind authentication)
- Profile fields that are not publicly visible
- Content from accounts adjacent to the network that are not in the collection scope

The reference implementation enforces these distinctions at the collection layer: the scraper is configured to fetch only the in-scope content types and to refuse out-of-scope requests.

## 5.3 Collection tooling

The choice of collection tooling is a practical decision shaped by the post-API-paywall environment, the platform under investigation, the available budget, and the practitioner's tolerance for operational complexity. The methodology does not require a specific tool; it requires that whatever tool is used produces artifacts that can be archived to the requirements in §5.4 and logged in the manifest.

### 5.3.1 Commercial scrapers

Commercial scraping platforms (Apify is the largest, with several smaller competitors) offer pre-built actors for major platforms, handle rotation and anti-bot countermeasures, and charge per request or per actor run. They are the lowest-friction option for practitioners who can afford them.

Trade-offs to be aware of:

- The practitioner depends on the commercial provider's continued ability to scrape the target platform. When a platform updates anti-bot measures, commercial scrapers typically catch up within days to weeks; investigations that need uninterrupted collection should plan for these gaps.
- The practitioner depends on the commercial provider's TOS compliance with the practitioner's intended use. Commercial scrapers vary in how restrictive their TOS are. Some prohibit use for investigative purposes against specific named individuals. Practitioners should read the TOS of the commercial provider they plan to use.
- The cost scales with the scope of collection. Investigations with large seed sets or wide time windows can be expensive.

The reference implementation includes adapters for at least one commercial scraping platform in the initial release. The adapter passes raw scraper output to the archival layer without transformation, in keeping with the immutable-archival requirement (§3.1.1).

### 5.3.2 Self-hosted scrapers

Self-hosted scrapers, written and maintained by the practitioner or their organization, offer control at the cost of infrastructure burden. The practitioner is responsible for handling rotation, anti-bot countermeasures, retries, and the ongoing maintenance burden of keeping the scraper working as the target platform changes.

Self-hosted scrapers are most suitable for practitioners with engineering resources, frequent collection needs, or strong reasons not to depend on commercial providers. Academic researchers, well-resourced newsrooms, and organizations doing repeated investigations are common users.

The reference implementation does not include a built-in self-hosted scraper. The collection layer accepts artifacts from any source as long as they meet the archival requirements; practitioners running self-hosted scrapers integrate by writing their scraper output to the archival layer directly.

### 5.3.3 Browser-based collection

For investigations of small scope, manual or semi-automated browser-based collection is a viable option. The practitioner uses a normal browser session to view the target accounts and saves the resulting pages (full HTML, screenshots, or both) into the archive. Browser-based collection is slow and labor-intensive but resistant to anti-bot countermeasures in ways automated scrapers are not, and it produces artifacts that pass through fewer transformations than scraper output.

Practitioners using browser-based collection should be aware that the platform may attach the practitioner's identity to the views; logging into the target platform as oneself to investigate an adversarial network is a security consideration that the methodology does not address. Many practitioners use dedicated browsers or sessions with no logged-in account for this work.

### 5.3.4 Hybrid approaches

Many investigations use multiple tools: a commercial scraper for high-volume timeline collection, a self-hosted scraper for specific endpoints the commercial scraper does not cover, and browser-based collection for sensitive or low-volume artifacts. The manifest format supports recording the tool used per artifact, and the reference implementation does not assume a single tool across an investigation.

### 5.3.5 Terms of service and legal considerations

Scraping major social platforms is generally prohibited by the platforms' terms of service. The legal status of TOS violations under computer-fraud statutes varies by jurisdiction and has been the subject of substantial litigation in the United States, with the *hiQ Labs v. LinkedIn* line of cases narrowing CFAA liability for public-data scraping but not eliminating it. The methodology does not advise practitioners on the legal status of their collection in their jurisdiction. Practitioners using the methodology in contexts where TOS compliance or CFAA exposure is a concern should consult counsel before beginning collection.

The methodology is designed to be usable by legitimate practitioners and to produce artifacts that are admissible and defensible. It cannot insulate practitioners from the legal questions associated with the collection layer; those questions are real, are jurisdiction-dependent, and require legal advice rather than methodological advice.

## 5.4 Archival

Archival is the operational implementation of the chain-of-custody commitments stated in §3.1. This subsection specifies the requirements; the manifest format itself is specified in Appendix D.

### 5.4.1 Content-addressed storage

Every artifact collected enters the archive at a path derived from the SHA-256 hash of its bytes. The path convention used by the reference implementation is `sha256/ab/cd/<full-hash>.<ext>`, where `ab` and `cd` are the first two byte pairs of the hex hash. The two-level directory prefix avoids filesystem performance problems with directories containing millions of files.

The extension is preserved for human convenience but is not part of the address. Two files with the same bytes but different extensions land at the same address and are stored once.

### 5.4.2 Atomic writes

The write to the archive is atomic: either the artifact is fully present at its content-addressed path with the expected hash, or it is not present at all. The reference implementation enforces this by writing to a temporary path, computing the hash of the written bytes, verifying the hash matches the expected hash, and only then renaming to the final path. If any step fails, the temporary file is removed and the artifact is treated as not collected. Partial writes do not enter the archive.

### 5.4.3 Manifest entries

For every artifact written to the archive, a manifest entry is appended. The manifest is line-oriented JSON, append-only. Each entry records:

- The SHA-256 hash of the artifact
- The source URL or identifier from which the artifact was collected
- The timestamp of collection, in UTC
- The collection method used, including tool name and version
- The investigation under which the artifact was collected
- The seed account or first-degree account the artifact relates to, where applicable
- Any platform-supplied metadata that came with the artifact (timestamps, identifiers, version information) that is not embedded in the artifact itself

The manifest is the index that makes the archive queryable. Without it, the archive is a directory of hashed files with no information about what each file contains or why it was collected.

Mutations to manifest entries are not permitted. Corrections take the form of new entries that supersede prior entries, with a reference to the superseded entry's hash. This preserves the audit trail of corrections.

### 5.4.4 Backups

The archive is the operational record of the investigation. If it is lost, the investigation is lost: the platform's record may have changed in the meantime, and signals computed from a missing archive are not reproducible.

The methodology requires at least one backup of the archive on independent infrastructure. The reference implementation supports replicated storage to multiple Cloudflare R2 buckets or to one R2 bucket plus a separate S3-compatible store. Practitioners using other infrastructure should implement equivalent replication.

The manifest is included in the backup. The signature on the manifest, if present, must be backed up alongside the manifest itself.

### 5.4.5 Retention

Retention of the archive is the practitioner's decision and depends on the context of the investigation. Litigation contexts may have hold requirements that the practitioner is independently aware of. Journalistic and research contexts typically retain archives indefinitely as part of the documentary record. The methodology does not impose retention requirements beyond the duration of the investigation; archives should not be deleted while the investigation's outputs are still being relied on.

## 5.5 Re-collection

Re-collection is the practice of returning to the target accounts at a later time and collecting again. Investigations frequently require re-collection: for extension as new accounts are added to the seed, for verification when signal patterns change unexpectedly, for monitoring when an investigation has an ongoing posture, or for response to challenges that question the integrity of the original collection.

### 5.5.1 When to re-collect

Common triggers for re-collection:

**Seed expansion.** When the investigation adds accounts to the seed, the new accounts require collection. Existing accounts also benefit from re-collection at the same time, to align the time bound across the seed set.

**Signal anomalies.** When feature extraction surfaces signal patterns that look anomalous, re-collection of the relevant accounts can confirm or refute the pattern. An anomaly that disappears on re-collection points to a collection-layer artifact rather than a real signal.

**Monitoring posture.** Some investigations have an ongoing monitoring posture: the practitioner expects the network to remain active and wants to capture continued activity. Periodic re-collection at intervals appropriate to the network's activity rate supports this posture.

**Adversarial challenge.** When the integrity of the original collection is challenged, fresh collection from the same source can corroborate the original. The original archive remains the canonical record; the fresh collection is documented as a separate event and compared to the original.

### 5.5.2 Handling deletions

A common observation during re-collection is that content visible at the first collection is no longer accessible at the second. This is evidentially important. The deleted content itself is preserved in the original archive; the fact of deletion is a new piece of evidence about the operator's behavior.

The methodology requires that deletions discovered during re-collection be recorded in the manifest. The recording specifies the hash of the artifact in the original archive, the source URL at which the artifact was found absent, the timestamp of the discovery, and the collection method that produced the absence.

Tombstoning is the conventional term for marking an artifact as "previously present, now absent." The reference implementation supports tombstone manifest entries with the same structure as collection entries but with an "absent" status flag.

### 5.5.3 Preservation of vanished evidence

When an operator deletes content that was previously collected, the operator's apparent intent is to make that content unavailable to investigators and to the broader audience. The methodology's archival posture preserves the content despite the deletion, making the original archive the only remaining record.

The implication for investigators is that careful archival at first collection is the operational defense against subsequent deletion. Re-collection cannot recover content that has been deleted in the interval; only the original collection can.

The implication for adversarial reporting is that tombstoned artifacts are particularly worth attention. An operator who deletes content selectively is signaling, by the act of deletion, that the content was important enough to suppress.

## Closing

Collection methodology is not glamorous, but it is the discipline that everything else in the methodology rests on. An investigation that meets the requirements stated here produces signal tables that are reproducible from the archive, attribution claims that are defensible under scrutiny, and evidence packets that are usable in adversarial contexts. An investigation that does not meet these requirements is, at best, a private exploration, and the methodology refuses to call it more than that.

The next section (§6) addresses feature extraction: the deterministic transformation from the archived artifacts produced by the collection methodology specified here to the signal table that feeds attribution reasoning. The discipline of §5 is the precondition for the discipline of §6; the two together are the operational predicate for the LLM-assisted reasoning in §7 and the output format in §8.

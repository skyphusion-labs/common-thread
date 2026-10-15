# 5. Collection methodology

This section specifies scope, seed selection, what to collect, what not to collect, and how to record the collection. §4 and §6 assume that collection meets these rules. An investigation that misses them can still be a private exploration. It cannot meet the reproducibility rules in §3.

Collection is the predicate for everything later. A weak scope produces a signal table that shows collection bias, not the network. Later extraction and reasoning cannot repair that. The seed and the scope are the highest-leverage decisions in a Common Thread investigation.

## 5.1 Seed account selection

The seed set is the set of accounts the investigation will examine. Every signal in §4 is computed inside that set or across pairs in that set. Who is in the seed decides what the investigation can find.

### 5.1.1 Basis statements

Write a basis statement for each seed account. The statement is a short factual reason for inclusion. It is not an accusation. Write it when you assemble the seed, before any signal is computed.

Examples of a basis statement:

- "The account engaged the named target three times in the time window. The language matched the target's description of the harassers."
- "Witness X identified the account as a member of the network."
- "An automated tool flagged unusually high amplification of the target's content."
- "Control account. Not suspected of coordination. Used to check false positives."

Write the statement before extraction. That forces a real reason, separate from "this account caught my attention." It also gives a later reader a record. A seed that comes from one witness is more exposed to confirmation bias than a seed with several independent indicators. Both can be valid. The difference is auditable only if the statements exist.

The reference implementation requires a basis statement for every seed account. The statement is stored with the investigation. It is included in the evidence packet.

### 5.1.2 Sources for seed accounts

Seed accounts come from a few common sources. No source is always more reliable. Each source has its own failure mode.

**Witness identification.** A person with first-hand knowledge names specific accounts. The signal can be strong. The bias can also be strong. The witness may reflect a personal conflict, not coordinated inauthenticity. Record the witness's relation to the network and the witness's stated basis.

**Observed coordinated activity.** The investigator sees accounts that engage the same content, or that amplify each other beyond ordinary engagement. This is the usual source in journalism and OSINT. The risk is selection bias. The pattern that catches attention may not be the pattern that separates a coordinated network from an organic one.

**Tip line or community submission.** A tip, a community report, or a third-party report can name a network. Treat it with the same caution as a witness. The reporting community has its own bias.

**Automated tool output.** A bot detector, an amplification analyzer, or a graph tool can flag an account. Treat the flag as a hypothesis, not a verdict. This method evaluates the hypothesis with a wider signal set than one tool uses.

**The target names the accounts.** A person under a harassment campaign may name the accounts. The bias is predictable. The target sees harassment, not coordination. The signal is often high, because the target has watched the accounts longer than an outside investigator. Note that the source is the target, and record what the target observed.

### 5.1.3 Avoiding circular seed selection

A common failure is to build the seed from an existing accusation, then use the method to "confirm" that accusation. That is circular. The seed already contains the accusation. A conclusion that the seed is coordinated adds no information.

The method limits this in two ways. Basis statements make a narrow seed visible. Control accounts (§5.1.4) check whether coordination is in the network, or only in the way the seed was chosen.

In litigation, or in journalism with named subjects, expect a challenge to the seed. Documented basis statements and control accounts are the answer to that challenge.

### 5.1.4 Control accounts

Where you can, include accounts that are not suspected of coordination. The method may return "consistent with one operator" for accounts that do not share an operator. That result is a method defect or an unexpected real coordination.

A suitable control is in the same broad community as the suspected network. Same niche, same platform habits, same general topics. The control is independently known to be outside the operator's network. A practitioner who knows the community can usually name several controls. In an unfamiliar community, ask someone who knows it.

The reference implementation tags control accounts. It reports their signal comparisons separately. A claim that depends on a pattern also present between targets and controls is flagged as unreliable.

## 5.2 Scope definition

After the seed, define the collection scope. Decide how far back in time, how far out from the seed, and which content types.

### 5.2.1 Time bounds

Set a start date and an end date. The default end date is the moment of collection. The start date needs a written reason.

Choose the start date to cover the activity that matters. For a harassment campaign, use the earliest known event. For a suspected disinformation network, you may use the creation date of the oldest seed account. In litigation, the events in the case often set the start date.

Record the start date and the reason in the investigation record. Different investigations will choose different defensible dates. The requirement is that the decision is documented.

Extra history is usually harmless, and it can help later. Too little history forces re-collection (§5.5). Re-collection may not recover content deleted in the interval. When the extra cost is small, collect more rather than less.

### 5.2.2 Account scope

v1 is closed-world. The analysis uses the seed. It does not discover new accounts. Account-scope decisions are about context, not about a larger seed.

**Seeds only.** Collect each seed account's profile, timeline, and engagement history. This supports §4.1, §4.2, §4.3, §4.5, §4.6, and §4.7.

**Seeds plus the first-degree network.** §4.4 needs data about who follows each seed account, and whom each seed account follows. The first-degree network is that set. Usually collect handles and follow timestamps only. Full profiles and timelines for every first-degree account are rarely justified, and they raise extra privacy concerns.

**Seeds plus an N-degree network.** Some advanced graph work needs second-degree accounts or further. That work is out of scope for v1 (§1.3). If you do it, treat it as a separate investigation, with its own basis statements.

### 5.2.3 Content scope

For each account in scope, typical collection includes:

- Profile metadata (creation date, display name, bio, location, verification, follower count, followed count).
- Profile images (avatar, banner, pinned-post media).
- The timeline inside the time bound.
- Reposts and quote posts, as engagement records. Do not treat them as authored text for the linguistic signals in §4.3.
- Likes and other engagement records, where the platform shows them.
- Follower and followed lists, when the scope includes the first-degree network or more.
- Media on posts (images, video thumbnails, and video when feasible).
- External links the account shared.

Do not collect:

- Direct messages (§4.8.4).
- Content that needs authentication beyond the public surface.
- Profile fields that are not public.
- Content from accounts that are not in the collection scope.

The reference implementation enforces these limits at the collection layer. The collector fetches in-scope types and refuses an out-of-scope request.

## 5.3 Collection tooling

The tool is a practical choice. It depends on cost, the platform, the budget, and how much operational complexity you will accept. The method does not require one tool. The tool must produce artifacts that meet §5.4, and the manifest must log the tool.

### 5.3.1 Commercial scrapers

Commercial scraping platforms, of which Apify is the largest, offer ready collectors for major platforms. They handle rotation and anti-bot measures. They charge per request or per run. They are the lowest-friction option when you can pay.

Know these tradeoffs:

- You depend on the vendor's ability to keep scraping the platform. After an anti-bot change, vendors often recover in days or weeks. Plan for the gap if collection must be continuous.
- You depend on the vendor's terms. Some terms prohibit investigation of a named person. Read the terms before you use the vendor.
- Cost grows with the seed size and the time window.

The reference implementation includes an adapter for at least one commercial platform in the initial release. The adapter passes raw output to the archive with no transform (§3.1.1).

### 5.3.2 Self-hosted scrapers

A scraper you run yourself gives control and adds an infrastructure burden. You handle rotation, anti-bot measures, retries, and the changes the platform makes.

This option fits a team with engineering capacity, frequent collection, or a strong reason not to depend on a vendor. Academic groups, larger newsrooms, and organizations that repeat investigations are the usual users.

The reference implementation does not include a built-in self-hosted scraper. The collection layer accepts artifacts from any source that meets the archive rules. Write the scraper output straight to the archive.

### 5.3.3 Browser-based collection

For a small scope, a normal browser session is viable. View the accounts and save the pages (full HTML, screenshots, or both) into the archive. This is slow. It resists anti-bot measures better than many automated collectors. The artifacts pass through fewer transforms than scraper output.

The platform may attach your identity to the views. The method does not address the security of logging in as yourself to watch an adversarial network. Many practitioners use a dedicated browser session with no logged-in account.

### 5.3.4 Hybrid approaches

Many investigations use more than one tool. A commercial scraper collects timelines at volume. A self-hosted scraper covers an endpoint the vendor misses. A browser saves a sensitive or low-volume artifact. The manifest records the tool for each artifact. The reference implementation does not assume one tool for the whole investigation.

### 5.3.5 Terms of service and legal considerations

Major platforms generally prohibit scraping in their terms of service. The legal status of a terms breach under computer-fraud statutes varies by jurisdiction. In the United States, the *hiQ Labs v. LinkedIn* line of cases narrowed CFAA liability for scraping of public data. It did not remove that liability. This method does not advise you on the law of your jurisdiction.

If terms compliance or CFAA exposure matters, ask counsel before you collect.

The method is for a legitimate practitioner, and it aims at artifacts that can be defended. It cannot shield you from the legal questions of collection. Those questions are real, they depend on jurisdiction, and they need legal advice.

## 5.4 Archival

Archival is the operational form of §3.1. This subsection states the requirements. v1.0 pointed at Appendix D for the manifest format. That file is not in this deposit. §3.1.2 states the format.

### 5.4.1 Content-addressed storage

Every collected artifact enters the archive at a path from the SHA-256 hash of its bytes. The reference implementation uses `sha256/ab/cd/<full-hash>`, with an optional extension. `ab` and `cd` are the first two byte-pairs of the hex hash. The two-level prefix avoids a single directory with millions of objects.

The extension is for a human reader. It is not part of the hash. The method treats two files with the same bytes as one artifact. The reference implementation puts the extension in the path, so two extensions are two paths. See `paper/ERRATA.md`.

### 5.4.2 Atomic writes

The write is atomic. The artifact is fully present at its content-addressed path, with the expected hash, or it is not present. A partial write does not enter the archive.

The reference implementation uses a conditional put on the final path. It does not write a temporary file and then rename it. If the put fails, the artifact is not collected. See `paper/ERRATA.md`.

### 5.4.3 Manifest entries

Append a manifest entry for every archived artifact. The manifest is line-oriented JSON and append-only. Each entry records:

- The SHA-256 hash.
- The source URL or identifier.
- The collection time in UTC.
- The collection method, including tool name and version.
- The investigation.
- The seed account or first-degree account, when one applies.
- Platform metadata that came with the artifact and is not inside the artifact bytes (timestamps, identifiers, version information).

The manifest is the index. Without it, the archive is a directory of hashed files with no reason for each file.

Do not change a manifest entry. A correction is a new entry that supersedes the old entry and cites the old hash.

### 5.4.4 Backups

The archive is the operational record. If it is lost, the investigation is lost. The platform record may have changed, and signals from a missing archive are not reproducible.

The method requires at least one backup on independent infrastructure. The reference implementation can copy the archive to a second Cloudflare R2 bucket. It does not copy to a separate S3-compatible store. See `paper/ERRATA.md`. On other infrastructure, provide an equivalent copy.

Include the manifest in the backup. If the manifest is signed, back up the signature with the manifest.

### 5.4.5 Retention

Retention is the practitioner's decision, and it depends on context. Litigation may have a hold that you must already know. Journalism and research often keep an archive for as long as the documentary record matters. The method does not set a retention period beyond the investigation. Do not delete the archive while someone still relies on the outputs.

## 5.5 Re-collection

Re-collection means you return to the accounts later and collect again. You may need it when the seed grows, when a signal looks wrong, when the investigation stays open, or when someone challenges the first collection.

### 5.5.1 When to re-collect

**The seed grows.** New accounts need collection. Re-collect the existing accounts at the same time so the time bound matches across the seed.

**A signal looks anomalous.** Re-collect the relevant accounts. If the anomaly disappears, the cause is likely the collection layer, not a real signal.

**The investigation stays open.** You expect the network to stay active, and you want the later activity. Re-collect on an interval that matches the network's activity rate.

**Someone challenges the first collection.** A fresh collection from the same source can corroborate the original. The original archive stays the canonical record. Document the fresh collection as a separate event, and compare it to the original.

### 5.5.2 Handling deletions

Content from the first collection is often gone at the second. That fact matters. The original archive still has the bytes. The deletion is new evidence about the operator.

Record a deletion in the manifest. Record the hash from the original archive. Record the source URL where the artifact is now absent. Record the time of the discovery and the collection method that observed the absence.

A tombstone marks an artifact as previously present and now absent. The reference implementation supports a tombstone entry. It has the same structure as a collection entry, with status `absent`.

### 5.5.3 Preservation of vanished evidence

When an operator deletes content you already collected, the apparent intent is to make that content unavailable. The archive keeps the content. The original archive is then the remaining record.

Careful archival at the first collection is the defense against a later deletion. Re-collection cannot recover bytes deleted in the interval.

A tombstone deserves attention in an adversarial report. Selective deletion is a signal that the operator treated the content as important enough to suppress.

## Closing

Collection is the discipline under the rest of the method. An investigation that meets these rules produces a signal table you can rebuild from the archive. It produces claims you can defend. It produces an evidence packet you can use in a dispute. An investigation that misses these rules is a private exploration. The method will not call it more than that.

§6 is feature extraction. It turns the archived artifacts from this section into the signal table. §5 is the precondition for §6. Together they are the predicate for the reasoning in §7 and the output in §8.

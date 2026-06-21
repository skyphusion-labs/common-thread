# 4. Signal Taxonomy (continued)

The first four signal categories were behavioral and relational: account metadata, temporal patterns, linguistic style, and network relationships. This continuation covers the remaining four categories. The first three (visual signals, crossplatform signals, metadata leakage) extend the methodology's reach into artifacts and channels that the previous categories do not cover. The fourth (deliberately excluded signals) is qualitatively different: it documents what the methodology refuses to use, and why.

The same template applies throughout: definition, what the signal can detect, what it cannot detect, false-positive modes, false-negative modes, extraction method.

## 4.5 Visual signals

Visual signals are observable from images posted by or associated with the account. They include profile photographs, banner images, posted media, and the visible content of linked or embedded images. Visual signals can be strong when present, because images carry rich metadata and have a long forensic literature, but they are absent from many investigations: not all accounts post images, and the images they do post may be stripped of metadata by the platform.

The forensic-image-analysis literature is mature. Practitioners working with visual signals should be familiar with perceptual hashing (Zauner 2010 and the OpenCV documentation are reasonable entry points), reverse image search techniques (Bellingcat's investigator's guide), and the recent literature on detecting AI-generated faces (Marra et al. 2018, Wang et al. 2020). The methodology does not require deep expertise in image forensics, but it does assume that practitioners using visual signals will read the relevant background rather than relying on intuition.

### 4.5.1 Profile image perceptual hashing

**What it detects.** Profile photographs that are identical or near-identical across accounts. Operators sometimes reuse images across personas, either by laziness (the same stock photo cropped slightly differently) or by lack of access to other images. Perceptual hashes (pHash, dHash, wavelet-based variants) tolerate moderate transformations like resizing and recompression while distinguishing genuinely different images.

**What it does not detect.** Operators who use distinct images per persona. Operators who use AI-generated faces, where each face is novel and perceptual hashing produces unrelated hashes.

**False-positive modes.** Stock photo libraries are the dominant false-positive source. Two different operators who both pulled the same Unsplash photo as a placeholder will produce a hash match. Reverse image search corroboration is required before treating a hash match as a signal.

**False-negative modes.** Image edits that defeat perceptual hashing while preserving visual identity to a human observer (mirroring, significant color shifts, addition of overlays). Use of AI-generated faces.

**Extraction.** Compute perceptual hashes for each profile image in the seed set, using at least two hash families (pHash and dHash, for example) to reduce single-method blind spots. Compute pairwise Hamming distances. Manually inspect any pair with distance below a configurable threshold to rule out stock-photo coincidence.

### 4.5.2 Banner and pinned-content reuse

**What it detects.** Banner images, pinned-post media, and other prominent visual elements reused across accounts. Banners are reused more commonly than profile photos because operators often think of them as visual chrome rather than identifying markers.

**Extraction.** Same as §4.5.1, applied to banner images, pinned-post media, and other prominent media surfaces.

### 4.5.3 Cross-platform avatar matching

**What it detects.** The same operator using the same image across platforms (X, Reddit, Instagram, Mastodon, LinkedIn). When an operator builds a persona, they often use the same avatar across the platforms where the persona has presence, partly for cross-platform recognizability and partly because creating distinct avatars per platform is friction.

**Extraction.** Apply perceptual hashing across platform boundaries. Match an account's profile image against profile images of accounts on other platforms whose handles or display names are also similar.

### 4.5.4 Image source tracing

**What it detects.** The origin of profile and banner images. A profile image that is traceable to a public stock photo library, a celebrity, a scraped wedding photo from a real person, or a known AI generator points to operator characteristics that are useful for the broader investigation.

**Extraction.** Run reverse image search on the image (Google, Yandex, TinEye, and Bing all produce different results; using multiple is standard practice). For AI-generated images, apply detector tools (FAL.ai detectors, NVIDIA's StyleGAN inversion tooling, or academic detectors like the work of Wang et al.). Document the source class (stock, celebrity, scraped, AI-generated, original) per image.

### 4.5.5 AI-generated face detection

**What it detects.** Profile photographs generated by face-synthesis models (StyleGAN, ThisPersonDoesNotExist, and successors). AI-generated faces remain identifiable in many cases by characteristic artifacts: feature asymmetries, background incoherence, lighting inconsistencies, and (in older models) specific positional regularities of the eyes.

**What it does not detect.** AI-generated faces that have been carefully selected or post-processed to remove characteristic artifacts. The latest generation of synthesis models produces images with fewer detectable artifacts than earlier generations, and the detection problem is in an arms-race state with the generation models.

**False-positive modes.** Real photos with unusual lighting or composition can be flagged as AI-generated by aggressive detectors. Human-tuned synthesis (where an operator iterates on generation parameters to produce a believable face) defeats most detectors.

**False-negative modes.** As above, the detection capability lags the generation capability. A profile photo that defeated detection in 2024 may be flagged in 2026; the inverse is also possible.

**Extraction.** Apply at least one current detector. Treat positive detection as a strong signal, but treat negative detection as inconclusive given the arms-race dynamics. The signal is most useful in combination with other signals; an AI-generated face plus a templated bio plus a creationdate cluster is a much stronger combination than any of the three alone.

### 4.5.6 Color palette overlap

**What it detects.** Accounts that share a distinctive color palette across posted images. Operators who reuse the same image-editing workflow, filter stack, or source material often produce images whose dominant colors cluster similarly even when the images are not perceptual-hash matches. Color palette overlap is weaker than perceptual hashing (§4.5.1 through §4.5.3) but can corroborate those signals when images have been edited enough to defeat hash comparison.

**What it does not detect.** Accounts that post mostly text or that draw images from diverse unrelated sources without a shared editing pipeline.

**False-positive modes.** Platform-wide aesthetic trends (filters, meme templates, stock imagery from the same provider) can produce palette similarity without operator coordination.

**False-negative modes.** Operators who deliberately vary color treatment per persona, or who post images stripped of color information.

**Extraction.** For each account, aggregate a quantized RGB histogram over posted (and optionally profile or banner) images. Compare pairwise using Jensen-Shannon divergence on aligned histogram bins, with cosine similarity and top-color Jaccard as auxiliary metrics. The reference implementation emits pair-level features in the `visual` category; account-level histograms are recorded under `visual` feature names prefixed by image surface (`posted_color_palette_*`, etc.).

## 4.6 Cross-platform signals

Cross-platform signals are observable when accounts under investigation extend beyond a single platform. They are powerful because operators who maintain a network across multiple platforms have to handle each platform consistently with the persona's claimed identity, and consistency is hard to maintain at scale.

The Bellingcat investigator's guide is the standard practitioner reference for cross-platform OSINT. Practitioners working with cross-platform signals should be familiar with the privacy and ethical considerations that come with cross-platform investigation; expanding the surface area of an investigation also expands the surface area of potential harm.

### 4.6.1 Handle reuse across platforms

**What it detects.** The same handle, or close variants of the same handle, in use across multiple platforms. Operators who run a persona across platforms typically register the same handle on each platform; when one is taken, they fall back to predictable variants (adding underscores, numbers, or year suffixes).

**What it does not detect.** Operators who use entirely different handles per platform. Operators who carefully avoid handle reuse as a basic countermeasure.

**False-positive modes.** Common handles are reused organically by different people. A handle like "@redfoxtail" may have different operators on different platforms with no connection between them. The signal weakens with handle commonness; the methodology weights matches by the rarity of the handle string.

**False-negative modes.** Handle variation across platforms. Use of platform-suggested defaults that vary per platform.

**Extraction.** For each account in the seed set, search a configurable set of platforms for the same handle and rule-generated variants. Apply rarity weighting based on the handle string's commonness in dictionary and proper-name corpora. The reference implementation supports a configurable cross-platform search list, defaulting to the major platforms where handle reuse is highest yield.

### 4.6.2 Bio link patterns

**What it detects.** External links in account bios that point to the same destinations across accounts. Operators often link bios to a personal site, a Linktree, a portfolio, or a primary persona. Cross-account bio link overlap is a strong signal because the linked destination is operator-controlled and ties accounts together through a deliberately constructed identity surface.

**Extraction.** Extract bio links per account. Normalize URLs (resolve redirects, strip tracking parameters). Compute pairwise overlap. Surface accounts that share unusual destinations (a shared link to a major platform's home page is weak; a shared link to a small personal site is strong).

### 4.6.3 External link corpus overlap

**What it detects.** Accounts that share substantial overlap in the external content they link to or share. Two accounts that consistently link to the same small set of external sources, with similar framing, are likely either the same operator or operators in coordination.

**What it does not detect.** Accounts that share an information diet without coordination. Members of an academic field, a fandom, or a political tendency will share much of their link corpus without any operator coordination.

**False-positive modes.** Shared information diet is the dominant false-positive source. The signal requires normalization against the link corpus of the broader community.

**False-negative modes.** Operators who diversify link sources across personas.

**Extraction.** Build per-account link corpus (every external URL shared by the account). Normalize. Compute pairwise overlap weighted by rarity of the destination in the broader community corpus.

The reference implementation emits the per-account link corpus as a sorted list of normalized URLs (`posted_urls`) and a count feature (`posted_urls_unique_count`). These account-level rows use the feature category `content_artifacts` because they describe shared content destinations rather than profile metadata or linguistic style; the pair-level overlap features are emitted under `cross_platform` (§6.2.6).

### 4.6.4 Crossplatform posting timing correlation

**What it detects.** Accounts on different platforms that post at correlated times, allowing for typical cross-platform posting workflows (post on X first, then Mastodon, then Bluesky within minutes). Operators running cross-platform networks often have a posting workflow that produces a recognizable temporal sequence across platforms.

**Extraction.** For each pair of accounts on different platforms suspected of common operation, build a sequence of posts from both, ordered by timestamp. Identify temporal patterns: do posts on platform A precede similar-content posts on platform B by a characteristic interval. Build a per-pair lag distribution.

This is the cross-platform analog of §4.2.5 burst correlation, extended across platform boundaries.

### 4.6.5 Visible email-pattern matches

**What it detects.** When email addresses are visible (in bios, in account-recovery hints, in public contact forms, in breach databases that the methodology may treat as out of scope per §4.8), shared email patterns across accounts are strong signal. Operators sometimes use a common email scheme (username1@domain, username2@domain) that produces detectable patterns.

**Practical note.** Most platforms do not expose email addresses. This signal is rarely available and is included for completeness when it is available through legitimate means.

**Extraction.** Extract email addresses from publicly visible profile fields. Compute pattern similarity (shared domain, shared username structure, shared encoding pattern).

## 4.7 Metadata leakage signals

Metadata leakage signals are observable from technical artifacts that operators may not realize they are leaving. They are most useful against unsophisticated operators; sophisticated operators are aware of metadata hygiene and most of these signals will be defeated by routine countermeasures.

The signal category is included primarily because some operators do not apply countermeasures. The methodology does not assume access to metadata that requires platform-internal cooperation; everything in this category is recoverable from public artifacts.

### 4.7.1 EXIF data in posted images

**What it detects.** EXIF metadata embedded in images that have been posted to the platform: camera model, GPS coordinates, capture timestamp, software used for editing. When present, this metadata can establish location, device, and timing in ways that defeat persona separation entirely.

**Practical limit.** Most major platforms strip EXIF on upload as a privacy measure. The signal is most useful for images posted to platforms that do not strip metadata, for images shared via links that bypass platform processing, and for images visible on linked personal sites.

**Extraction.** Download images from the account's posted media. Extract EXIF data with standard tools (exiftool is the practitioner standard). Compare metadata across accounts: shared GPS coordinates, shared device models, shared editing software signatures.

### 4.7.2 Timezone leakage from explicit metadata

**What it detects.** Timezone information that is present in post metadata or in the data the platform makes visible. Some platforms expose timezone information directly in API responses or in the rendered timestamp. When two accounts post with the same timezone offset, that is a weak signal; when they post with the same timezone offset and the timezone is unusual (UTC offsets that are not on the half-hour), that is a stronger signal.

**Distinguished from §4.2.3.** Section 4.2.3 covered active-hour distribution as a behavioral signal: hours when an account is posting versus silent. Section 4.7.2 covers explicit timezone metadata that the platform exposes directly. The signals are related but extracted differently.

**Extraction.** Parse timestamp metadata from platform responses. Extract timezone offset where exposed. Compare across accounts.

### 4.7.3 Device and client fingerprints

**What it detects.** The client application used to post. Some platforms expose the posting client ("posted from Twitter for iPhone", "posted from TweetDeck", "posted from Hootsuite"). When two accounts consistently post from the same client, especially an uncommon one, that is a signal.

**Extraction.** Parse client information from platform responses where exposed. Build per-account client distribution. Compare pairwise.

### 4.7.4 Link shortener fingerprints

**What it detects.** Use of the same link shortener across accounts, especially when the shortener is uncommon or self-hosted. A network of accounts that all use a common self-hosted shortener has a shared infrastructure dependency that points to a common operator.

**Extraction.** Identify shorteners used in posted links. Pay particular attention to self-hosted shorteners or paid commercial shorteners that imply infrastructure ownership.

### 4.7.5 Share-card and embed metadata

**What it detects.** When accounts share links that render as embedded cards, the cards contain metadata generated by the linked site. If the linked site exposes operator-identifying information in its embed metadata (an authorship attribution, a CMS signature, a server signature), that information becomes attached to every share of the link.

**Practical limit.** This is a niche signal. It is most useful when the operator runs a personal site that they reference from sockpuppet accounts.

**Extraction.** Crawl linked sites for embed metadata. Cross-reference operator-identifying fields with accounts sharing the link.

## 4.8 Deliberately excluded signals

This subsection differs in structure from the others. Rather than enumerating signals the methodology uses, it enumerates signals the methodology refuses to use, with reasoning. The exclusions are not omissions; they are deliberate design choices that shape the methodology's ethical character and its abuse surface.

A practitioner who finds themselves wanting to extend the methodology to include signals from this list should treat the impulse as a warning and reconsider.

### 4.8.1 Platform-internal data

The methodology does not use IP addresses, device identifiers, browser cookies, account-recovery email or phone numbers, or any other data that is not visible from the public platform surface. These signals would substantially strengthen attribution but are not accessible to the practitioners the methodology is designed for. Where they are accessible (to platform employees, to law enforcement under legal process, to security researchers under contract), the methodology becomes redundant: those practitioners have stronger tools.

More importantly, building the methodology to use these signals would create false expectations. A pro se litigant, a small-newsroom journalist, or an academic researcher does not have access to platform-internal data, and the methodology's promise would be hollow for them.

### 4.8.2 Signals that primarily detect legitimate pseudonymous use

The methodology is designed to detect coordinated inauthentic behavior, not pseudonymity. There are signals that would distinguish "this account is operated by a real person who is not using their real name" from "this account is operated by their stated identity." The methodology refuses to surface these signals as attribution evidence.

The reasoning is that legitimate pseudonymity is a safety mechanism for many populations: domestic abuse survivors, LGBTQ people in unsafe jurisdictions, dissidents in authoritarian states, sex workers, addiction recovery community members, mental health support seekers, witnesses, whistleblowers, and many others. A methodology that treated "this account is pseudonymous" as evidence of inauthenticity would be a methodology for hurting these populations.

The narrower goal of the methodology is to identify coordination: multiple accounts operated by the same hand for a coordinated purpose. The narrower goal does not require detecting pseudonymity, and the methodology is explicitly designed not to.

### 4.8.3 Signals derived from the target's offline information

The methodology operates on public platform data. It does not use offline information about suspected operators: addresses, employment, family relationships, criminal records, financial records, dating-app profiles, or any other information that would not be visible to a reader of the platform itself.

This is the boundary between the methodology and conventional investigative work. The methodology produces cluster attribution from platform behavior; identifying the natural person behind a cluster requires offline work that is outside the methodology's scope and that has different ethical structure. A practitioner who needs natural-person identification should do that work separately, with the ethical considerations that attach to it.

### 4.8.4 Direct-message contents

The methodology assumes no access to direct messages between any accounts. It is designed for a posture in which DMs are private, and even if some DMs become available to the practitioner (through legal discovery, through cooperative disclosure by one party, through breach data), they are not part of the signal set the methodology uses.

The reasoning is twofold. First, DM data is rarely available; building the methodology around it would limit its applicability. Second, DM data raises privacy issues that public platform data does not; even when access is technically lawful, using DM content as attribution evidence creates a category of methodology that is not interoperable with the publicrecord posture this methodology takes.

### 4.8.5 Breach data and leaked datasets

The methodology does not use data from breaches or leaks, even when that data is publicly available through breach search services. The reasoning has three components.

First, breach data is unreliable for attribution. The connection between a breached email address and a current platform account is often inferential, and the inferential chain is exactly the kind that produces false attributions.

Second, using breach data implicates the practitioner in the downstream effects of the original breach. Even when the data is publicly available, organizing it for attribution purposes is a different act than reading it in passing.

Third, the populations harmed by breach data are not the populations targeted by sockpuppet networks. The same breaches that might expose a network operator's email address also expose millions of unrelated people, including the safety-mechanism populations from §4.8.2.

### 4.8.6 Biometric matching against offline photographs

The methodology does not use facial recognition matching between platform profile images and offline photographs of suspected operators. Facial recognition for this purpose has well-documented accuracy problems, particularly across demographic groups, and the methodology is unwilling to anchor attribution claims on a technology with that track record.

Independently of accuracy, facial recognition crosses from public platform behavior into biometric identification of natural persons, which is the same boundary marked at §4.8.3.

### 4.8.7 Voice or video matching

For platforms that support voice or video posting, the methodology does not use voice-pattern matching or facial-expression matching as attribution signals. The reasoning parallels §4.8.6: the technology's accuracy properties are inadequate for the methodology's confidence-band commitments, and biometric identification crosses the same boundary.

### 4.8.8 Network signals that depend on private data

Section 4.4 covered network signals visible from the platform's public surface: who follows whom, who engages with whose content. The methodology does not use private network signals: blocked-account lists that the platform does not expose, muted-account lists, private follower lists, or any network information that requires unauthorized access to surface.

## Combining signals from §4.5-§4.8

The four categories covered here are different in structure from the earlier four. Visual signals are powerful when present but often absent. Cross-platform signals extend reach but compound ethical considerations. Metadata leakage signals are largely defeated by routine operator countermeasures. The deliberately excluded category is structural rather than enumerative.

A well-formed investigation will use signals from §4.5 through §4.7 as corroboration for the behavioral signals from §4.1 through §4.4, not as primary evidence. Attribution claims that rest primarily on §4.5-§4.7 signals (a perceptual hash match, a cross-platform handle match, an EXIF leak) are vulnerable to the failure modes of those categories and require corroboration from at least one of the behavioral categories before reaching the confidence thresholds defined in §3.2.

## Closing the taxonomy

The taxonomy is intended to be both exhaustive and falsifiable. Exhaustive in that practitioners can categorize most signals they encounter into one of the eight categories; falsifiable in that any signal claimed under the methodology must be extractable from the archived artifacts using a deterministic procedure that another practitioner can replicate.

The next section (§5) addresses collection methodology: how investigations are scoped, how seed accounts are selected, how archival is performed, and how the collection process itself is documented so that the resulting investigation meets the evidentiary framework's reproducibility requirements. The collection methodology is the operational predicate for everything in §4; without it, the signals in this section are uncollected and the methodology is unrun.

The section after that (§6) addresses feature extraction: the deterministic transformation from archived artifacts to the signal table. Section 4 enumerated what signals exist and what they mean; section 6 specifies how to extract them in a way that another practitioner can verify.

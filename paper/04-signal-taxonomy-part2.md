# 4. Signal Taxonomy (continued)

The first four categories were behavioral and relational. They are account metadata, temporal patterns, linguistic style, and network relationships. This file covers the other four. Visual signals, cross-platform signals, and metadata leakage extend the method into artifacts and channels the earlier categories do not cover. The fourth category is different. It records the signals the method refuses, and the reasons.

The same template applies. Each used signal has a definition, a detection claim, a non-detection claim, a false positive, a false negative, and an extraction method.

## 4.5 Visual signals

A visual signal comes from an image the account posts or an image tied to the account. The image may be a profile photograph, a banner, posted media, or the visible content of a linked or embedded image. A visual signal can be strong when it is present. Images carry rich metadata, and the forensic literature is long. The signal is absent from many investigations. Not every account posts an image.

A platform may also strip metadata from an image it hosts.

The forensic literature is mature. A practitioner who uses a visual signal should know perceptual hashing. Zauner (2010) and the OpenCV documentation are reasonable entry points. The practitioner should also know reverse image search, as in the Bellingcat investigator's guide, and the literature on AI-generated faces (Marra et al. 2018, Wang et al. 2020). The method does not require deep expertise in image forensics.

It does assume that the practitioner reads that background and does not rely on intuition alone.

### 4.5.1 Profile image perceptual hashing

**What it detects.** The signal detects profile photographs that are identical or nearly identical across accounts. An operator may reuse an image across personas. The cause may be carelessness, such as one stock photo with a slight crop change, or a lack of other images. A perceptual hash tolerates a moderate change such as a resize or a recompression. pHash, dHash, and wavelet variants are examples. The hash still separates images that are genuinely different.

**What it does not detect.** The signal does not detect an operator who uses a distinct image for each persona. It does not detect an AI-generated face when each face is new. Those hashes are unrelated.

**False-positive modes.** A stock-photo library is the main false positive. Two operators who both use the same Unsplash photo as a placeholder produce a hash match. Confirm a hash match with reverse image search before you treat the match as a signal.

**False-negative modes.** An edit can defeat the hash and still look like the same image to a person. Examples are a mirror, a large color shift, and an overlay. An AI-generated face is another false negative.

**Extraction.** Compute a perceptual hash for each profile image in the seed set. Use at least two hash families, for example pHash and dHash, so one family does not hide a match the other would show. Compute pairwise Hamming distance. Inspect by hand any pair below a configurable threshold, to exclude a stock-photo coincidence.

### 4.5.2 Banner and pinned-content reuse

**What it detects.** The signal detects reuse of a banner, of pinned-post media, or of another prominent visual element. Operators reuse banners more often than profile photos. They often treat a banner as decoration rather than as an identifier.

**Extraction.** Use the method in §4.5.1 on banner images, on pinned-post media, and on other prominent media.

### 4.5.3 Cross-platform avatar matching

**What it detects.** The signal detects the same image on more than one platform. Examples are X, Reddit, Instagram, Mastodon, and LinkedIn. An operator often uses one avatar wherever the persona appears. The avatar supports recognition across platforms. A distinct avatar on each platform is extra work.

**Extraction.** Apply perceptual hashing across platform boundaries. Match a profile image to profile images on other platforms when the handle or the display name is also similar.

### 4.5.4 Image source tracing

**What it detects.** The signal detects the origin of a profile image or a banner image. A useful origin includes a public stock library, a celebrity, a scraped photograph of a real person, and a known AI generator. The origin points to a characteristic of the operator that helps the wider investigation.

**Extraction.** Run reverse image search. Google, Yandex, TinEye, and Bing return different results. Use of more than one service is standard practice. For an AI-generated image, apply a detector. Examples are a FAL.ai detector, NVIDIA StyleGAN inversion tooling, and an academic detector such as Wang et al. Record the source class for each image.

The classes are stock, celebrity, scraped, AI-generated, and original.

The reference implementation does not run reverse image search inside the extractor. The practitioner records the source class in the manifest. See §6.2.5. Section 6.4.6 states that a Workers-hosted face detector is deferred in v1.

### 4.5.5 AI-generated face detection

**What it detects.** The signal detects a profile photograph from a face-synthesis model. Examples are StyleGAN, ThisPersonDoesNotExist, and later models. Many generated faces still show artifacts. Examples are an asymmetry, an incoherent background, inconsistent light, and, in an older model, a regular eye position.

**What it does not detect.** The signal does not detect a generated face that was selected or edited to remove the artifacts. The latest synthesis model has fewer detectable artifacts than an earlier model. Detection and generation are in an arms race.

**False-positive modes.** A real photo with unusual light or an unusual composition can be flagged by an aggressive detector. A human-tuned synthesis, where the operator iterates until the face looks believable, defeats most detectors.

**False-negative modes.** Detection lags generation, as stated above. A photo that defeated detection in 2024 may be flagged in 2026. The reverse is also possible.

**Extraction.** Apply at least one current detector. Treat a positive detection as a strong signal. Treat a negative detection as inconclusive, because of the arms race. The signal is most useful with other signals. An AI-generated face, a templated bio, and a creation-date cluster together are much stronger than any one of the three.

### 4.5.6 Color palette overlap

**What it detects.** The signal detects accounts that share a distinctive color palette across posted images. An operator who reuses one editing workflow, one filter stack, or one source of material often produces similar dominant colors. The images need not match as perceptual hashes. Palette overlap is weaker than perceptual hashing in §4.5.1 through §4.5.3. It can support those signals when an edit defeats the hash.

**What it does not detect.** The signal does not detect an account that posts mostly text. It does not detect images from unrelated sources with no shared editing pipeline.

**False-positive modes.** A platform-wide aesthetic can produce palette similarity with no shared operator. Examples are a popular filter, a meme template, and stock images from one provider.

**False-negative modes.** An operator who varies color treatment per persona defeats the signal. An image with the color information removed defeats it.

**Extraction.** For each account, build a quantized RGB histogram over posted images. Profile images and banner images are optional inputs. Compare pairs with Jensen-Shannon divergence on aligned bins. Use cosine similarity and top-color Jaccard as extra metrics. The reference implementation emits pair features in the `visual` category. Account histograms use `visual` feature names with an image-surface prefix, such as `posted_color_palette_*`.

## 4.6 Cross-platform signals

A cross-platform signal appears when the accounts extend past one platform. The signal is powerful because the operator must keep each platform consistent with the claimed persona. Consistency is hard to keep at scale.

The Bellingcat investigator's guide is the standard practitioner reference for cross-platform OSINT. A cross-platform investigation has a larger surface for harm. Read the privacy considerations and the ethical considerations before you use these signals.

### 4.6.1 Handle reuse across platforms

**What it detects.** The signal detects the same handle, or a close variant, on more than one platform. An operator of a persona usually registers the same handle on each platform. If the handle is taken, the operator often uses a predictable variant. Examples are an added underscore, a number, or a year suffix.

**What it does not detect.** The signal does not detect an operator who uses an entirely different handle on each platform. It does not detect an operator who avoids handle reuse as a basic countermeasure.

**False-positive modes.** Different people reuse a common handle with no connection. A handle such as "@redfoxtail" may have a different operator on each platform. A more common handle is a weaker signal. The method weights a match by the rarity of the handle string.

**False-negative modes.** Variation across platforms defeats the signal. A platform default that differs by platform defeats it.

**Extraction.** For each seed account, search a configurable set of platforms for the same handle and for rule-generated variants. Weight the match by rarity in a dictionary corpus and in a proper-name corpus. The reference implementation supports a configurable search list. The default is the major platforms where handle reuse has the highest yield.

### 4.6.2 Bio link patterns

**What it detects.** The signal detects bio links that point at the same destination across accounts. An operator often links a bio to a personal site, a Linktree page, a portfolio, or a primary persona. Overlap is a strong signal. The destination is under the operator's control. It ties accounts together through an identity surface the operator built.

**Extraction.** Extract the bio links for each account. Normalize each URL. Resolve redirects and remove tracking parameters. Compute pairwise overlap. Show accounts that share an unusual destination. A link to the home page of a major platform is weak.

A link to a small personal site is strong.

### 4.6.3 External link corpus overlap

**What it detects.** The signal detects accounts that link to, or share, much of the same external content. Two accounts that keep linking to the same small set of sources, with similar framing, are likely one operator or operators in coordination.

**What it does not detect.** The signal does not detect a shared information diet with no coordination. Members of one academic field, one fandom, or one political tendency share much of a link corpus with no shared operator.

**False-positive modes.** A shared information diet is the main false positive. Normalize against the link corpus of the wider community.

**False-negative modes.** An operator who diversifies link sources across personas defeats the signal.

**Extraction.** Build a link corpus for each account. The corpus is every external URL the account shared. Normalize the URLs. Compute pairwise overlap weighted by how rare the destination is in the wider community.

The reference implementation emits the corpus as a sorted list of normalized URLs, `posted_urls`, and as a count, `posted_urls_unique_count`. Those account rows use the category `content_artifacts`. They describe shared destinations, not profile metadata and not linguistic style. Pair overlap is emitted under `cross_platform`. See §6.2.6.

### 4.6.4 Crossplatform posting timing correlation

**What it detects.** The signal detects accounts on different platforms that post at correlated times. Allow for a typical cross-platform workflow. An example is a post on X, then Mastodon, then Bluesky, within minutes. An operator of a cross-platform network often has a workflow that produces a recognizable sequence.

**Extraction.** Take each pair of accounts on different platforms that you suspect share an operator. Build one sequence of posts from both accounts. Order that sequence by time. Look for a pattern. Do posts on platform A precede similar posts on platform B by a characteristic interval? Build a lag distribution for the pair.

This signal is the cross-platform form of burst correlation in §4.2.5.

### 4.6.5 Visible email-pattern matches

**What it detects.** The signal detects a shared email pattern when an email address is visible. Visibility may come from a bio, an account-recovery hint, or a public contact form. A breach database is out of scope under §4.8. An operator may use one scheme, such as username1 at one domain and username2 at the same domain. That scheme is detectable.

**Practical note.** Most platforms do not show an email address. The signal is rarely available. It is included for the case where a legitimate source shows it.

**Extraction.** Extract email addresses from fields the profile shows in public. Compute pattern similarity. The pattern may be a shared domain, a shared username structure, or a shared encoding.

## 4.7 Metadata leakage signals

A metadata-leakage signal comes from a technical artifact the operator may not know they left. The signal is most useful against an unsophisticated operator. A sophisticated operator knows metadata hygiene. Routine countermeasures defeat most of these signals.

The category is included because some operators do not apply a countermeasure. The method does not assume metadata that needs help from inside the platform. Everything in this category can be recovered from a public artifact.

### 4.7.1 EXIF data in posted images

**What it detects.** The signal detects EXIF metadata in an image posted to the platform. The fields include camera model, GPS coordinates, capture time, and editing software. When the fields are present, they can show location, device, and time in a way that defeats persona separation.

**Practical limit.** Most large platforms strip EXIF on upload, as a privacy measure. The signal is most useful in three cases. The platform does not strip metadata. The image is shared by a link that bypasses platform processing. The image is visible on a linked personal site.

**Extraction.** Download images from the posted media of the account. Extract EXIF data with a standard tool. exiftool is the practitioner standard. Compare metadata across accounts. Look for shared GPS coordinates, a shared device model, and a shared editing-software signature.

### 4.7.2 Timezone leakage from explicit metadata

**What it detects.** The signal detects timezone data in post metadata or in data the platform shows. Some platforms expose a timezone in an API response or in the rendered timestamp. The same offset on two accounts is a weak signal. The same unusual offset is stronger. An unusual offset is one that is not on the half hour.

**Relation to §4.2.3.** Section 4.2.3 is a behavioral signal. It covers hours of posting and hours of silence. Section 4.7.2 is explicit timezone metadata the platform exposes. The signals are related. Extraction differs.

**Extraction.** Parse timestamp metadata from the platform response. Extract the timezone offset where the platform exposes it. Compare offsets across accounts.

### 4.7.3 Device and client fingerprints

**What it detects.** The signal detects the client application used to post. Some platforms expose that client. Examples are "posted from Twitter for iPhone," "posted from TweetDeck," and "posted from Hootsuite." Consistent use of the same client, especially an uncommon client, is a signal.

**Extraction.** Parse client information from the platform response where the platform exposes it. Build the client distribution for each account. Compare the distributions pairwise.

### 4.7.4 Link shortener fingerprints

**What it detects.** The signal detects use of the same link shortener across accounts. The signal is stronger when the shortener is uncommon or is hosted by the operator. A network that shares one self-hosted shortener has a shared infrastructure dependency. That dependency points to one operator.

**Extraction.** Identify the shorteners in posted links. Give extra attention to a self-hosted shortener and to a paid commercial shortener. Those choices imply ownership of infrastructure.

### 4.7.5 Share-card and embed metadata

**What it detects.** A shared link may render as an embedded card. The card contains metadata from the linked site. If that metadata identifies the operator, every share of the link carries the identification. Examples are an authorship credit, a CMS signature, and a server signature.

**Practical limit.** The signal is narrow. It is most useful when the operator runs a personal site and the sockpuppet accounts refer to that site.

**Extraction.** Read embed metadata from the linked sites. Cross-check operator-identifying fields with the accounts that share the link.

## 4.8 Deliberately excluded signals

This subsection does not list signals the method uses. It lists signals the method refuses, with the reasons. The exclusions are design choices. They shape the ethical character of the method and the surface for abuse.

If you want to add a signal from this list, treat that impulse as a warning and reconsider.

### 4.8.1 Platform-internal data

The method does not use an IP address, a device identifier, or a browser cookie. It does not use an account-recovery email or an account-recovery phone number. It does not use other data that is absent from the public platform surface. Those signals would strengthen attribution. The practitioners this method is for cannot obtain them. Where a practitioner can obtain them, the method is redundant.

That practitioner is a platform employee, law enforcement under legal process, or a security researcher under contract. Those practitioners have stronger tools.

A method built on these signals would also create a false expectation. A pro se litigant, a journalist in a small newsroom, and an academic researcher do not have platform-internal data. A promise that needs that data would be empty for them.

### 4.8.2 Signals that primarily detect legitimate pseudonymous use

The method detects coordinated inauthentic behavior. It does not detect pseudonymity. Some signals would separate "a real person who does not use a legal name" from "an account operated by the stated identity." The method refuses to use those signals as attribution evidence.

Legitimate pseudonymity is a safety measure for many people. The populations include a survivor of domestic abuse and an LGBTQ person in an unsafe jurisdiction. They include a dissident in an authoritarian state, a sex worker, and a member of an addiction-recovery community. They include a person who seeks mental-health support, a witness, and a whistleblower. A method that treated "this account is pseudonymous" as evidence of inauthenticity would harm those people.

The narrower goal is coordination. Several accounts share one operator and a coordinated purpose. That goal does not require detection of pseudonymity. The method is built not to detect it.

### 4.8.3 Signals derived from the target's offline information

The method uses public platform data. It does not use offline information about a suspected operator. That information includes an address, employment, a family relationship, a criminal record, a financial record, and a dating-app profile. It includes any fact a reader of the platform itself would not see.

This boundary separates the method from ordinary investigation. The method produces a cluster from platform behavior. Naming the natural person behind a cluster is offline work. That work is outside the method and has a different ethical structure. Do that work separately, with the ethical duties that attach to it.

### 4.8.4 Direct-message contents

The method assumes no access to a direct message between accounts. Direct messages stay private in the posture of the method. A direct message may become available through legal discovery, through disclosure by one party, or through breach data. It is still not part of the signal set.

The reasons are two. Direct-message data is rarely available. A method built on it would apply in few cases. Direct-message data also raises a privacy issue that public platform data does not. Lawful access does not put message content into a method that takes a public-record posture.

### 4.8.5 Breach data and leaked datasets

The method does not use breach data or leak data, even when a breach-search service shows it in public. There are three reasons.

First, breach data is unreliable for attribution. The link from a breached email address to a current platform account is often an inference. That kind of chain produces false attribution.

Second, use of breach data ties the practitioner to the later effects of the original breach. The data may be public. Organizing it for attribution is a different act from reading it in passing.

Third, the people harmed by breach data are not the targets of a sockpuppet network. The same breach that might show an operator's email also exposes millions of unrelated people. Those people include the populations in §4.8.2.

### 4.8.6 Biometric matching against offline photographs

The method does not match a platform profile image to an offline photograph of a suspected operator by face recognition. Face recognition for this purpose has documented accuracy problems, including across demographic groups. The method will not rest an attribution claim on a technology with that record.

Apart from accuracy, face recognition crosses from public platform behavior into biometric identification of a natural person. That is the same boundary as §4.8.3.

### 4.8.7 Voice or video matching

On a platform that supports voice or video, the method does not use voice-pattern matching or facial-expression matching. The reason matches §4.8.6. The accuracy is not adequate for the confidence bands. Biometric identification crosses the same boundary.

### 4.8.8 Network signals that depend on private data

Section 4.4 covers network signals on the public surface. Those signals are who follows whom and who engages with whose content. The method does not use a private network signal. Examples are a block list the platform does not show, a mute list, a private follower list, and any network fact that requires unauthorized access.

## Combining signals from §4.5-§4.8

These four categories differ in structure from the first four. A visual signal is powerful when present and is often absent. A cross-platform signal extends reach and adds ethical considerations. A metadata-leakage signal is largely defeated by a routine countermeasure. The excluded category is structural. It is not a list of signals to compute.

Use §4.5 through §4.7 to corroborate the behavioral signals in §4.1 through §4.4. Do not use them as the primary evidence. A claim that rests mainly on §4.5 through §4.7 is exposed to the failures of those categories. Examples are a perceptual-hash match, a cross-platform handle match, and an EXIF leak. Corroborate that claim with at least one behavioral category before it reaches a band in §3.2.

## Closing the taxonomy

The taxonomy is meant to be exhaustive and falsifiable. Exhaustive means a practitioner can place most signals they meet into one of the eight categories. Falsifiable means a signal claimed under the method must be extractable from the archived artifacts by a deterministic procedure that another practitioner can repeat.

Section 5 is collection. It covers scope, seed selection, the archive, and the record of collection. That record is what lets the investigation meet the reproducibility rules. Collection is the operational predicate for §4. Without it, the signals in this section are not collected and the method does not run.

Section 6 is feature extraction. It is the deterministic change from archived artifacts to the signal table. Section 4 states which signals exist and what they mean. Section 6 states how to extract them so another practitioner can check the result.

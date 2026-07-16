# 6. Feature extraction

This section specifies the deterministic transformation from the archived artifacts produced by the collection methodology (§5) to the signal table consumed by the attribution reasoning layer (§7). Feature extraction is the methodology's reproducibility primitive: given the same archive and the same extractor versions, every practitioner who runs the methodology arrives at the same signal table.

The section is organized around the determinism requirement (§6.1), the extractor specifications for each signal category (§6.2), the signal table schema (§6.3), edge cases and known failure modes (§6.4), and performance considerations (§6.5). The reference implementation is one realization of these specifications; other implementations should be possible from the methodology alone, and the methodology's commitment to reproducibility includes commitment to specifications that another implementer could follow.

## 6.1 Determinism requirement

Feature extractors in Common Thread are pure functions of the archived artifacts and the extractor configuration. They produce the same output every time they run against the same input. The methodology requires this discipline at the implementation level, and the reference implementation enforces it through several technical choices.

### 6.1.1 What "pure function" means here

A feature extractor in Common Thread reads archived artifacts and produces rows in the signal table. It has no other inputs and no other outputs. Specifically, an extractor does not:

- Call any LLM or other non-deterministic external service
- Make any network request not necessary to read the archive
- Use any library that produces non-deterministic output (random sampling, non-deterministic ML inference, system clock as a feature input)
- Write any side effects beyond the signal table rows it is producing
- Read any configuration that varies between practitioners running the same investigation against the same archive

The intent is that any practitioner with access to the archive, the extractor code at a specific version, and the extractor configuration can recompute the signal table and verify that the rows match. This is the strongest form of reproducibility the methodology promises and is the foundation for everything in §7 and §8.

### 6.1.2 Versioning

Each extractor is versioned. Signal table rows record the version of the extractor that produced them. When an extractor is updated (a new feature is added, a calculation is improved, a bug is fixed), the version is incremented. Signal table rows from prior versions remain valid records of what the prior version computed; rows from the new version supersede them for any analysis that prefers current extractor output.

The methodology permits an investigation to use rows from multiple extractor versions, as long as the version is recorded per row. A practitioner re-running an investigation after an extractor update can choose to recompute the affected signals or to leave the prior signals in place. The choice is the practitioner's; the methodology requires only that the choice is recorded.

The reference implementation stores extractor versions in the signal table schema and refuses to overwrite rows from a different extractor version without an explicit operation. This prevents accidental silent updates that would break reproducibility.

### 6.1.3 No LLM at this layer

The exclusion of LLM calls from feature extraction is a structural commitment of the methodology, not an implementation detail. The attribution reasoning layer in §7 uses an LLM and is non-deterministic; the feature extraction layer is deterministic. Mixing the two would defeat the reproducibility properties on which the methodology's evidentiary posture depends.

This exclusion has practical consequences. Some signals that would benefit from LLM-assisted extraction are computed in less sophisticated ways at the extraction layer to preserve determinism. Topic clustering, for example, could be improved with LLM-assisted topic identification; the methodology uses deterministic clustering (TF-IDF based) instead. The trade-off is intentional: the methodology accepts slightly lower extraction quality in exchange for full reproducibility at this layer, and recovers reasoning quality at the §7 layer where the LLM operates over the deterministic signals rather than within them.

## 6.2 Extractor specifications

This subsection specifies the extraction requirements for each signal category. The level of specificity varies: where the choice of algorithm is load-bearing for reproducibility or for signal quality, the methodology specifies the algorithm. Where the choice is incidental, the methodology specifies the result and leaves the implementation to the practitioner.

### 6.2.1 Account metadata extractors

The signals in §4.1 are extracted by parsing account profile data from the archive. The extraction is mechanical: each signal corresponds to a specific field in the platform's profile representation, and the extractor reads the field and writes a row to the signal table.

For creation-date clustering (§4.1.1), the extractor computes pairwise time deltas across all account creation timestamps in the seed set and writes one row per pair. The clustering itself happens at the reasoning layer; the extractor is responsible only for producing the deltas.

For display-name and handle patterns (§4.1.2), the extractor computes pairwise edit distances using the Levenshtein algorithm at the character level. The methodology requires Levenshtein specifically because it is the most widely implemented distance metric and produces consistent results across implementations. Practitioners using other distance metrics should document the choice; the methodology's reasoning layer is calibrated to Levenshtein output.

For bio template matching (§4.1.3), the extractor parses bios into typed slots using a regex-based slot identifier that the methodology specifies as a configuration file. The slot set is conventional (location, occupation, identifier tokens, link patterns) and is published in the reference implementation as a default. Practitioners can extend the slot set, but the extractor version is incremented when they do, so downstream consumers can see that a non-standard slot set was used.

The remaining metadata signals (verification status, profile customization, stated location) are extracted by direct field reading. No algorithmic specification is needed; the extractor reads the platform's profile representation and writes the corresponding fields to the signal table.

### 6.2.2 Temporal extractors

The signals in §4.2 require parsing post timestamps and computing distributional statistics over them.

For posting-cadence correlation (§4.2.1), the extractor bins posts by hour-of-day and day-of-week per account, producing a 168-bin distribution (24 hours times 7 days). Pairwise comparison uses Jensen-Shannon divergence, which the methodology specifies as the distance metric because it is bounded, symmetric, and produces output in a consistent range (zero to one in the base-two formulation). The extractor writes the per-account distribution and the pairwise divergences to the signal table.

For response-latency correlation (§4.2.2), the extractor requires triggering-event annotations as input. Triggering events are specified by the practitioner during investigation setup (which posts, news events, or external actions count as triggers). The extractor computes, for each event and each account, the time delta between the event timestamp and the account's first engagement with content related to the event. The methodology specifies "first engagement" as the earliest post by the account that references the event in a way the extractor can detect (URL, hashtag, named reference, or amplification of an event-related post). The extractor writes per-event-per-account latencies and per-account latency distributions to the signal table.

For active-hour distribution (§4.2.3), the extractor produces a 24-bin distribution per account and computes pairwise Jensen-Shannon divergences. The methodology specifies that timezone normalization is performed at the platform's native timezone if exposed, and at UTC otherwise. Practitioners working across timezones should document the normalization choice.

For quiet-period correlation (§4.2.4), the extractor identifies silence periods longer than a configurable threshold (the methodology's default is 24 hours) per account, and writes overlap statistics for pairs. The threshold is a parameter, and the signal table records which threshold was used.

For burst correlation (§4.2.5), the extractor identifies burst periods using a configurable threshold expressed in standard deviations above the account's baseline posting rate (the methodology's default is 2 standard deviations over a 14-day rolling baseline). The signal table records burst-overlap statistics per pair and the threshold parameters.

### 6.2.3 Linguistic extractors

Linguistic extraction is the most algorithmically prescriptive of the categories, both because the prior literature provides clear guidance and because variations in algorithm choice produce meaningfully different results.

The reference implementation records all §4.3 linguistic features under the signal-table category name `stylometric`, matching the stylometrics terminology used in §4.3.1 and the attribution-reasoning validation rules (§7.3.1). Paper text uses *linguistic* for the taxonomy category; implementation output and prompts use `stylometric` for the same category.

For stylometric markers (§4.3.1), the methodology specifies Burrows' Delta as the baseline distance metric. The implementation follows the formulation in Burrows (2002): compute the frequency of each function word per author (here, per account), z-score the frequencies against the corpus of all authors in the seed set, and compute the mean absolute difference of z-scores between author pairs. The methodology specifies a function-word list of the top 150 most-frequent words in the language of the corpus, identified from a reference corpus appropriate to the language (the Corpus of Contemporary American English for English-language investigations is a defensible default).

The choice of 150 words is the methodology's default and is not load-bearing; the literature supports values from 50 to 500. Practitioners can change the count; the signal table records the choice.

The extractor also computes sentence-length distribution per account (binned by sentence length in tokens), punctuation rates (per-token frequency of major punctuation marks), and capitalization rates (fraction of words capitalized in non-sentence-initial position). Each of these is recorded as a per-account distribution and as pairwise distances using the same Jensen-Shannon divergence used for temporal signals.

For topic vocabulary overlap (§4.3.2), the extractor computes TF-IDF per account against a background corpus that is either specified by the practitioner or derived from a control corpus the reference implementation provides for major languages. The extractor identifies the top N distinctive terms per account (the methodology's default is N=100) and computes pairwise weighted overlap using term rarity weights. Higher overlap on rarer terms produces stronger signal.

For idiosyncratic phrase reuse (§4.3.3), the extractor computes n-grams from 3-grams through 7-grams per account, with novelty weighting against the background corpus. The methodology specifies that the n-gram weighting use TF-IDF analogously to the topic-overlap signal but applied to n-gram frequencies. The extractor surfaces n-grams that are rare in the background and appear in multiple seed accounts, ranked by combined rarity and seed-set frequency.

For code-switching patterns (§4.3.4) and typo-and-error patterns (§4.3.5), the extractor relies on auxiliary tooling (language detection libraries for code-switching, rule-based pattern matchers for typo categories). The methodology does not specify the auxiliary tooling but requires that the version and configuration of the tooling be recorded in the signal table.

### 6.2.4 Network extractors

Network extraction operates on follower and engagement data from the archive.

For follower overlap (§4.4.1), the extractor computes Jaccard similarity of follower sets pairwise. The methodology requires normalization against a community baseline: the same Jaccard computation is performed for pairs of control accounts in the seed set (§5.1.4), and the raw similarity is reported alongside the normalized similarity (raw value minus community baseline mean, divided by community baseline standard deviation). The signal table records both raw and normalized values.

For mutual-follow patterns (§4.4.2), the extractor identifies pairs of accounts in the seed set that mutually follow each other, and records the time at which the mutual relationship was established (the later of the two follow timestamps). The signal table records per-pair mutual status and timing.

For co-engagement timing on third-party content (§4.4.3), the extractor identifies posts engaged by two or more accounts in the seed set and computes pairwise time deltas. The signal table records per-pair distributions of co-engagement deltas.

For cross-account amplification (§4.4.4), the extractor computes the fraction of each account's amplification (likes, reposts, quote-posts received) that comes from other accounts in the seed set, normalized against the same fraction for control accounts.

### 6.2.5 Visual extractors

Visual extraction relies on perceptual hashing libraries and image-processing tooling.

For perceptual hashing (§4.5.1 through §4.5.3), the methodology requires at least two hash families. The reference implementation uses pHash (perceptual hashing based on discrete cosine transform) and dHash (difference hash). The use of two families reduces single-method blind spots: an image edit that defeats pHash may not defeat dHash, and vice versa. The signal table records hashes from both families and pairwise Hamming distances.

For image source tracing (§4.5.4), the extractor relies on reverse-image-search results which are non-deterministic across runs. To preserve determinism at the extractor layer, the reference implementation does not perform reverse image search in the extractor; instead, the practitioner performs reverse search manually and records the source class (stock, celebrity, scraped, AI-generated, original) in the manifest, which the extractor reads.

For AI-generated face detection (§4.5.5), the extractor applies a detector library. The detector is non-deterministic in the sense that different detectors disagree on edge cases, but for any specific detector and version, the output is deterministic. The signal table records the detector identifier, version, and output per profile image.

For color palette overlap (§4.5.6), the collection layer aggregates per-account quantized RGB histograms into a corpus artifact. The account extractor computes histogram bins, top-color summaries, and image counts; the pair extractor computes Jensen-Shannon divergence, cosine similarity, and top-color Jaccard on aligned histograms. See §6.4.6 for v1 collection-layer availability.

### 6.2.6 Cross-platform extractors

Cross-platform extraction operates on artifacts collected from multiple platforms.

For handle reuse (§4.6.1), the extractor performs exact and near-exact string matching across handles. The methodology specifies a small set of variant rules (numeric suffix addition, underscore insertion, dot insertion, year-suffix addition) and computes match scores for each pair. The signal table records the match score and the variant rule that produced the highest score.

For bio link patterns (§4.6.2) and external link corpus overlap (§4.6.3), the extractor normalizes URLs (resolving redirects, stripping tracking parameters) and computes pairwise overlap with rarity weighting. Per-account posted-URL lists are emitted by the platform stylometric extractors under the `content_artifacts` category (`posted_urls`, `posted_urls_unique_count`); pair-level Jaccard overlap is emitted under `cross_platform`.

For cross-platform timing correlation (§4.6.4), the extractor operates analogously to the within-platform temporal extractors (§6.2.2) but across artifacts from different platforms. The signal table records cross-platform timing distributions.

### 6.2.7 Metadata-leakage extractors

Metadata-leakage extraction parses technical metadata from collected artifacts.

For EXIF data (§4.7.1), the extractor uses standard EXIF parsing libraries (exiftool is the practitioner standard) to read metadata from image files in the archive. The signal table records per-image EXIF fields and pairwise consistency statistics.

For timezone leakage from explicit metadata (§4.7.2), the extractor reads timezone fields from platform responses where exposed. The signal table records per-account timezone offsets and consistency.

For client fingerprints (§4.7.3), the extractor reads the client field from platform-supplied post metadata and records per-account client distributions. The signal table records client-distribution similarity pairwise.

For link shortener fingerprints (§4.7.4) and share-card metadata (§4.7.5), the extractor identifies the shorteners and embed sources used and records their distributions.

## 6.3 Signal table schema

The signal table is the structured output that all feature extractors write to. The schema is designed to be queryable (typical questions a practitioner asks should be answerable in SQL or equivalent), versioned (extractor versions are recorded per row), and append-only (rows are not mutated after writing).

The schema has three primary tables. The reference implementation uses MySQL via Cloudflare Hyperdrive; other implementations can use any relational store.

### 6.3.1 Per-account features

The `account_features` table records features computed for individual accounts. Each row records:

- Investigation identifier
- Account identifier (handle or platform-internal identifier)
- Feature identifier (which extractor produced this feature)
- Extractor version
- Feature value (typed by the feature: numeric, string, distribution-as-JSON, blob)
- Collection timestamp range over which the feature was computed
- Computation timestamp
- Provenance hash (hash of the archived artifacts that contributed to this feature)

The provenance hash is the critical reproducibility primitive at this layer. Given a row in `account_features` and the archive, any practitioner can verify that the same artifacts were used and recompute the feature.

### 6.3.2 Per-pair features

The `pair_features` table records features computed for pairs of accounts. Schema parallels `account_features` but with two account identifiers per row. Pair features are symmetric: the methodology requires that swapping the two account identifiers produces an equivalent row, and the reference implementation enforces this by canonicalizing the account-identifier ordering.

### 6.3.3 Per-event features

The `event_features` table records features computed for specific events (triggering events for response-latency signals, burst windows for burst correlation, deletion discoveries for re-collection). Each row records the event identifier, the account or pair the feature is about, and the standard provenance fields.

### 6.3.4 Schema versioning

The schema itself is versioned. The reference implementation includes schema migrations between versions. Signal tables produced under an older schema remain readable; the methodology does not require re-extraction when the schema is updated unless an old extractor relied on schema elements that have been removed.

The schema version, alongside extractor versions, is part of the reproducibility envelope. An investigation conducted under schema version X with extractors at versions Y1 through Yn can be exactly reproduced by another practitioner who replicates schema X and extractor versions Y1 through Yn against the original archive.

## 6.4 Edge cases and known failure modes

Feature extractors operate at the level of signal computation, not signal interpretation. Edge cases that would confuse the interpretation layer (§7) should be flagged at the extraction layer so the interpretation layer can handle them appropriately.

### 6.4.1 Insufficient data

Some signals require a minimum amount of input data to be meaningful. Stylometric signals require thousands of words of text per account; temporal signals require dozens to hundreds of posts spanning weeks of activity; network signals require at least one follower-list collection per account.

The methodology specifies that extractors record a "confidence" flag per signal table row, indicating whether the input data was sufficient for the signal to be meaningful. The reference implementation uses three levels: sufficient (the signal is computed normally), marginal (the signal is computed but the data is at the lower bound of reliability), and insufficient (the signal cannot be reliably computed; a placeholder row is written with the insufficient flag set).

The reasoning layer in §7 uses the confidence flag to weight signals appropriately. A signal with insufficient flag is not used in attribution; a signal with marginal flag is used but discounted.

### 6.4.2 Bilingual or multilingual accounts

Accounts that post in multiple languages produce stylometric signals that are not directly comparable across languages. The function-word distribution in English is different from the function-word distribution in Spanish, and Burrows' Delta computed across mixed-language corpora produces noisy results.

The methodology specifies that linguistic extractors classify each post by language and either compute per-language signals separately or restrict computation to the dominant language per account. The reference implementation uses the dominant-language approach by default and records the language used per account in the signal table. Practitioners working with substantially multilingual networks should consider the per-language approach.

### 6.4.3 Account-sharing within real communities

Some accounts are operated by multiple legitimate users: married couples sharing an account, organizational accounts with multiple posters, PR firms posting on behalf of clients, volunteer-run community accounts. These accounts produce stylometric signal patterns that look like sockpuppet activity (multiple authorial voices) but are not coordinated inauthentic behavior.

The methodology cannot distinguish these cases from sockpuppetry at the extraction layer. The extractor flags accounts whose internal stylometric variance is unusually high relative to the account's length, surfacing them to the reasoning layer for treatment as edge cases. The reasoning layer in §7 is prompted to consider account-sharing as an alternative explanation for high internal variance.

### 6.4.4 Accounts that change behavior over time

Accounts may change their behavior substantially over time. A user who experienced a major life event, changed their profession, joined or left a community, or simply matured may show distinct stylometric and temporal patterns across periods of their account's life.

The methodology specifies that extractors compute signals over the full collection window by default and additionally over the most recent third of the window when sufficient data is available. The signal table records both versions, allowing the reasoning layer to detect cases where comparisons within the recent window differ substantially from comparisons over the full history.

### 6.4.5 Deleted content discovered during re-collection

When re-collection (§5.5) discovers that content present in earlier collection is now absent, the extractor must handle the absence appropriately. The methodology specifies that signals computed from the earlier collection remain valid (the archive preserves the deleted content), but signals computed from the later collection are computed only against the still-present content. The signal table records collection windows per signal so the reasoning layer can identify which signals were computed against which versions of the network's behavior.

### 6.4.6 Reference implementation v1 signal availability

Extractors for the full §4 taxonomy are present in the reference implementation, but not every signal is populated on the default v1 ingest path. The table below states what practitioners should expect from a standard Apify Twitter ingest without additional configuration.

| Signal | Paper | v1 default ingest | Notes |
|--------|-------|-------------------|-------|
| §4.1, §4.2.1, §4.2.3–§4.2.5, §4.3, §4.5.1–§4.5.3, §4.6, §4.7 (partial) | Active | Timeline and profile artifacts drive account and pair features. |
| §4.4.1–§4.4.2 | Active when follower/following lists are in the ingest payload | Skipped when network lists are absent. |
| §4.4.3–§4.4.4 | Active when ≥2 accounts ingested | Engagement events are derived from reply, repost, and quote posts in per-account timeline artifacts. Likes and other non-authored engagements are not collected in v1. |
| §4.2.2 response latency | **Configured** | Extractors run when the practitioner populates `triggering_events` via `PATCH /investigations/:id/metadata` or the web UI. Default investigations without triggering events produce no response-latency rows. |
| §4.5.6 color palette | **Active** | Default Twitter ingest builds `application/x-color-palette-corpus` artifacts when posted images decode; account and pair extractors run on the corpus. |
| §4.6.3 posted URLs | Active | Emitted as `content_artifacts` account features; pair overlap under `cross_platform`. |
| §4.5.4 image source_class | Active when labeled | Practitioner sets `platformMetadata.source_class`; account + pair visual features. |
| §6.2.3 sentence / punctuation / capitalization JSD | **Active** | Account extractors emit `sentence_length_distribution`, `punctuation_distribution`, and `capitalization_distribution`; pair extractors emit `jsd_sentence_length`, `jsd_punctuation`, and `jsd_capitalization` when both sides have the distributions. |
| §4.7.4 link shortener fingerprints | Active | Account `shortener_*` features emitted with posted URLs; pair overlap under `metadata_leakage`. |
| §4.3.4 code-switching / register | **Active** | Twitter timeline ingest runs `code_switching_twitter` (rule-based register + script/stopword code-switch classifiers). Pair features: `jsd_register`, switch-rate abs diffs, optional `jsd_code_switch_pattern`. |

Practitioners auditing an investigation should treat the signal table as authoritative: a category listed in §4 but absent from the table for a given run was either not collected, not configured, or not applicable to that payload.

## 6.5 Performance considerations

The methodology requires that feature extraction be feasible on practitioner-grade hardware for investigations of typical scope. The reference implementation targets investigations of up to 50 accounts in the seed set on a laptop, completing within minutes to an hour depending on the data volume per account.

Pairwise computations scale as O(N^2) in seed-set size. For 50 accounts, this is 1,225 pairs, which is comfortable. For 500 accounts, it is approximately 125,000 pairs, which requires either batching strategies or longer running times. The methodology does not impose a hard upper bound on seed-set size but warns practitioners that pairwise computations dominate at large N.

The reference implementation caches intermediate computations (function-word vectors per account, follower sets, link corpora) so re-computation after seed-set changes is incremental rather than full. The cache invalidation rule is conservative: any change to the underlying archive or to an extractor version invalidates the cache.

## Closing

Feature extraction is the layer at which the methodology's reproducibility commitment is most concretely realized. Every claim in an attribution output is supposed to trace back to signals; every signal is supposed to trace back to the deterministic computation specified here; every deterministic computation is supposed to trace back to the archived artifacts collected per §5. The chain holds because each link is auditable.

The next section (§7) describes attribution reasoning: the LLM-assisted layer that operates over the deterministic signals produced here to produce qualitative attribution claims at the confidence bands specified in §3.2. The reasoning layer is the methodology's most distinctive component and its most ethically charged; the discipline of §6 is what makes the reasoning layer trustworthy at the level the methodology requires.

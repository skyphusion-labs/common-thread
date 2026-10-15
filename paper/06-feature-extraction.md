# 6. Feature extraction

This section specifies the change from archived artifacts (§5) to the signal table (§7). Feature extraction is the reproducibility step. The same archive and the same extractor versions produce the same signal table.

The section covers five topics. They are the determinism rule (§6.1) and the extractor rules (§6.2). They are the signal table schema (§6.3), known failures (§6.4), and performance (§6.5). The reference implementation is one realization. Another implementer can follow these rules.

## 6.1 Determinism requirement

A feature extractor is a pure function of the archived artifacts and the extractor configuration. The same input produces the same output on every run. The reference implementation enforces this rule.

### 6.1.1 What "pure function" means here

A feature extractor reads archived artifacts. It writes rows in the signal table. It has no other input and no other output.

An extractor does not do any of the following.

- It does not call an LLM or any other non-deterministic service.
- It does not make a network request except to read the archive.
- It does not use random sampling, non-deterministic inference, or the system clock as a feature input.
- It does not write a side effect beyond the signal table rows.
- It does not read configuration that differs between practitioners who run the same investigation on the same archive.

A practitioner with the archive, one extractor version, and the extractor configuration can recompute the signal table. The practitioner can then check that the rows match. This is the strongest reproducibility the method promises. Sections 7 and 8 depend on it.

### 6.1.2 Versioning

Each extractor has a version. Each signal table row records that version. A new feature, a better calculation, or a bug fix increments the version. Rows from an older version stay valid records of that version. Rows from the new version replace them when the analysis prefers current output.

An investigation may use rows from more than one extractor version. Each row must record its version. After an update, the practitioner may recompute the affected signals or keep the prior rows. The practitioner chooses. The method requires only that the choice is recorded.

The reference implementation stores extractor versions in the schema. It refuses to replace a row from a different version without an explicit operation. That rule blocks a silent update.

### 6.1.3 No LLM at this layer

The ban on LLM calls at extraction is a structural rule. It is not an implementation detail. Section 7 uses an LLM and is non-deterministic. This layer is deterministic. A mix of the two would defeat the evidentiary posture in §3.

The ban has practical effects. Some signals would be better with an LLM. The method computes them in a simpler way so the result stays deterministic. Topic groups are one example. An LLM could name topics. The method uses TF-IDF clustering instead.

The method accepts lower extraction quality here. It recovers reasoning quality in §7. There the LLM reads the deterministic signals. It does not sit inside them.

## 6.2 Extractor specifications

This subsection states the extraction rule for each signal category. Where the algorithm affects reproducibility or signal quality, the method names the algorithm. Where the choice is incidental, the method states the result. The practitioner chooses the implementation.

### 6.2.1 Account metadata extractors

The signals in §4.1 come from account profile data in the archive. Extraction is mechanical. Each signal maps to one field in the platform profile. The extractor reads the field and writes a row.

For creation-date clustering (§4.1.1), the extractor computes pairwise time deltas for every creation timestamp in the seed set. It writes one row per pair. Clustering happens in the reasoning layer. The extractor produces only the deltas.

For display names and handles (§4.1.2), the extractor computes pairwise edit distance with the Levenshtein algorithm at character level. The method requires Levenshtein. Many implementations share it, and the results stay consistent. A practitioner who uses another metric must document the choice. The reasoning layer is calibrated to Levenshtein output.

For bio template matching (§4.1.3), the extractor parses bios into typed slots. A regex slot identifier does this work. The method specifies that identifier as a configuration file. The default slot set is conventional. It covers location, occupation, identifier tokens, and link patterns. The reference implementation publishes that default.

A practitioner may extend the slot set. The extractor version increments when they do. A later reader can see that the slot set was non-standard.

The other metadata signals are verification status, profile customization, and stated location. The extractor reads those fields directly. No algorithm specification is required.

### 6.2.2 Temporal extractors

The signals in §4.2 require post timestamps and distributional statistics.

For posting-cadence correlation (§4.2.1), the extractor bins posts by hour of day and day of week for each account. The result is a 168-bin distribution. That is 24 hours times 7 days. Pairwise comparison uses Jensen-Shannon divergence. The method names that metric because it is bounded and symmetric. In the base-two form the output runs from zero to one.

The extractor writes the per-account distribution and the pairwise divergences.

For response-latency correlation (§4.2.2), the extractor needs triggering-event annotations. The practitioner names those events during investigation setup. An event may be a post, a news event, or an external action. For each event and each account, the extractor computes the time from the event to the first related engagement. First engagement is the earliest post by that account that the extractor can link to the event. The link may be a URL, a hashtag, a named reference, or amplification of a related post.

The extractor writes per-event latencies and per-account latency distributions.

For active-hour distribution (§4.2.3), the extractor produces a 24-bin distribution per account. It then computes pairwise Jensen-Shannon divergences. Timezone normalization uses the platform timezone when the platform exposes it. Otherwise the extractor uses UTC. A practitioner who works across timezones must document the choice.

For quiet-period correlation (§4.2.4), the extractor finds silence longer than a configurable threshold. The default is 24 hours. It writes overlap statistics for pairs. The signal table records the threshold.

For burst correlation (§4.2.5), the extractor finds bursts above a configurable threshold. The threshold is a count of standard deviations above the account baseline rate. The default is 2 standard deviations on a 14-day rolling baseline. The signal table records burst-overlap statistics per pair and the threshold parameters.

### 6.2.3 Linguistic extractors

Linguistic extraction is the most prescriptive category. Prior literature gives clear guidance. A different algorithm produces a different result.

The reference implementation records all §4.3 features under the category name `stylometric`. That name matches §4.3.1 and the validation rules in §7.3.1. Paper text uses linguistic for the taxonomy category. Implementation output and prompts use `stylometric` for the same category.

For stylometric markers (§4.3.1), the method specifies Burrows' Delta as the baseline distance. The implementation follows Burrows (2002). It computes the frequency of each function word per account. It computes z-scores against all accounts in the seed set. It then computes the mean absolute difference of z-scores between account pairs. The function-word list is the 150 most frequent words in the corpus language.

The practitioner takes that list from a reference corpus for the language. The Corpus of Contemporary American English is a defensible default for English.

The count of 150 words is the default. It is not load-bearing. The literature supports counts from 50 to 500. The practitioner may change the count. The signal table records the choice.

The extractor also computes three more distributions per account. They are sentence length in tokens, punctuation rate per token, and the share of words capitalized outside a sentence start. Each is stored as a per-account distribution. Pairwise distance uses the same Jensen-Shannon divergence as the temporal signals.

For topic vocabulary overlap (§4.3.2), the extractor computes TF-IDF per account against a background corpus. The practitioner supplies that corpus. The reference implementation does not ship one. The practitioner uploads `application/x-background-corpus` on a control seed. See `docs/BACKGROUND-CORPUS.md` and `paper/ERRATA.md`. Without that artifact the signal stays dormant.

The extractor takes the top N distinctive terms per account. The default is N = 100. It computes pairwise weighted overlap with term-rarity weights. Higher overlap on rarer terms is a stronger signal.

For idiosyncratic phrase reuse (§4.3.3), the extractor computes n-grams from 3-grams through 7-grams per account. It weights novelty against the same background corpus. The n-gram weight uses TF-IDF in the same way as topic overlap, applied to n-gram frequency. The extractor lists n-grams that are rare in the background and that appear in more than one seed account. Rank uses rarity and seed-set frequency together. Without the background artifact this signal also stays dormant.

For code-switching (§4.3.4) and typo patterns (§4.3.5), the extractor uses auxiliary tools. A language detector supports code-switching. A rule-based matcher supports typo categories. The method does not name the tool. The signal table must record the tool version and the configuration.

### 6.2.4 Network extractors

Network extraction reads follower data and engagement data from the archive.

For follower overlap (§4.4.1), the extractor computes pairwise Jaccard similarity of follower sets. The method requires a community baseline. The same Jaccard computation runs on pairs of control accounts in the seed set (§5.1.4). The extractor reports raw similarity and normalized similarity. Normalized similarity is the raw value minus the baseline mean, divided by the baseline standard deviation. The signal table records both values.

For mutual-follow patterns (§4.4.2), the extractor finds seed accounts that follow each other. It records when the mutual relation started. That time is the later of the two follow timestamps. The signal table records mutual status and timing for each pair.

For co-engagement timing (§4.4.3), the extractor finds posts that two or more seed accounts engaged. It computes pairwise time deltas. The signal table records the distribution of those deltas for each pair.

For cross-account amplification (§4.4.4), the extractor computes one fraction per account. The fraction is amplification that comes from other seed accounts. Amplification means likes, reposts, and quote-posts received. The same fraction for control accounts is the normalizer.

### 6.2.5 Visual extractors

Visual extraction uses perceptual-hash libraries and image tools.

For perceptual hashing (§4.5.1 through §4.5.3), the method requires at least two hash families. The reference implementation uses pHash and dHash. pHash uses a discrete cosine transform. dHash is a difference hash. Two families reduce a blind spot in one family. An edit that defeats pHash may not defeat dHash.

The reverse is also true. The signal table records both hashes and the pairwise Hamming distances.

For image source tracing (§4.5.4), reverse image search changes between runs. The extractor does not run that search. The practitioner runs the search by hand and records the source class in the manifest. The classes are stock, celebrity, scraped, AI-generated, and original. The extractor reads that field.

For AI-generated face detection (§4.5.5), the method applies a detector library. Different detectors disagree on edge cases. One detector at one version has a deterministic output. The signal table records the detector name, the version, and the output for each profile image. Section 6.4.6 states that v1 has no Workers-hosted detector.

For color palette overlap (§4.5.6), the collection layer stores per-account quantized RGB histograms in a corpus artifact. The account extractor computes histogram bins, top-color summaries, and image counts. The pair extractor computes Jensen-Shannon divergence, cosine similarity, and top-color Jaccard on aligned histograms. See §6.4.6 for availability in v1.

### 6.2.6 Cross-platform extractors

Cross-platform extraction reads artifacts from more than one platform.

For handle reuse (§4.6.1), the extractor matches handles by exact string and by near-exact string. The method names a small set of variant rules. The rules are a numeric suffix, an inserted underscore, an inserted dot, and a year suffix. The extractor computes a match score for each pair. The signal table records the score and the rule with the highest score.

For bio link patterns (§4.6.2) and external link overlap (§4.6.3), the extractor normalizes URLs. It resolves redirects and removes tracking parameters. It then computes pairwise overlap with rarity weights. Per-account URL lists use the category `content_artifacts`. The feature names are `posted_urls` and `posted_urls_unique_count`. Pair-level Jaccard overlap uses the category `cross_platform`.

For cross-platform timing (§4.6.4), the extractor follows §6.2.2 across platforms. The signal table records the cross-platform timing distributions.

### 6.2.7 Metadata-leakage extractors

This extractor parses technical metadata from collected artifacts.

For EXIF data (§4.7.1), the extractor uses a standard EXIF library. exiftool is the practitioner standard. It reads metadata from image files in the archive. The signal table records EXIF fields per image and pairwise consistency.

For timezone leakage (§4.7.2), the extractor reads timezone fields when the platform exposes them. The signal table records timezone offsets per account and their consistency.

For client fingerprints (§4.7.3), the extractor reads the client field from platform post metadata. It records the client distribution per account. The signal table records pairwise similarity of those distributions.

For shortener fingerprints (§4.7.4) and share-card metadata (§4.7.5), the extractor names the shorteners and the embed sources. It records their distributions.

## 6.3 Signal table schema

The signal table is the structured output of every feature extractor. A practitioner can query it in SQL or an equivalent language. Each row records the extractor version. Rows are append-only. A written row is not changed.

The schema has three primary tables. The reference implementation uses MySQL through Cloudflare Hyperdrive. Another implementation may use any relational store.

### 6.3.1 Per-account features

The `account_features` table records features for one account. Each row records these fields.

- Investigation identifier
- Account identifier, a handle or a platform-internal identifier
- Feature identifier, the extractor that produced the feature
- Extractor version
- Feature value, as a number, a string, a JSON distribution, or a blob
- Collection timestamp range for the feature
- Computation timestamp
- Provenance hash of the archived artifacts that contributed

The provenance hash is the reproducibility check at this layer. A practitioner with one row and the archive can confirm the same artifacts. The practitioner can then recompute the feature.

### 6.3.2 Per-pair features

The `pair_features` table records features for two accounts. The schema matches `account_features`, with two account identifiers on each row. Pair features are symmetric. If the two identifiers swap, the row stays equivalent. The reference implementation enforces a canonical identifier order.

### 6.3.3 Per-event features

The `event_features` table records features for specific events. Examples are a triggering event, a burst window, and a deletion found on re-collection. Each row records the event identifier, the account or the pair, and the standard provenance fields.

### 6.3.4 Schema versioning

The schema has a version. The reference implementation includes migrations between versions. A signal table from an older schema stays readable. Re-extraction is not required after a schema update unless an old extractor used a removed element.

The schema version and the extractor versions form the reproducibility envelope. Another practitioner can reproduce an investigation under schema X and extractor versions Y1 through Yn. That practitioner applies the same schema and the same versions to the original archive.

## 6.4 Edge cases and known failure modes

Extractors compute signals. They do not interpret signals. An edge case that would confuse §7 is flagged here. Section 7 can then handle it.

### 6.4.1 Insufficient data

Some signals need a minimum amount of input. A stylometric signal needs thousands of words per account. A temporal signal needs dozens to hundreds of posts across weeks. A network signal needs at least one follower-list collection per account.

Each signal table row has a confidence flag. The flag states whether the input supports a meaningful signal. The reference implementation uses three levels.

- Sufficient means the signal is computed in the normal way.
- Marginal means the signal is computed, and the data is at the lower bound of reliability.
- Insufficient means the signal cannot be computed with reliability. The extractor writes a placeholder row and sets the flag.

Section 7 uses the flag to weight signals. An insufficient signal is not used for attribution. A marginal signal is used at a discount.

### 6.4.2 Bilingual or multilingual accounts

An account that posts in more than one language produces stylometric signals that do not compare across languages. The English function-word distribution differs from the Spanish distribution. Burrows' Delta on a mixed-language corpus is noisy.

A linguistic extractor classifies each post by language. It computes a signal per language, or it limits the computation to the dominant language. The reference implementation uses the dominant language by default. It records that language for each account. A practitioner with a multilingual network should consider the per-language approach.

### 6.4.3 Account-sharing within real communities

Some accounts have more than one legitimate user. Examples are a married couple, an organization, a public-relations firm, and a volunteer community account. These accounts show high stylometric variance inside the account. That pattern can look like a sockpuppet. It is not coordinated inauthentic behavior.

The extractor cannot separate these cases from sockpuppet activity. It flags an account whose internal variance is high for its length. Section 7 must treat account sharing as one alternative explanation.

### 6.4.4 Accounts that change behavior over time

An account may change over time. A life event, a new profession, a community change, or ordinary maturity can change the stylometric pattern and the temporal pattern.

An extractor computes signals on the full collection window by default. When enough data exists, it also computes signals on the most recent third of the window. The signal table records both. The reasoning layer can see when the recent window differs from the full history.

### 6.4.5 Deleted content discovered during re-collection

Re-collection (§5.5) may find that earlier content is now absent. A signal from the earlier collection stays valid. The archive keeps the deleted content. A signal from the later collection uses only content that is still present. The signal table records the collection window for each signal. The reasoning layer can see which version of the network each signal used.

### 6.4.6 Reference implementation v1 signal availability

Extractors for the full §4 list are present. Not every signal is filled on every ingest path. The table states the result of a standard Apify Twitter ingest with no extra configuration.

Other Apify exports use `POST /ingest/apify` plus a platform path. The paths are `/apify-instagram`, `/apify-reddit`, `/apify-bluesky`, `/apify-mastodon`, `/apify-tiktok`, `/apify-youtube`, and `/apify-facebook`. Those paths fill the parallel stylometric features and the parallel temporal features. Reddit also fills account metadata and subreddit overlap. The shared pair extractors run on those paths. Network, visual, and metadata-leakage signals that exist only for Twitter stay dormant there.

Mastodon ingest resolves through `mastodon.social`, or through an acct hint, an instance hint, or a tool hint. It does not resolve every federated host. YouTube text is titles, descriptions, and comments. It is not a tweet-like timeline. Facebook ingest is public-page posts only. It does not collect cookies, personal profiles, likes, friends lists, or emails.

LinkedIn, Telegram, and Discord stay `400 unsupported_export`.

The table below is the availability record. Its cell text is unchanged from v1.0.

| Signal | Paper | v1 default ingest | Notes |
|--------|-------|-------------------|-------|
| §4.1, §4.2.1, §4.2.3-§4.2.5, §4.3, §4.5.1-§4.5.3, §4.6, §4.7 (partial) | Active | Timeline and profile artifacts drive account and pair features. Visual overlap uses both dHash and pHash (§6.2.5). |
| §4.4.1-§4.4.2 | Active when follower/following lists are in the ingest payload | Skipped when network lists are absent. |
| §4.4.3-§4.4.4 | Active when ≥2 accounts ingested | Engagement events are derived from reply, repost, and quote posts in per-account timeline artifacts. Likes and other non-authored engagements are not collected in v1. §4.4.4 emits control-account baseline mean/stdev and fraction z-scores when `is_control` seeds exist and baseline stdev > 0. |
| §4.2.2 response latency | **Configured** | Extractors run when the practitioner populates `triggering_events` via `PATCH /investigations/:id/metadata` or the web UI. Default investigations without triggering events produce no response-latency rows. |
| §4.5.6 color palette | **Active** | Default Twitter ingest builds `application/x-color-palette-corpus` artifacts when posted images decode; account and pair extractors run on the corpus. |
| §4.6.3 posted URLs | Active | Emitted as `content_artifacts` account features; pair overlap under `cross_platform`. |
| §4.5.4 image source_class | Active when labeled | Practitioner sets `platformMetadata.source_class`; account + pair visual features. |
| §6.2.3 sentence / punctuation / capitalization JSD | **Active** | Account extractors emit `sentence_length_distribution`, `punctuation_distribution`, and `capitalization_distribution`; pair extractors emit `jsd_sentence_length`, `jsd_punctuation`, and `jsd_capitalization` when both sides have the distributions. |
| §4.7.4 link shortener fingerprints | Active | Account `shortener_*` features emitted with posted URLs; pair overlap under `metadata_leakage`. |
| §4.3.4 code-switching / register | **Active** | Twitter timeline ingest runs `code_switching_twitter` (rule-based register + script/stopword code-switch classifiers). Pair features: `jsd_register`, switch-rate abs diffs, optional `jsd_code_switch_pattern`. |
| §4.3.5 typo / error patterns | **Active** | Twitter timeline ingest runs `typo_error_twitter` (rule-based hard-error taxonomy + confusion-form fingerprints). Pair: `typo_error_rate_abs_diff`, optional `jsd_typo_error` / `jsd_confusion_form`. FP modes: shared autocorrect / L1 transfer (paper §4.3.5). |
| §4.3.2-3 background TF-IDF / novelty n-grams | **Active when configured** | Upload `application/x-background-corpus` on a control seed (`docs/BACKGROUND-CORPUS.md`). Seeds emit `account_term_tf` / `account_ngram_tf`; pair extractor emits background-weighted term and novelty n-gram overlap. Dormant without a background artifact. |
| §6.2.5 dual hash families | Active | Collection emits dHash and pHash; profile/banner/posted pair extractors compare both families. |
| §6.2.6 rarity-weighted bio/URL overlap | Active | Bio-link, bio-text, and posted-URL pair extractors emit rarity-weighted Jaccard from investigation corpus DF. |
| §4.5.5 AI-generated face detection | **Deferred** | No Workers-hosted detector in v1; practitioners may set `source_class` at collection (#148). See issue #147. |
| §4.1.6 stated location geocoding | **Active** | Offline bundled city table (`docs/GEOCODING.md`); account `location_lat` / `location_lon` when matched; pair `location_geo_distance_km` and `location_geo_near_match` when both accounts geocode. |
| §5.5 re-collection / tombstones | **Active on re-ingest** | Second and later timeline ingests diff against the prior present collection; manifest tombstones and `tweet_deletion` event_features for absent tweets. Engagement extractors use the latest timeline per account and stamp `collection_window` on events (§6.4.5). |

A practitioner who audits an investigation treats the signal table as authoritative. A §4 category absent from the table for one run was not collected, was not configured, or did not apply to that payload.

## 6.5 Performance considerations

Feature extraction must be practical on practitioner hardware for a typical investigation. The reference implementation targets a seed set of up to 50 accounts on a laptop. Runtime is minutes to one hour. It depends on the data volume per account.

Pairwise work scales as O(N^2) with the size of the seed set. Fifty accounts give 1,225 pairs. That size is comfortable. Five hundred accounts give about 125,000 pairs. That size needs batching or a longer run. The method sets no hard upper bound.

Pairwise work dominates at large N.

The reference implementation caches intermediate results. Examples are function-word vectors, follower sets, and link corpora. After a change to the seed set, recomputation is incremental. Cache invalidation is conservative. A change to the archive or to an extractor version clears the cache.

## Closing

Feature extraction is the concrete form of the reproducibility rule. Each attribution claim traces to signals. Each signal traces to a computation in this section. Each computation traces to archived artifacts from §5. The chain holds because each link can be audited.

Section 7 is attribution reasoning. An LLM reads the deterministic signals from this section. It writes qualitative claims at the bands in §3.2. That layer is the most distinctive part of the method. It is also the most ethically charged part. The discipline in §6 makes that layer trustworthy at the level the method requires.

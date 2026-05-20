# 7. Attribution reasoning

This section specifies the layer that consumes the signal table produced by §6 and produces attribution claims at the confidence bands defined in §3.2. It is the methodology's most distinctive component and its most ethically charged. The discipline of the reasoning layer rests on architectural constraints, not on the capability of the underlying model: the methodology requires the model to operate within structural rules that make its output trustworthy at the level the methodology promises, regardless of which specific model is used at any given time.

The section addresses why LLM-assisted reasoning is the right tool for this layer (§7.1), the required citation discipline that prevents unsupported claims (§7.2), the confidence threshold and declination rules (§7.3), prompt design considerations including versioning (§7.4), model selection (§7.5), and known bias and failure modes (§7.6).

## 7.1 Why LLM-assisted reasoning

The synthesis problem at the attribution layer is qualitative. A signal table for a small investigation contains hundreds to thousands of feature rows across the eight signal categories, with each row characterized by a value, a confidence flag, and provenance metadata. The reasoning task is to characterize whether the pattern across all those rows is consistent with a common operator for any subset of the seed accounts, and to articulate the reasoning in a form a human reader can evaluate.

This task is not well suited to classifiers. A supervised classifier would require labeled training data of sockpuppet networks versus organic communities, which exists only in limited quantities and at uncertain quality. A classifier trained on the limited labeled data available would generalize poorly to the diverse network structures that the methodology must handle. A classifier's output would be a probability score, which the methodology has already rejected as a target output for reasons developed in §3.2.1. Most importantly, a classifier would not produce explanations: a practitioner who needs to defend an attribution claim in adversarial settings cannot do so by pointing to a black-box probability score.

The task is also not well suited to rule-based reasoning. The combinatorial space of signal patterns is too large for hand-written rules to cover, and any specific rule set would encode the methodology author's assumptions about what attribution patterns look like, biasing the methodology toward those patterns and away from genuine variation in the underlying networks. Rule-based systems produce brittle output: a network whose signals fail a single rule by a small margin is classified as inconsistent, while a network that passes all rules by small margins is classified as consistent, with no graduation between.

LLM-assisted reasoning fits the task because it handles qualitative synthesis across heterogeneous inputs, produces natural-language explanations that practitioners can evaluate and challenge, accepts graduated confidence in its outputs when prompted appropriately, and can be operated under architectural constraints that prevent the failure modes that would otherwise make it untrustworthy.

The methodology does not assume that the underlying model is "intelligent" or "good at reasoning" in any absolute sense. It assumes that the model is capable of writing structured output that respects formal constraints, that the model can follow citation requirements when those requirements are part of the prompt, and that the output is amenable to validation against the signal table. These are mechanical properties, and the methodology relies on them rather than on more elevated claims about model capability.

## 7.2 Required signal citations

The reasoning layer's most important discipline is that every substantive claim in the output must cite specific rows from the signal table. Outputs that fail this requirement are rejected and not surfaced to the practitioner.

### 7.2.1 What citation means

A claim in an attribution output is any factual statement about the network being investigated. Statements like "accounts A and B show consistent posting cadence" are claims; statements like "the data shows that A and B may be coordinated" are claims; statements like "the operator appears to be active during weekday afternoons" are claims.

The citation requirement is that every claim is annotated with the signal-table row or rows that support it. Annotations identify the row by primary key (the investigation identifier, the feature identifier, and the account or pair identifiers), so a reader can look up the cited row, read its value and provenance metadata, and verify that the row supports the claim.

A claim without citation is rejected. A claim with citation to a row that does not support it is also rejected, but this requires automated validation rather than just format validation.

### 7.2.2 Output validation

The reference implementation validates reasoning outputs against the signal table before surfacing them to the practitioner. The validation has two layers.

The first layer is format validation: every claim has a citation, every citation points to a row that exists in the signal table for the current investigation. This is mechanical and catches the most common failure mode (the model fabricating row identifiers).

The second layer is content validation: the cited row's value is consistent with the claim being made. This validation is currently limited (the reference implementation can check simple consistency like "the claim says posting cadence is similar; the cited row has a similarity value above the threshold") and does not catch all cases of misleading citation. Where content validation fails, the output is rejected. Where content validation passes but the relationship is subtle (the model cites a row to support a claim that the row does not directly support but is rhetorically related to), the output may pass validation but be subject to later challenge.

The methodology accepts that content validation is incomplete. The mitigation is that incomplete validation is still better than no validation, and the bias the validation introduces (rejecting clearly unsupported claims) is in the direction the methodology wants.

### 7.2.3 Retries and declination

When an output fails validation, the methodology specifies that the reasoning is retried with the same inputs and an explicit prompt addition that points out which claims failed validation. The reference implementation retries up to three times before giving up.

If all retries fail validation, the methodology returns "insufficient evidence for attribution" rather than surfacing the failed outputs. Returning insufficient evidence in this case is honest: the reasoning layer was unable to produce a validated claim, and the methodology cannot manufacture one.

This is one of the methodology's hallucination mitigations. The model is given multiple opportunities to produce a valid output, but failure to do so results in declination rather than degradation of the methodology's standards.

## 7.3 Confidence thresholds and declination

The confidence bands defined in §3.2.1 (insufficient, consistent, strongly consistent) are mapped to signal patterns by specifications that the methodology states explicitly and the reasoning layer applies.

### 7.3.1 Mapping rules

The mapping rules are deliberately conservative. They are designed to err in the direction of declination: it is better for the methodology to declare insufficient evidence when the signals are ambiguous than to attribute on weak evidence.

**Strongly consistent with common operator** requires:

- Signals from at least four of the seven non-excluded categories from §4 (metadata, temporal, linguistic, network, visual, cross-platform, metadata leakage) show patterns consistent with a common operator
- At least one of the signals is from §4.3 (linguistic) or §4.4 (network), the two categories with the strongest individual signal weight
- No signal in any category shows a pattern strongly inconsistent with a common operator (a single strongly inconsistent signal moves the attribution to consistent at best, not strongly consistent)
- The combined signal pattern is not better explained by an alternative explanation that the reasoning layer is required to articulate (see §7.4)
- The collection meets the requirements of §5 and the feature extraction confidence flags from §6.4.1 are predominantly sufficient

**Consistent with common operator** requires:

- Signals from at least three of the seven non-excluded categories show patterns consistent with a common operator
- The combined signal pattern is not better explained by an alternative explanation
- The collection meets the requirements of §5

**Insufficient evidence for attribution** is the default. The methodology returns this band when the higher bands are not reached.

### 7.3.2 The role of declination

Declination is not failure. It is the methodology working as designed. When the signals do not support an attribution claim, returning "insufficient evidence" is the correct output, and it is the output the methodology defaults to.

The reasoning layer is prompted to declination as the default behavior. The model is instructed that the prior for any pair of accounts is that they are not coordinated, that the signals must affirmatively support coordination to change the prior, and that the threshold for substantive attribution claims is high. This prompting is consistent with the methodology's ethical posture: in a domain where false attribution has serious consequences for misattributed parties, the methodology prefers false negatives to false positives.

### 7.3.3 Per-pair versus per-cluster confidence

Confidence bands apply to specific claims, not to the investigation as a whole. A single investigation may produce some pair-level claims at "strongly consistent" while other pairs in the same seed set are "insufficient." The output is a matrix of claims rather than a single conclusion about the network.

Cluster-level claims (multiple accounts operated by a common hand) are derived from pair-level claims by transitive composition. If A and B are strongly consistent, and B and C are strongly consistent, the cluster {A, B, C} is reported as consistent (not strongly consistent), because transitive composition weakens the claim relative to direct attribution. The reasoning layer is prompted to make this composition explicit and to report cluster-level confidence as a separate output from pair-level confidence.

## 7.4 Prompt design

The prompts used at the reasoning layer are part of the methodology, not an implementation detail. They are versioned, recorded in the output manifest, and published in Appendix B.

### 7.4.1 Structured input

The prompt presents the signal table to the model as structured input, not as natural-language summary. Each signal is presented with its identifier, its value, its confidence flag, and its provenance hash. The model is instructed to refer to signals by their identifiers when making claims.

The signal presentation order is randomized between runs. This is deliberate mitigation against anchoring: the model may attach disproportionate weight to signals presented first, and randomizing the order across runs averages this effect out across multiple runs of the same investigation. The randomization seed is recorded so the run is reproducible if the same seed is used.

The prompt also presents the investigation metadata: the basis statements from §5.1.1, the time bounds from §5.2.1, the seed set composition including any control accounts from §5.1.4. The model is instructed to take basis statements as factual context, not as conclusions to be confirmed.

### 7.4.2 Required output format

The required output is structured JSON with specific fields:

- `claims`: a list of attribution claims, each with a pair or cluster, a confidence band, and a citation list
- `alternative_explanations`: for each claim, a list of non-coordination explanations that could produce similar signal patterns, and a brief assessment of how the signals weigh for or against each alternative
- `declined_pairs`: a list of pairs for which the model declined to attribute, with brief notes on the reasons
- `methodology_metadata`: model identifier, model version, prompt version, randomization seed, run timestamp

The output validation in §7.2.2 operates on the structured JSON.

### 7.4.3 Alternative explanation requirement

The requirement that every attribution claim include alternative explanations is one of the methodology's confirmation-bias mitigations. The reasoning layer is not permitted to produce a clean attribution claim without acknowledging the patterns that could produce similar signals without coordination.

Alternative explanations the model is instructed to consider include shared editorial coordination among legitimate coauthors, niche community membership with shared interests and vocabulary, timezone or schedule clustering of unrelated accounts in a community, scheduled posting tools producing temporal patterns that mimic coordination, and AI-assisted writing flattening stylometric distinctions across unrelated accounts.

When the signals weigh against an alternative explanation, the model is instructed to identify which specific signals do that work. When the signals do not clearly weigh against an alternative explanation, the model is instructed to flag this in the output, and the confidence band is reduced accordingly.

### 7.4.4 Prompt versioning

Prompts are versioned and the version is recorded with every attribution run. When prompts are updated (new alternative explanations to consider, refined output format, improved instructions for handling specific signal categories), the version is incremented and prior outputs are not invalidated but are flagged as having used the prior prompt version.

Practitioners who want to compare attribution outputs across investigations conducted at different times should compare prompt versions and re-run earlier investigations against the current prompt version if comparability matters.

## 7.5 Model selection

The reasoning layer requires a model capable of structured output, citation-following, and qualitative synthesis at the level the methodology requires. The methodology specifies these capabilities in functional terms rather than naming a specific model, so the methodology can survive model changes by the provider and so practitioners can substitute alternative models where appropriate.

### 7.5.1 Capability requirements

The minimum capability requirements are:

- Reliable structured JSON output with the schema specified in §7.4.2
- Reliable citation of signal-table rows by identifier when prompted to do so
- Reasoning quality sufficient to consider alternative explanations in good faith rather than performing the consideration mechanically
- Output stability sufficient that repeated runs produce qualitatively similar outputs even when wording differs

Current frontier models from major providers meet these requirements. The methodology does not require a specific provider.

### 7.5.2 The triage-versus-reasoning split

Investigations of typical scope involve many pair-level reasoning runs. For 50 accounts, the methodology requires 1,225 pair-level reasoning operations to fully characterize the network. Running an expensive reasoning model for every pair is not necessary: most pairs are obviously not coordinated, and a cheaper model can correctly identify them as obvious before the expensive model is invoked.

The reference implementation uses a two-model architecture:

- A lower-cost triage model (Claude Haiku class) processes every pair and identifies pairs that are obviously not coordinated. These pairs receive an "insufficient" attribution without further reasoning.
- A higher-cost reasoning model (Claude Opus class) processes pairs that the triage model flags as potentially coordinated. These pairs receive the full attribution-reasoning treatment specified in §7.4.

The triage model's role is filtering, not attribution. It is not permitted to produce "consistent" or "strongly consistent" claims; its only outputs are "obviously not coordinated" (passes to insufficient without further reasoning) and "warrants further analysis" (passes to the reasoning model).

The split typically reduces the cost of an investigation by a substantial factor (often 5x to 10x for typical seed sets) while preserving the quality of reasoning on pairs where reasoning matters.

### 7.5.3 Provider configuration

The reference implementation uses Anthropic's Claude family via Cloudflare AI Gateway. The AI Gateway provides centralized rate limiting, request caching, and audit logging across model providers, which the methodology recommends for both cost management and auditability.

The methodology does not require Claude or Anthropic. Practitioners using other model providers should ensure that the alternative model meets the capability requirements in §7.5.1 and that audit logging captures the equivalent metadata.

### 7.5.4 Model version recording

The specific model identifier and version are recorded with every attribution run. When a provider updates a model, prior attribution runs become non-reproducible against the new model version (the methodology in §3.4.2 acknowledged this), but they remain documented as having used the prior version. Practitioners conducting longitudinal investigations should note when model versions change and consider whether to re-run earlier reasoning against the current model.

## 7.6 Bias and failure modes

The reasoning layer has known bias and failure modes that the methodology must acknowledge and mitigate where possible.

### 7.6.1 Hallucination

The primary hallucination risk is the model fabricating signal-table rows or misciting existing rows. The citation requirement and the output validation in §7.2 are the primary mitigations. The retry and declination rules in §7.2.3 prevent persistent hallucination from being surfaced to the practitioner.

A secondary hallucination risk is the model inventing alternative explanations that do not apply to the network being investigated. This is harder to validate mechanically. The mitigation is that alternative explanations are reviewed by the practitioner; the methodology does not treat them as factual claims about the network and the §8 evidence packet presents them as the reasoning layer's hypotheses rather than as established facts.

### 7.6.2 Anchoring

The model may attach disproportionate weight to the first signal it encounters or the most striking signal in the presentation. The mitigation is randomized signal presentation order (§7.4.1), which averages anchoring effects across multiple runs of the same investigation. Practitioners conducting high-stakes investigations should consider running attribution multiple times with different randomization seeds and comparing outputs.

### 7.6.3 Confirmation bias

The model may be primed by the basis statements (§5.1.1) to find coordination when the basis statement says it is suspected. The mitigations are the alternative-explanation requirement (§7.4.3), the inclusion of control accounts in the seed set (§5.1.4), and the model being instructed that basis statements are factual context rather than conclusions to be confirmed. None of these mitigations is fully effective: confirmation bias is the most difficult LLM bias to fully prevent in practice, and the methodology accepts that some residual confirmation bias remains in the output.

The practical implication is that practitioners using the methodology should not over-rely on cases where the reasoning layer confirms a strong prior. Cases where the reasoning layer overrides a strong prior (returning insufficient when the practitioner expected attribution) are more trustworthy than cases where it confirms.

### 7.6.4 False confidence

The model may produce attribution claims with confidence bands higher than the signals support. The mitigations are the coarse-band system (§3.2.1, only three bands available), the explicit mapping rules (§7.3.1), and the declination-as-default prompting (§7.3.2). The output validation in §7.2 catches the most egregious cases (claims at "strongly consistent" with insufficient signal support).

### 7.6.5 Cultural and linguistic bias

LLMs trained predominantly on English-language text apply stylometric reasoning to non-English text with less reliability than to English text. The methodology does not currently include calibration data for non-English investigations, and practitioners conducting non-English investigations should be aware that the reasoning layer's reliability is lower than in English.

The reference implementation flags non-English investigations and lowers the maximum achievable confidence band by one level (strongly consistent becomes consistent, consistent becomes insufficient) as a conservative measure. This is a coarse adjustment and may be too conservative or insufficiently conservative depending on the specific language and the investigation. Future work should produce per-language calibration data; the methodology in v1 does not have it.

### 7.6.6 Test-time leakage

The model may have seen content from the network being investigated in its training data. For widely discussed networks (high-profile disinformation operations, networks named in public reporting), this is plausible. The model's reasoning may be influenced by what it has learned about the network from public discussion rather than from the signal table alone.

The methodology cannot fully prevent this. The mitigations are the citation requirement (claims must cite signals, not external knowledge) and the prompt's explicit instruction that the model should reason only from the provided signal table. For sensitive investigations where leakage is a particular concern, practitioners may consider using models that explicitly do not train on user data and that have not been exposed to the network's content during pre-training.

## Closing

Attribution reasoning is the layer at which the methodology produces its substantive output. The discipline of the prior sections (collection in §5, feature extraction in §6) creates the conditions under which the reasoning layer can be trustworthy at the level the methodology promises. The discipline of this section (required citations, declination defaults, alternative explanations, structured output validation, coarse confidence bands) constrains the reasoning layer's output to the same level of trustworthiness.

The methodology's commitment is not that LLM-assisted reasoning is reliable in some general sense. It is that LLM-assisted reasoning, operated under the architectural constraints stated here, produces outputs that meet the evidentiary requirements of §3 and the ethical commitments of §1.4. Practitioners and reviewers can evaluate the methodology by evaluating whether the constraints are met, not by evaluating the underlying model's capabilities.

The next section (§8) specifies the output and reporting format: how attribution claims and their supporting signals are assembled into evidence packets that practitioners can use in their downstream work (court filings, journalistic publication, academic publication, internal investigation documentation), and what conventions govern publication of methodology outputs in adversarial contexts.

# 3. Evidentiary Framework

This section establishes the discipline that the rest of the methodology rests on. The signals in §4, the collection practices in §5, the feature extraction in §6, and the attribution reasoning in §7 all assume the framework below. Skip this section and the downstream sections lose their footing.

The framework rests on four commitments: that raw artifacts are archived immutably before any transformation, that attribution outputs are probabilistic claims rather than verdicts, that the methodology is honest about what it cannot do, and that anyone with access to the archived artifacts can reproduce the deterministic parts of the pipeline.

## 3.1 Chain of custody

The methodology is designed to be auditable end to end. Every claim in an attribution output traces back to a signal in the signal table; every signal in the signal table traces back to an artifact in the archive; every artifact in the archive is content-addressed by cryptographic hash. An auditor who is handed the archive can verify that the bytes are the bytes, recompute the signals from the bytes, and recompute the attribution from the signals.

This is not a theoretical commitment. It is the operational primitive that makes the methodology usable in adversarial settings, whether that means court filings, peer review, journalistic publication, or community fact-checking.

### 3.1.1 Immutable archival before any transformation

When the collection layer pulls an artifact from a platform, the bytes of that artifact are written to content-addressed storage before any normalization, parsing, deduplication, or analysis. The path of the artifact in the archive is derived from the SHA-256 hash of its bytes: `sha256/ab/cd/abcd…full-hash`. Two collections that produce identical bytes land at the same path; collections that differ by a single byte land at different paths.

The reason for this discipline is that any transformation, however benign, introduces an opportunity for inadvertent corruption or deliberate manipulation. Normalizing a JSON dump for readability rewrites whitespace and key ordering. Parsing HTML loses comments and CDATA sections. Even "neutral" steps like timezone normalization on timestamps lose information. The archive holds the bytes as the platform delivered them. Everything else is derived data, and derived data can be regenerated from the archive at any time. The archive itself cannot be regenerated; if it is lost, the investigation is lost.

In practice, the collection layer does two things in one atomic operation: it computes the hash of the incoming bytes, and it writes the bytes to the content-addressed path. If either step fails, the artifact is treated as not collected. Partial writes are not permitted in the archive. The reference implementation enforces this by writing to a temporary path, verifying the hash matches expected, and renaming to the final path only on success.

### 3.1.2 The manifest

The archive is paired with a manifest. Each entry in the manifest records the hash of an archived artifact, the source URL or identifier from which it was collected, the timestamp of collection in UTC, the collection method used (scraper name, version, configuration), and the investigation under which the artifact was collected.

The manifest is the index that makes the archive searchable. Looking up "everything collected for investigation X during time window T" returns a list of artifact hashes. Each hash resolves to a path in the archive.

The manifest format is specified in Appendix D. It is line-oriented JSON, one record per line, append-only. Mutations to existing records are not permitted; corrections take the form of new records that supersede prior records, with a reference to the superseded record's hash. This preserves the audit trail of corrections themselves.

### 3.1.3 Signing

The manifest can be signed. The reference implementation supports detached signatures using Ed25519 keypairs. The intent of signing is twofold: to establish that a manifest was created by a specific investigator at a specific time, and to detect tampering with the manifest after the fact.

Signing is recommended but not required by the methodology. It is required when the manifest will be relied on outside the original investigator's environment, including court filings, peer review submissions, and any publication that asks readers to trust the integrity of the underlying record. For private investigative work that will not be relied on externally, unsigned manifests are acceptable.

The methodology does not specify a key management or distribution protocol; that is the investigator's responsibility. The minimum bar is that the public key used to sign a manifest is itself published in a way that resists post hoc substitution.

### 3.1.4 Why this matters

The discipline above costs effort that an investigator working alone may be tempted to skip. The temptation is wrong. Three concrete reasons:

First, platforms delete content. Tweets are deleted by their authors. Accounts are suspended. Profile images are replaced. An investigation that depends on platform content remaining available is fragile. An investigation backed by an immutable archive is robust to deletion. The archive becomes the evidentiary record even when the platform's record is gone.

Second, investigations are adversarial. The operator of an attributed network has incentives to challenge the integrity of the evidence. An archive with computed hashes and a signed manifest is much harder to challenge than an investigator's word that "I saw this on the platform last Tuesday." The hashes either match the artifact bytes or they do not. There is no room for the operator to claim the investigator misremembered, misquoted, or fabricated.

Third, the investigator's own work is more useful when it is auditable. A second pair of eyes can confirm a signal extraction. A peer reviewer can replicate an analysis. A community can build on prior work. None of these are possible if the investigator's evidence consists of screenshots in a private folder and notes in a private document.

## 3.2 Burden of proof

The methodology produces attribution claims at calibrated confidence levels, not verdicts. The distinction is important and is enforced by the reference implementation's output format.

### 3.2.1 What the methodology outputs

A Common Thread attribution output is a statement of the form:

> The signals collected for accounts A and B are [insufficient | consistent | strongly consistent] with a common operator. The signals that bear most directly on this assessment are [signal IDs]. The signals that would weaken this assessment if present and absent that are not are [signal IDs].

The three confidence levels are deliberately coarse. The methodology rejects finer-grained probability claims (eg "73% likely") because such claims imply a calibration the methodology has not earned. The qualitative confidence band is the honest expression of what the signals support.

Below the "insufficient" threshold, the methodology declines to attribute. Declination is the correct output when signals do not support a claim. Declination is not failure; it is the methodology working.

### 3.2.2 What "strongly consistent" does not mean

"Strongly consistent with a common operator" is not "proven by Common Thread to be the same operator." Two operators in close communication, sharing a stylebook, working from the same media diet, can produce signal patterns that the methodology would characterize as strongly consistent. The methodology cannot distinguish "same operator" from "tightly coordinated coauthors writing in the same voice." The output is honest about this.

The narrative output is required to surface alternative explanations for the observed signals. If a signal pattern is consistent with same-operator and also consistent with editorial coordination by a team, the narrative says so. Practitioners who use the methodology in adversarial contexts will encounter the alternative explanations from their opposition; better to confront them in the output than to be surprised by them later.

### 3.2.3 Court use

Practitioners who intend to use Common Thread outputs in court filings need additional evidentiary predicates beyond what the methodology supplies. The methodology produces attribution claims at the cluster level: "the signals are consistent with these accounts being operated by a common hand." Identifying that hand as a specific natural person, and laying the foundation for admissibility under whatever evidentiary rules apply, is the practitioner's responsibility and is out of scope for this methodology.

For court use in jurisdictions that follow the Daubert standard or similar reliability-focused tests for expert testimony, the methodology's reproducibility and the published signal taxonomy are designed to support a reliability showing. The methodology is testable (anyone can replicate the deterministic parts), subject to peer review (this paper), has a known error mode (the declination threshold), and is published and openly available. These properties are necessary but not sufficient for admissibility. The sufficient predicates depend on the specific court, the specific case, and the specific objections raised.

Practitioners in court contexts should consult with counsel about admissibility before relying on Common Thread outputs in filings.

## 3.3 What the methodology cannot do

Honesty about limits is itself part of the methodology. A practitioner who treats Common Thread as a verdict machine will misuse it. A practitioner who understands its limits will use it well.

### 3.3.1 Cannot prove same-operator with certainty

The methodology produces probabilistic claims from public behavioral signals. Certainty is not available from this signal set. The signals that would establish certainty (platform-internal logs, device fingerprints, network telemetry) are not accessible to most investigators and would, if accessible, make the methodology unnecessary. The methodology is designed for the situation where certainty is not available and structured probabilistic reasoning is the best available substitute.

### 3.3.2 Cannot rule out same-operator from absence of signals

Two accounts may share an operator and produce signal patterns that the methodology characterizes as inconsistent. The operator may have deliberately varied behavior across accounts to defeat attribution. The operator may have changed behavior over time for reasons unrelated to evasion. The investigation may have collected too little material to surface signals that exist.

The methodology returns "insufficient" or "inconsistent" in these cases. Neither is a positive claim that the accounts have different operators. The honest output is that the signals do not support attribution; investigators who require a positive negative claim need other tools.

### 3.3.3 Cannot identify natural persons

The methodology attributes accounts to clusters. It does not identify the natural person behind a cluster. This is a deliberate exclusion, not an oversight.

The chain from "these accounts share an operator" to "that operator is John Smith" depends on offline investigation that is out of scope for the methodology and that has different ethical structure. The methodology refuses to support this chain because the abuse surface created by automating natural-person identification is much larger than the abuse surface of attribution alone. Practitioners who need natural-person identification should do that work using established offline investigative techniques, with the ethical considerations that come with that work, separate from the cluster attribution that Common Thread provides.

The reference implementation enforces this exclusion in its output format. Attribution outputs reference accounts by handle and clusters by opaque identifier. The methodology has no input for natural-person identifiers and no output that produces them.

### 3.3.4 Cannot detect adversarially adapted operators

Operators who read this paper, understand the methodology, and deliberately adapt their behavior to defeat the listed signals will be harder to detect than operators who have not adapted. This is the standard problem of any published security methodology. The mitigation is partial: many signals are difficult to vary while maintaining the operational utility of the account (eg, response latency to triggering events is hard to randomize without losing the ability to amplify content quickly), but no signal is completely immune to adaptation.

The methodology is honest that publication degrades its effectiveness against sophisticated operators. The argument for publishing anyway is that the cohort of operators in scope (small networks, coordinated harassment campaigns, pro se litigation contexts) overwhelmingly does not include the sophisticated end of the spectrum, and the practitioners served by publication are more numerous than the operators harmed by publication.

### 3.3.5 Cannot account for shared editors, ghostwriters, or accountsharing

Real communities share accounts. Married couples post from a shared account. PR firms post on behalf of clients. Volunteer-run nonprofits rotate authorship through a single account. Teenagers and parents share. The methodology cannot distinguish these legitimate cases from sockpuppetry.

The narrative output is required to flag these alternative explanations when the signal patterns are consistent with them. A practitioner using the methodology should treat "consistent with same operator" as compatible with "two coauthors with similar styles" and design the investigation accordingly.

## 3.4 Reproducibility

The methodology has two parts with different reproducibility properties. The deterministic part (collection, archival, feature extraction) is exactly reproducible: anyone running the same code against the same archived artifacts produces the same signal table. The non-deterministic part (LLMassisted attribution reasoning) is reproducible in method but not in exact wording: anyone running the same prompts against the same model versions against the same signal table will produce outputs that agree on the qualitative conclusion but may vary in their specific phrasing.

The methodology requires this distinction to be visible in published work. Signal tables are reproducible artifacts and can be published as such. Attribution narratives are not reproducible to the word; they should be published with the model identifier, the prompt version, and the date of generation, so that subsequent readers can rerun the reasoning step against the same inputs and compare outputs.

### 3.4.1 Deterministic feature extraction

Feature extractors are pure functions of the archived artifacts. They have no side effects beyond writing rows to the signal table, no network calls, no LLM calls, no nondeterministic libraries. Given the archive and the code, the signal table is determined.

This commitment has practical consequences for the reference implementation. Feature extraction code is held to a higher correctness standard than other parts of the pipeline. Changes to feature extractors are versioned; signal tables record the version of the extractor that produced each signal. An investigation that relied on extractor version 0.3.1 remains reproducible against the archived artifacts even after extractor version 0.4.0 is released.

### 3.4.2 Non-deterministic attribution reasoning

The attribution reasoning step uses a language model. Language model outputs vary across runs even with identical inputs, and they change as the underlying model is updated by the provider. The methodology accepts this and requires that the variance be documented.

Specifically, the methodology requires that published attribution outputs identify the model, the prompt version, and the date of the attribution run. Any reader who wants to assess whether the conclusion is robust can rerun the reasoning step against the same model and prompt, or against a different model with the same prompt, and compare. The signal table is the anchor; the narrative is one rendering of the signals among many possible renderings, and the methodology does not pretend otherwise.

The reference implementation logs all attribution runs to the manifest, with model identifier, prompt version, full prompt text (or hash thereof if the prompt is sensitive), and the resulting narrative. This makes the attribution step auditable even though it is not exactly reproducible.

### 3.4.3 What reproducibility buys

A skeptical reader of a Common Thread investigation can verify three things, in order of decreasing strength.

The artifact hashes either match the archive or they do not. This is a check that takes seconds and cannot be argued with.

The signal table either follows from the artifacts when the published feature extractors are run, or it does not. This check takes minutes and is also not subject to argument; either the code produces the table or it does not.

The attribution narrative either characterizes the signals in a manner that a different language model run on the same signal table would also produce, or it does not. This check is judgment-laden and not exactly reproducible, but it is constrained: the narrative cannot make claims that are absent from the signal table without the contradiction being immediately visible.

These three layers of reproducibility, in combination, are what make the methodology usable for purposes beyond the investigator's own conviction. Without them, the methodology would be one person's opinion about some accounts. With them, it is a structured argument that anyone can follow, verify in part, and challenge in specific.

## 3.5 Confidentiality of the analysis at rest

The framework at §3.1 governs the integrity of the record (what was collected, that it has not changed). It does not by itself govern the confidentiality of the analysis (who can read the conclusion). These are different properties. An investigation's raw artifacts are, by construction, public: they are posts collected from the public platform surface, and the methodology treats them as public data. The sensitive product of an investigation is not the posts but the analysis over them, above all the attribution conclusion, which links otherwise-separate public accounts to a common operator. A leak of that conclusion can harm the accounts named in it in ways that a leak of the underlying public posts does not.

The reference implementation therefore encrypts the analytic conclusion at rest under a key that only the investigation's own secret can derive. Each investigation is created with a single unguessable capability secret, returned once and never stored by the server (§3.1.3 records only a one-way hash of it for authorization). That same secret derives, by a separate key-derivation path, an encryption key that is held only in memory for the duration of a request that presents the secret and is never written to storage. The server retains only ciphertext and the authorization hash. Two consequences follow, and the methodology states both plainly rather than overclaiming:

- **A database compromise yields ciphertext, not conclusions.** An adversary who exfiltrates the stored data cannot read the encrypted analysis without a valid investigation secret, which the store does not contain.
- **The secret is the only key, so there is no recovery.** Losing the secret makes an encrypted investigation permanently unreadable. This is a deliberate design choice, not a defect; an operator who requires a recovery path must arrange escrow of the secret out of band and should understand that doing so weakens the "only the secret can decrypt" property accordingly.

The scheme is scoped honestly. It protects the analysis against exposure of data at rest. It does not defend against a compromise of the running service while a request holds the derived key in memory, and it does not conceal the structural facts that remain queryable by design: which public accounts an investigation examined, the coarse confidence band recorded for a pair, and timestamps. It also does not encrypt the public artifacts, whose value as verifiable evidence depends on the content-addressed, reproducible archival of §3.1 and §3.4, which this scheme leaves untouched. A practitioner who needs a stronger boundary than "protect the conclusion against a data-at-rest breach" should run the reference implementation on infrastructure they control and harden it to their own requirements.

At the level of the methodology, confidentiality of the analysis at rest is a requirement; the specific derivation, cipher, and scope above are the reference implementation's realization of it. Practitioners operating on other infrastructure should provide an equivalent property, or document its absence, with the same candor the framework demands elsewhere.

## Summary

The framework requires four commitments: content-addressed archival of raw artifacts before any transformation, calibrated probabilistic outputs rather than verdicts, honest acknowledgment of what the methodology cannot do, and reproducibility of the deterministic pipeline with documented non-determinism in the LLM-assisted layer. To these the reference implementation adds confidentiality of the analysis at rest (§3.5): the attribution conclusion is encrypted under a key only the investigation's own secret can derive, so a data-at-rest breach yields ciphertext rather than conclusions.

These commitments are not optional. The signal taxonomy in §4, the collection methodology in §5, the feature extraction in §6, the attribution reasoning in §7, and the output format in §8 all assume that the framework holds. Practitioners who skip the framework should not expect the downstream sections to produce reliable results.

The next section establishes the signal taxonomy. Each signal is presented with its detection capability, its known failure modes, its extraction method, and its position in the broader framework of evidentiary discipline established here.

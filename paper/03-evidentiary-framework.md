# 3. Evidentiary Framework

This section is the discipline for the rest of the method. §4, §5, §6, and §7 assume the rules below. If you skip this section, the later sections have no base.

The framework has four commitments:

- Archive the raw artifact before any transform, and do not change those bytes.
- The attribution output is a probabilistic claim, not a verdict.
- The method states what it cannot do.
- A person who has the archive can reproduce the deterministic parts of the pipeline.

## 3.1 Chain of custody

The method is auditable from the claim back to the bytes. Each claim cites a signal. Each signal comes from an artifact. The SHA-256 hash of the artifact bytes is the address of that artifact. An auditor who receives the archive can check the bytes, recompute the signals, and recompute the attribution from the signals.

This rule is operational. It is what makes the method usable in a court filing, in peer review, in a news report, or in a community check.

### 3.1.1 Immutable archival before any transformation

The collection layer writes the artifact bytes to content-addressed storage before normalization, parsing, deduplication, or analysis. The path comes from the SHA-256 hash of the bytes: `sha256/ab/cd/<full-hash>`. Identical bytes land at the same path. A difference of one byte lands at a different path.

Any transform can corrupt the record, even a benign one. A readable JSON rewrite changes whitespace and key order. HTML parsing drops comments. A timezone conversion drops information. The archive keeps the bytes the platform sent. Everything else is derived.

You can rebuild derived data from the archive. You cannot rebuild the archive. If the archive is lost, the investigation is lost.

The collection step must do two things, and both must succeed. It computes the hash of the incoming bytes. It writes those bytes to the content-addressed path. If either step fails, the artifact is not collected. A partial write is not an archived artifact.

The reference implementation does this with a conditional put on the final path (`onlyIf`). It does not write a temporary file and then rename it. See `paper/ERRATA.md`.

### 3.1.2 The manifest

The archive has a manifest. Each manifest entry records:

- The hash of one archived artifact.
- The source URL or identifier.
- The collection time in UTC.
- The collection method (collector name, version, and configuration).
- The investigation id.

The manifest is the index. A query for investigation X in time window T returns artifact hashes. Each hash resolves to a path.

The manifest is line-oriented JSON. One record is one line. The log is append-only. Do not change an existing record. A correction is a new record that supersedes the old record and cites the old hash. The correction history stays visible.

v1.0 called this format Appendix D. That file is not in this deposit.

### 3.1.3 Signing

The manifest can be signed. The reference implementation supports a detached Ed25519 signature. A signature shows that one investigator produced the manifest at one time. It also shows later tampering.

The method recommends a signature. The method requires a signature when someone outside the original environment will rely on the manifest. That includes a court filing, a peer-review submission, and a publication that asks the reader to trust the record. An unsigned manifest is acceptable for private work that no outside party will rely on.

The method does not specify key management or key distribution. That is the investigator's duty. The minimum is this: publish the public key in a way that resists a later substitution.

### 3.1.4 Why this matters

The rules above take effort. An investigator who works alone may want to skip them. Do not skip them. Three reasons follow.

Platforms delete content. Authors delete posts. Platforms suspend accounts. Profile images change. An investigation that needs the platform to keep the content is fragile. An immutable archive survives deletion.

The archive is the record after the platform record is gone.

Investigations are adversarial. The operator of an attributed network has a reason to attack the evidence. Hashes plus a signed manifest are harder to attack than the sentence "I saw this last Tuesday." The hash matches the bytes, or it does not. The operator cannot say the investigator misremembered, misquoted, or invented the artifact.

The investigator's own work is more useful when another person can audit it. A second reader can confirm an extraction. A reviewer can repeat an analysis. A community can build on the work. Screenshots in a private folder and notes in a private document do not support that.

## 3.2 Burden of proof

The method produces a claim at a calibrated confidence band. It does not produce a verdict. The reference implementation's output form keeps that distinction.

### 3.2.1 What the methodology outputs

A Common Thread output has this form:

> The signals for accounts A and B are [insufficient | consistent | strongly consistent] with one operator. The signals that bear most directly on this assessment are [signal ids]. The signals that are absent, and that would weaken this assessment if present, are [signal ids].

The three bands are coarse on purpose. The method rejects a fine probability, such as "73 percent." That number would imply a calibration the method has not earned. The band is the honest statement of what the signals support.

Below the insufficient threshold, the method declines to attribute. Declination is the correct output when the signals do not support a claim. Declination is not a failure. It is the method at work.

### 3.2.2 What "strongly consistent" does not mean

"Strongly consistent with one operator" does not mean "proved to be the same operator." Two operators in close contact can share a style guide and a media diet. Their signals can look strongly consistent. The method cannot separate "one operator" from "coauthors who write in one voice." The output says so.

The narrative must state alternative explanations. If a pattern fits one operator and also fits a team with an editorial plan, the narrative says both. In a dispute, the other party will raise the alternative. State it in the output.

### 3.2.3 Court use

A court filing needs predicates that this method does not supply. The method says the signals are consistent with one operator for a cluster. It does not name that operator as a natural person. Admissibility under the rules of that court is the practitioner's duty. It is out of scope here.

In a jurisdiction that uses the Daubert standard, or a similar reliability test, the reproducibility rules and the published signal list support a reliability showing. The deterministic parts are testable. This paper is the peer-reviewed description. The error mode is the declination threshold. The method is published. Those properties are necessary.

They are not sufficient. Sufficiency depends on the court, the case, and the objections.

Ask counsel about admissibility before you rely on a Common Thread output in a filing.

## 3.3 What the methodology cannot do

The limits are part of the method. A practitioner who treats Common Thread as a verdict machine will misuse it. A practitioner who knows the limits can use it well.

### 3.3.1 Cannot prove same-operator with certainty

The claims come from public behavioral signals. This signal set does not support certainty. The signals that would support certainty include platform-internal logs, device fingerprints, and network telemetry. Most investigators cannot get those signals. If they could, this method would be unnecessary. The method is for the case where certainty is unavailable and structured probabilistic reasoning is the best substitute.

### 3.3.2 Cannot rule out same-operator from absence of signals

Two accounts can share an operator and still show few of the listed signals. The operator may vary behavior across accounts to defeat attribution. The operator may change behavior for a reason other than evasion. The investigation may have too little material.

In these cases the output is insufficient. Insufficient is not a claim that the operators differ. Investigators who need a positive claim of different operators need another tool. v1.0 also said the output could be "inconsistent." That word is not a band. See `paper/ERRATA.md`.

### 3.3.3 Cannot identify natural persons

The method attributes accounts to clusters. It does not name the natural person behind a cluster. The exclusion is deliberate.

The step from "these accounts share an operator" to "that operator is a named person" is offline investigation. It is out of scope, and its ethics are different. The method refuses to automate that step. The abuse surface of automated naming is larger than the abuse surface of cluster attribution. Do naming, if you must, with established offline technique, and keep it separate from the cluster result.

Attribution outputs name accounts by handle. They name clusters by an opaque identifier. The method has no input field for a natural-person name and no output field that produces one. Free-text fields are not scanned for a personal name. See `paper/ERRATA.md`.

### 3.3.4 Cannot detect adversarially adapted operators

An operator who reads this paper and changes behavior to defeat the listed signals will be harder to detect. That is the usual cost of a published security method. The mitigation is partial. Many signals are hard to vary without a loss of operational use. Response latency to a triggering event is one example. No signal is immune.

Publication reduces effectiveness against a sophisticated operator. The argument for publication is this. The operators in scope are mostly small networks, harassment campaigns, and the networks that appear in pro se litigation. They are not the sophisticated end of the spectrum. The practitioners who gain from publication outnumber the operators who gain from reading it.

### 3.3.5 Cannot account for shared editors, ghostwriters, or accountsharing

Real communities share accounts. A married couple posts from one account. A PR firm posts for a client. A volunteer nonprofit rotates authors through one account. A teenager and a parent share an account. The method cannot separate these lawful cases from sockpuppetry.

The narrative must flag these alternatives when the signals fit them. Treat "consistent with one operator" as also compatible with "two coauthors with similar styles," and design the investigation for that possibility.

## 3.4 Reproducibility

The method has two parts, and they reproduce differently.

The deterministic part is collection, the archive, and feature extraction. The same code on the same archive produces the same signal table.

The other part is language-model attribution. The method is repeatable. The exact words are not. The same prompts, the same model versions, and the same signal table should agree on the qualitative conclusion. The sentences can differ.

Published work must show this distinction. A signal table is a reproducible artifact. An attribution narrative is not reproducible word for word. Publish the model id, the prompt version, and the run date. A later reader can run the reasoning step again and compare.

### 3.4.1 Deterministic feature extraction

An extractor is a pure function of the archived artifacts. It writes rows to the signal table. It does not call the network. It does not call a language model. It does not use a nondeterministic library. Given the archive and the code, the signal table is fixed.

The reference implementation holds extraction code to a higher correctness standard than the rest of the pipeline. Extractor changes are versioned. Each signal row records the extractor version. An investigation that used extractor version 0.3.1 stays reproducible after version 0.4.0 exists.

### 3.4.2 Non-deterministic attribution reasoning

The attribution step uses a language model. Outputs vary across runs with the same inputs. They also change when the provider updates the model. The method accepts that variance and requires a record of it.

A published attribution output must name the model, the prompt version, and the date of the run. A reader can repeat the step on the same model and prompt, or on another model with the same prompt, and compare. The signal table is the anchor. The narrative is one rendering of the signals. The method does not pretend otherwise.

The reference implementation logs each attribution run. The log has the model id and the prompt version. It has the full prompt text, or a hash of that text when the prompt is sensitive. It has the narrative. The step is auditable even though it is not exactly reproducible.

### 3.4.3 What reproducibility buys

A skeptical reader can check three things. The checks are in order from strongest to weakest.

The artifact hashes match the archive, or they do not. The check takes seconds. It is not arguable.

The published extractors produce the signal table from the artifacts, or they do not. The check takes minutes. It is not arguable.

The narrative characterizes the signals in a way that another model run on the same table would also produce, or it does not. This check needs judgment, and it is not exact. It is still constrained. A narrative claim that is absent from the signal table is immediately visible.

Together, the three checks make the method usable for more than the investigator's own belief. Without them, the method is one opinion about some accounts. With them, it is a structured argument that another person can follow, check in part, and challenge at a specific point.

## 3.5 Confidentiality of the analysis at rest

§3.1 governs integrity. It says what was collected, and that those bytes have not changed. It does not by itself govern confidentiality. Confidentiality is who can read the conclusion. The two properties differ.

The raw artifacts are public by construction. They are posts from the public platform surface. The sensitive product is the analysis, above all the attribution conclusion. That conclusion links separate public accounts to one operator. A leak of the conclusion can harm the named accounts in a way that a leak of the public posts does not.

The reference implementation therefore encrypts the conclusion and the structured inputs used to produce it. Those inputs are account feature values, pair feature values, event feature payloads, seed basis statements, and investigation metadata. The key comes from the investigation secret. Only that secret can derive the key.

Each investigation is created with one unguessable capability secret. The server returns the secret once. The server does not store the secret. §3.1.3's authorization record is a one-way hash of it. A separate derivation path turns the same secret into an encryption key. The key is in memory only while a request presents the secret.

The key is never written to storage. The server keeps ciphertext and the authorization hash.

Two consequences follow:

- A database compromise yields ciphertext. It does not yield the conclusion or a reconstructable signal table. The store does not contain the investigation secret.
- There is no recovery. Loss of the secret makes an encrypted investigation permanently unreadable. That is a design choice. An operator who needs recovery must escrow the secret out of band. Escrow weakens the property that only the secret can decrypt.

The scheme is limited. It protects the analysis and its structured inputs against exposure of data at rest. It does not defend a compromise of the running service while a request holds the derived key in memory. It does not hide structural facts that stay queryable on purpose. Those facts are which public accounts an investigation examined, the coarse confidence band for a pair, and timestamps. It does not encrypt the public artifacts.

Those artifacts stay content-addressed under §3.1 and §3.4.

A practitioner who needs a stronger boundary should run the reference implementation on infrastructure they control, and should harden it to their own requirements.

At the level of the method, confidentiality of the analysis at rest is a requirement. The derivation, the cipher, and the scope above are the reference implementation's realization. A practitioner on other infrastructure should provide an equivalent property, or should document its absence, with the same candor as the rest of this framework.

## Summary

The framework requires four commitments. Archive raw artifacts at a content address before any transform. Use a calibrated probabilistic output, not a verdict. State what the method cannot do. Reproduce the deterministic pipeline, and document the nondeterminism of the language-model layer.

The reference implementation adds §3.5. The conclusion and the structured inputs are encrypted under a key that only the investigation secret can derive. A data-at-rest breach yields ciphertext, not the conclusion and not a reconstructable signal table.

These commitments are not optional. §4, §5, §6, §7, and §8 assume that the framework holds. A practitioner who skips the framework should not expect reliable results from the later sections.

The next section is the signal list. Each signal has a detection capability, known failure modes, an extraction method, and a place in this framework.

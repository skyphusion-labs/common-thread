# 7. Attribution reasoning

This section consumes the signal table from §6 and produces claims at the bands in §3.2. It is the most distinctive part of the method, and the most ethically charged. The discipline is in the structural rules, not in a claim that one model is wise. The model must operate inside those rules. The rules hold for whichever model you use.

The subsections cover why a language model is the tool (§7.1), citations (§7.2), and bands and declination (§7.3). They cover prompts (§7.4), model selection (§7.5), and known failures (§7.6).

## 7.1 Why LLM-assisted reasoning

The synthesis task is qualitative. A small investigation can have hundreds or thousands of feature rows across the signal categories. Each row has a value, a confidence flag, and provenance. The task has two parts. Say whether the pattern, for any subset of the seed, is consistent with one operator. Write the reason in a form a person can check.

A classifier is a poor fit. A supervised classifier needs labeled sockpuppet networks and labeled organic communities. That data is scarce, and its quality is uncertain. A classifier trained on it will generalize poorly. Its output is a probability score, which §3.2.1 already rejects. It also does not explain the score.

You cannot defend a claim in a dispute by pointing at a black-box number.

Hand-written rules are also a poor fit. The space of signal patterns is too large. A fixed rule set would encode the author's assumptions and would miss real variation. A rule system is brittle. One network may miss one rule by a small margin. Another may pass every rule by a small margin.

Those networks get opposite labels. There is no step between the labels.

A language model fits the task when you constrain it. It can synthesize unlike inputs. It can write an explanation a person can challenge. It can use a graduated band when the prompt requires one. The method does not assume the model is intelligent in an absolute sense. It assumes three mechanical properties.

The model can write structured output. The model can follow a citation rule that is in the prompt. A validator can check the output against the signal table.

## 7.2 Required signal citations

Every substantive claim in the output must cite specific rows from the signal table. Reject an output that fails this rule. Do not show it to the practitioner.

### 7.2.1 What citation means

A claim is any factual statement about the network. "Accounts A and B show a consistent posting cadence" is a claim. "The data shows that A and B may be coordinated" is a claim. "The operator appears active on weekday afternoons" is a claim.

Annotate every claim with the row or rows that support it. Identify a row by its primary key: investigation id, feature id, and the account or pair ids. A reader can open the row, read the value and the provenance, and check that the row supports the claim.

Reject a claim with no citation. Also reject a claim whose cited row does not support it. The second check needs content validation, not only a format check.

### 7.2.2 Output validation

The reference implementation validates the output against the signal table before the practitioner sees it. Validation has two layers.

The format layer checks that every claim has a citation, and that every citation names a row that exists for this investigation. This catches the common failure, which is a fabricated row id.

The content layer checks that the cited value fits the claim. The check is limited. It can test a simple case, such as "the claim says the cadence is similar, and the cited similarity is above the threshold." It does not catch every misleading citation. Reject the output when the content check fails. A subtle or rhetorical citation can pass and still be open to a later challenge.

Incomplete validation is still better than no validation. The bias is in the direction the method wants. Clearly unsupported claims are rejected.

### 7.2.3 Retries and declination

When validation fails, run the reasoning again on the same inputs. Add a prompt note that names the claims that failed. If the allowed calls all fail, return "insufficient evidence for attribution." Do not show the failed outputs. The reasoning layer could not produce a validated claim, and the method will not manufacture one.

The reference implementation allows 3 calls in total. The first call counts as one of the three. v1.0 said "retries up to three times," which can be read as four calls. See `paper/ERRATA.md`.

This is one defense against hallucination. The model gets more than one chance. Failure still ends in declination, not in a weaker standard.

## 7.3 Confidence thresholds and declination

§3.2.1 defines the bands: insufficient, consistent, and strongly consistent. This subsection maps those bands to signal patterns. The reasoning layer applies the map.

### 7.3.1 Mapping rules

The map is conservative. Prefer insufficient when the signals are ambiguous. Do not attribute on weak evidence.

**Strongly consistent with one operator** requires all of the following:

- Signals from at least four of the seven categories in §4 show a pattern consistent with one operator. The categories are metadata, temporal, linguistic, network, visual, cross-platform, and metadata leakage.
- At least one of those signals is from §4.3 (linguistic) or §4.4 (network). Those two categories have the strongest individual weight. The reference implementation checks the category name `stylometric` for §4.3 (§6.2.3).
- No signal shows a pattern strongly against one operator. One such signal drops the band to consistent at best.
- An alternative explanation does not fit the combined pattern better. The reasoning layer must state that alternative (§7.4).
- Collection meets §5, and the confidence flags from §6.4.1 are mostly sufficient.

**Consistent with one operator** requires all of the following:

- Signals from at least three of the seven categories show a pattern consistent with one operator.
- An alternative explanation does not fit the combined pattern better.
- Collection meets §5.

**Insufficient evidence for attribution** is the default. Return this band when the higher bands are not reached.

### 7.3.2 The role of declination

Declination is not a failure. It is the method as designed. When the signals do not support a claim, "insufficient evidence" is the correct output, and it is the default.

Prompt the reasoning layer with that default. The prior for any pair is that the accounts are not coordinated. Signals must affirmatively support coordination before the prior changes. The threshold for a substantive claim is high. This matches the ethical position. A false attribution harms the misattributed party.

The method prefers a false negative to a false positive.

### 7.3.3 Per-pair versus per-cluster confidence

A band applies to a specific claim, not to the whole investigation. One investigation can have a pair at strongly consistent and another pair at insufficient. The output is a matrix of claims, not one conclusion about the network.

A cluster claim comes from pair claims by transitive composition. If A and B are strongly consistent, and B and C are strongly consistent, report the cluster {A, B, C} as consistent, not strongly consistent. Transitive composition weakens the claim relative to a direct pair. The reasoning layer must make the composition explicit, and it must report cluster confidence separately from pair confidence.

## 7.4 Prompt design

The prompts are part of the method, not an implementation detail. Version them, and record the version in the output. v1.0 said the prompts are published in Appendix B. That file is not in this deposit. Prompt versions are recorded in `docs/PROMPT-VERSIONS.md`.

### 7.4.1 Structured input

Give the model the signal table as structured input, not as a prose summary. Each signal has an identifier, a value, a confidence flag, and a provenance hash. Instruct the model to cite signals by identifier.

Randomize the signal order between runs. This limits anchoring. The model may weigh the first signal too heavily. A new order on each run averages that effect. Record the randomization seed so the same seed can repeat the run.

Also give the investigation metadata. Include the basis statements (§5.1.1), the time bounds (§5.2.1), and the seed, including control accounts (§5.1.4). Instruct the model to treat basis statements as factual context, not as conclusions to confirm.

### 7.4.2 Required output format

The required output is JSON with these fields:

- `claims`: a list of claims. Each claim has a pair or a cluster, a confidence band, and a citation list.
- `alternative_explanations`: for each claim, non-coordination explanations that could produce similar signals, and a short weighing of the signals for or against each alternative.
- `declined_pairs`: pairs the model declined, with a short reason.
- `methodology_metadata`: model id, model version, prompt version, randomization seed, and run timestamp.

The validation in §7.2.2 runs on this JSON.

### 7.4.3 Alternative explanation requirement

Every attribution claim must include alternative explanations. This limits confirmation bias. The reasoning layer may not produce a clean claim that ignores patterns which could arise without coordination.

Instruct the model to consider at least these alternatives:

- Lawful coauthors who share an editorial plan.
- Membership in a niche community with shared interests and vocabulary.
- Unrelated accounts in one community that share a timezone or a schedule.
- A scheduling tool that creates a temporal pattern which looks like coordination.
- AI-assisted writing that flattens style differences across unrelated accounts.

When signals weigh against an alternative, the model must name the signals that do that work. When the signals do not clearly weigh against an alternative, the model must say so, and the band is reduced.

### 7.4.4 Prompt versioning

Record the prompt version with every attribution run. When a prompt changes, increment the version. Do not invalidate an older output. Flag it as produced by the prior prompt version.

If you compare outputs from different times, compare the prompt versions. Re-run the earlier investigation on the current prompt when comparability matters.

## 7.5 Model selection

The reasoning layer needs structured output, citation following, and qualitative synthesis at the level this method requires. The requirements are functional. The method does not name one model. A provider can change a model, and a practitioner can substitute a model that meets the same requirements.

### 7.5.1 Capability requirements

The minimum requirements are:

- Reliable JSON in the schema of §7.4.2.
- Reliable citation of signal-table rows by identifier when the prompt requires it.
- Reasoning that considers alternatives in good faith, not only as a mechanical list.
- Output stability such that repeated runs agree on the qualitative result even when the words differ.

Current frontier models from major providers meet these requirements. The method does not require one provider.

### 7.5.2 The triage-versus-reasoning split

A typical investigation needs many pair runs. For 50 accounts, a full characterization needs 1,225 pair operations. An expensive model is not necessary for every pair. Most pairs are obviously not coordinated. A cheaper model can identify those pairs first.

The reference implementation uses two models:

- A lower-cost triage model (Claude Haiku class) sees every pair. Pairs that are obviously not coordinated receive insufficient, with no further reasoning.
- A higher-cost reasoning model (Claude Opus class) sees pairs that triage marks as possibly coordinated. Those pairs get the full treatment in §7.4.

Triage filters. It does not attribute. It must not emit consistent or strongly consistent. Its only outputs are "obviously not coordinated" and "warrants further analysis."

If the triage output cannot be parsed, send the pair to the reasoning model. Do not treat a parse failure as insufficient. v1.0 did not state this rule. The reference implementation does. See `paper/ERRATA.md`.

The split usually cuts the cost of an investigation by a large factor. For a typical seed the cut is often 5 to 10 times. Full reasoning still runs on the pairs that need it.

### 7.5.3 Provider configuration

The reference implementation calls Anthropic's Claude family through Cloudflare AI Gateway. The gateway provides rate limits, request caching, and an audit log across providers. The method recommends that for cost control and for audit.

The method does not require Claude or Anthropic. Another model must meet §7.5.1, and the audit log must capture the equivalent metadata.

The public docs also allow a direct call to `https://api.anthropic.com`. That host is a deployment choice. It is not a change to this section's model requirements.

### 7.5.4 Model version recording

Record the model id and version with every attribution run. When a provider updates a model, an older run is not reproducible on the new version (§3.4.2). The older run stays documented as the prior version. In a long investigation, note the version change, and consider a re-run of earlier reasoning on the current model.

## 7.6 Bias and failure modes

The reasoning layer has known biases. The method must name them and must mitigate them where it can.

### 7.6.1 Hallucination

The main risk is a fabricated row, or a citation of a real row that does not support the claim. §7.2 is the main mitigation. §7.2.3 stops a persistent hallucination from reaching the practitioner.

A second risk is an alternative explanation that does not apply to this network. That is harder to check by machine. The practitioner reviews the alternatives. The method does not treat them as facts. The §8 evidence packet presents them as hypotheses.

### 7.6.2 Anchoring

The model may weigh the first signal, or the most striking signal, too heavily. Random signal order (§7.4.1) averages that effect across runs. For a high-stakes investigation, run attribution more than once with different seeds, and compare the outputs.

### 7.6.3 Confirmation bias

A basis statement that says coordination is suspected can prime the model to find it. The mitigations are the alternative-explanation rule (§7.4.3) and control accounts (§5.1.4). A basis statement is context. It is not a conclusion. None of these is fully effective. Some residual confirmation bias remains.

Do not over-trust a result that only confirms a strong prior. A result that returns insufficient when you expected attribution is more trustworthy than a result that confirms the prior.

### 7.6.4 False confidence

The model may choose a band higher than the signals support. The mitigations are the three coarse bands (§3.2.1), the map in §7.3.1, and declination as the default (§7.3.2). Validation in §7.2 catches the worst cases, such as strongly consistent with too little support.

### 7.6.5 Cultural and linguistic bias

A model trained mostly on English text applies style reasoning to other languages with less reliability. v1 has no calibration data for non-English investigations. Treat the reasoning layer as less reliable outside English.

The reference implementation flags a non-English investigation and lowers the maximum band by one step. Strongly consistent becomes consistent. Consistent becomes insufficient. The adjustment is coarse. It may be too strong or too weak for a given language. Later work should produce per-language calibration.

v1 does not have it.

### 7.6.6 Test-time leakage

The model may have seen this network in its training data. That is plausible for a widely discussed network, such as a high-profile disinformation operation or a network named in public reporting. The model may then use public discussion, not only the signal table.

The method cannot fully prevent this. Claims must cite signals, not outside knowledge. The prompt says to reason only from the provided table. Where leakage is a serious concern, consider a model that does not train on user data. Also consider a model that was not exposed to the network's content in pre-training.

## Closing

Attribution is the layer that produces the substantive output. §5 and §6 create the conditions for a trustworthy result at the level this method promises. This section constrains the output with required citations, declination, alternative explanations, structured validation, and coarse bands.

The commitment is not that a language model is reliable in general. The commitment is that a language model, under the rules in this section, produces output that meets §3 and §1.4. Evaluate the method by whether those constraints are met, not by a general claim about the model.

§8 specifies the output. It says how claims and signals become an evidence packet. The contexts are a court filing, a news report, an academic paper, and an internal record. It also states the rules for publication in a dispute.

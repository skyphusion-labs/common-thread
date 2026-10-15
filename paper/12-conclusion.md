# 12. Conclusion

This paper specifies a method. The method attributes coordinated inauthentic behavior across accounts to one operator. It uses signals that a person can observe on the public platform surface.

The method has these parts:

- The record is immutable before any transform (§3).
- The output is a coarse confidence band, not a verdict (§3).
- The signal list covers metadata, time, language, network, images, cross-platform matches, and leaked metadata (§4).
- The signal list excludes signals that mainly detect lawful pseudonym use (§4).
- Collection requires a basis statement and control accounts (§5).
- Feature extraction is deterministic, and each extractor has a version (§6).
- The language-model step must cite signals and must state an alternative explanation (§7).
- The output form supports a court filing, a paper, or a news report (§8).

The ethical limits are in §1.4 and §10. The method does not name a natural person. The limits are in §11. Those limits include the missing empirical test, the language and culture limits, the platform assumptions, and the open problems.

The method does not do four jobs that nearby tools do:

- It does not name a natural person. A cluster is the limit.
- It does not find sockpuppets in the open from a seed of one or two accounts. The scope is a closed set.
- It does not detect automated accounts. Bot detection is a different job. Use a tool built for that job.
- It does not treat pseudonym use as the target. Lawful pseudonym use is a privacy practice. The method refuses to support an attack on that practice.

These exclusions are part of the method.

The reference implementation is at github.com/skyphusion-labs/common-thread under AGPL-3.0-only. This paper is CC-BY-4.0. Cite the paper as a published method. Do not treat it as private practice.

The open problems, the platform extensions, the per-language calibration, and the empirical test are work for later. v1 leaves that work to the community. The author does not promise unbounded maintenance. The audience has to sustain the work if the work is useful to them.

The method is for practitioners that current tools serve poorly:

- A pro se litigant who must document coordinated harassment.
- A small newsroom that cannot buy a commercial OSINT firm.
- A researcher who cannot get platform-internal data.
- A trust-and-safety team on a small platform.

Publication does not remove that gap. The paper offers one documented method, with explicit limits, in a field where closed methods have less public accountability.

A case is useful only when the practitioner follows the method. Use outside those limits is not this method, even if the labels match.

Publication has a cost for people the method cannot fully protect. It has a benefit for the practitioners above. §10.6 argues that the benefit is larger than the cost in total. A reader can reject that argument. The paper states the position so the disagreement is visible.

A practitioner who uses the method is responsible for that use. The text does not help or harm by itself. The application does. The paper records the discipline. The next use belongs to the practitioner.

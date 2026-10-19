# Errata

This note lists claims that v1.1 states differently from v1.0 (2026-08-13). Wording changes that keep the same claim are not listed. The paper text is not a silent edit of those claims. Section numbers are unchanged. The v1.2 section lists the claim that changed after v1.1.

The reference implementation was read at `main` `ea21dfa` on 2026-10-15. Items 1 to 8 record the v1.1 corrections from that revision. Item 9 records the archive encryption in this edition.

## Corrected descriptions of the reference implementation

1. **Archive write (§3.1.1 and §5.4.2).** v1.0 says the reference implementation writes a temporary file. It then checks the hash and renames the file. The implementation does not do that. `implementation/archive/store.ts` writes the bytes to the final content-addressed path with a conditional put (`onlyIf`). A failed put does not leave a partial object as the artifact. The requirement is the same: a partial write is not an archived artifact.

2. **Same bytes, different extension (§5.4.1).** v1.0 says two files with the same bytes and different extensions are stored once, at one address. `implementation/archive/paths.ts` puts the extension in the path. The same bytes with two extensions are two paths. The methodology still treats the bytes as one artifact. The reference implementation does not store them once.

3. **Reasoning attempts (§7.2.3).** v1.0 says the reference implementation retries up to three times. That sentence can mean four calls (one try, then three retries). `implementation/reasoner/reasoner.ts` sets `DEFAULT_MAX_ATTEMPTS` to 3. That count includes the first call. v1.1 states the implementation count as three calls in total. The methodology rule is unchanged: after the allowed calls fail validation, the output is a declination.

4. **Replica store (§5.4.4).** v1.0 says the reference implementation can copy the archive to an S3-compatible store. `implementation/archive/dual-write.ts` copies to a second R2 bucket only.

## Corrected methodology wording

5. **No "inconsistent" band (§3.3.2).** v1.0 says the methodology returns "insufficient" or "inconsistent" when signals are absent. §3.2.1 defines three bands only: insufficient, consistent, and strongly consistent. The code in `implementation/reasoner/bands.ts` has those three bands. v1.1 says the output in that case is insufficient. Insufficient is not a claim that the operators differ.

6. **No name field (§3.3.3).** v1.0 says the output format enforces the exclusion of natural-person names. The output names accounts by handle and clusters by an opaque id. Free-text fields are not scanned for a personal name. v1.1 states the structural limit. It does not say the free text is filtered.

7. **Cited appendices.** v1.0 points at Appendix B and Appendix D. `paper/` has no appendix files. v1.1 says those texts are not in this deposit. Prompt versions are in `docs/PROMPT-VERSIONS.md`. The manifest is line-oriented JSON, as §3.1.2 describes.

8. **Triage parse failure (§7.5.2).** v1.0 does not say what happens when the triage output cannot be parsed. The reference implementation sends that pair to the reasoning model. It does not treat the failure as insufficient. v1.1 states that rule.

## v1.2

9. **Archive encryption (§3.5).** v1.1 says the reference implementation does not encrypt archived artifacts. Those artifacts stay content-addressed and unencrypted in that edition. v1.2 encrypts the artifact bytes and the manifest lines under the investigation key. The content address is still the SHA-256 hash of the plaintext bytes. The stored object is ciphertext.

## Not changed

Several claims are the same as v1.0. They are the three confidence bands, the citation rule, and the declination rule. They are the closed-world seed, the cluster limit, and the excluded signal list in §4.8.

Control corpora are not shipped with the implementation. The practitioner supplies one. v1.0 §6 already allows that reading in one place and a stronger reading in another. v1.1 states the practitioner-supplied rule once.

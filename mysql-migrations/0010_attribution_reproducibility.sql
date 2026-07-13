-- Migration 0010: attribution run reproducibility columns (§3.4.2, §7.4.1).
-- prompt_sha256: SHA-256 of the system + user prompt text sent to the model.
-- randomization_seed: signal-table shuffle seed for every pair outcome.

ALTER TABLE attribution_runs
  ADD COLUMN prompt_sha256 VARCHAR(64) NULL AFTER reasoning_prompt_version,
  ADD COLUMN randomization_seed VARCHAR(128) NULL AFTER prompt_sha256;

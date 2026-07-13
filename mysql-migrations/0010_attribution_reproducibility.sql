-- Migration 0010: attribution run reproducibility columns (§3.4.2, §7.4.1).
-- prompt_sha256: SHA-256 of the system + user prompt text sent to the model.
-- randomization_seed: signal-table shuffle seed for every pair outcome.
--
-- Apply to an existing database:
--   mysql -h HOST -u USER -p common_thread < mysql-migrations/0010_attribution_reproducibility.sql
--
-- Fresh installs: use mysql-schema.sql (already includes these columns).

USE common_thread;

ALTER TABLE attribution_runs
  ADD COLUMN prompt_sha256 VARCHAR(64) NULL AFTER reasoning_prompt_version,
  ADD COLUMN randomization_seed VARCHAR(128) NULL AFTER prompt_sha256;

UPDATE schema_metadata
SET value = '0010'
WHERE `key` = 'schema_version';

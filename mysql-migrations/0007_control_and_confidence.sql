-- MySQL migration 0007: control accounts (§5.1.4) + per-feature confidence (§6.4.1)
--
-- Apply to an existing database (skip columns that already exist):
--   mysql -h HOST -u USER -p common_thread < mysql-migrations/0007_control_and_confidence.sql
--
-- Fresh installs: use mysql-schema.sql (already includes these columns).

USE common_thread;

ALTER TABLE seed_accounts
  ADD COLUMN is_control TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE account_features
  ADD COLUMN confidence_flag VARCHAR(32) NULL;

ALTER TABLE pair_features
  ADD COLUMN confidence_flag VARCHAR(32) NULL;

ALTER TABLE event_features
  ADD COLUMN confidence_flag VARCHAR(32) NULL;

UPDATE schema_metadata
SET value = '0007'
WHERE `key` = 'schema_version';

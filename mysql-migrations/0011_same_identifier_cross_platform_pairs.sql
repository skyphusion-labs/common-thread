-- Migration 0011: allow same-identifier cross-platform pairs (§4.5.3 / §4.6).
--
-- Replaces CHECK (account_a < account_b) with a (account, platform) tuple
-- order so e.g. twitter:bob + reddit:bob can land in pair_features /
-- attribution_runs. Fresh installs: mysql-schema.sql already includes this.
--
-- Apply to an existing database:
--   mysql -h HOST -u USER -p common_thread < mysql-migrations/0011_same_identifier_cross_platform_pairs.sql

USE common_thread;

ALTER TABLE pair_features
  DROP CHECK chk_pair_features_order;

ALTER TABLE pair_features
  ADD CONSTRAINT chk_pair_features_order CHECK (
    account_a < account_b
    OR (account_a = account_b AND platform_a < platform_b)
  );

ALTER TABLE attribution_runs
  DROP CHECK chk_attribution_runs_order;

ALTER TABLE attribution_runs
  ADD CONSTRAINT chk_attribution_runs_order CHECK (
    account_a < account_b
    OR (account_a = account_b AND platform_a < platform_b)
  );

DELETE FROM schema_metadata
WHERE `key` = 'pair_features_same_identifier_cross_platform_limitation';

UPDATE schema_metadata
SET value = '0011'
WHERE `key` = 'schema_version';

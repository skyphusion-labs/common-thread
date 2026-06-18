-- MySQL migration 0008: capability token per investigation
--
-- Apply to an existing database:
--   mysql -h HOST -u USER -p common_thread < mysql-migrations/0008_investigation_access_token.sql
--
-- Fresh installs: use mysql-schema.sql (already includes access_token_hash).
--
-- Existing rows without a token cannot be accessed via the API after this
-- migration. For dev databases, drop and recreate is simplest.

USE common_thread;

ALTER TABLE investigations
  ADD COLUMN access_token_hash VARCHAR(128) NULL;

-- Investigations created before this migration have no recoverable token.
-- They remain in the database but are unreachable until recreated.

UPDATE schema_metadata
SET value = '0008'
WHERE `key` = 'schema_version';

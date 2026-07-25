-- Migration 0013: per-investigation encryption at rest (§3.5).
--
-- Adds two nullable columns to investigations so the analytic payload
-- (attribution reasoning, feature values, basis statements, event data,
-- metadata) can be encrypted under a key derived from the investigation's
-- access token (crypto/investigation-key.ts). Both columns are NULL for
-- investigations created before this migration: a NULL crypto_version means
-- the payload columns are plaintext and readers must treat them as such, so
-- existing investigations keep working unchanged. Encryption cannot be applied
-- retroactively because the derivation key exists only inside the access token,
-- which the server never stores.
--
--   crypto_version : scheme tag stamped at creation ('v1'); NULL = legacy plaintext.
--   key_check      : a fixed sentinel encrypted under the derived key, so a
--                    presented token can be verified to derive the right key
--                    (fail-fast on a wrong secret) without decrypting real data.
--
-- No payload column type changes: ciphertext cells are ASCII and fit the
-- existing MEDIUMTEXT/TEXT columns (encrypted numeric/json values are packed
-- into feature_value_text as a typed envelope; see crypto/feature-cells.ts).
--
-- Apply to an existing database:
--   mysql -h HOST -u USER -p common_thread < mysql-migrations/0013_investigation_encryption.sql

USE common_thread;

ALTER TABLE investigations
  ADD COLUMN crypto_version VARCHAR(16) NULL,
  ADD COLUMN key_check      TEXT NULL;

UPDATE schema_metadata
SET value = '0013'
WHERE `key` = 'schema_version';

-- Migration 0012: widen feature value columns TEXT -> MEDIUMTEXT (§4.3).
--
-- Deterministic stylometric extractors legitimately emit large JSON feature
-- values: account_term_tf / account_ngram_tf (stylometric/account-term-tf.ts)
-- store term- and n-gram-frequency dictionaries capped at MAX_TERM_KEYS /
-- MAX_NGRAM_KEYS = 5000 keys (n-grams up to 7 words each). Over a high-volume
-- account these serialize well past MySQL TEXT's 65,535-byte limit, so the
-- extraction batch failed with "Data too long for column 'feature_value_json'".
-- The 5000-key cap is intentional feature fidelity (paper-governed), so the fix
-- is to grow the column, not shrink the feature. MEDIUMTEXT holds up to 16 MiB.
--
-- Widened columns: account_features / pair_features feature_value_text +
-- feature_value_json, and event_features event_data_json (same latent 64 KiB
-- cap for high-volume engagement events). Widening is lossless; existing rows
-- are unaffected. The one-of-three CHECK constraints are untouched (MODIFY keeps
-- the columns NULLable).
--
-- Fresh installs: mysql-schema.sql already declares these as MEDIUMTEXT.
--
-- Apply to an existing database:
--   mysql -h HOST -u USER -p common_thread < mysql-migrations/0012_widen_feature_value_columns.sql

USE common_thread;

ALTER TABLE account_features
  MODIFY feature_value_text MEDIUMTEXT,
  MODIFY feature_value_json MEDIUMTEXT;

ALTER TABLE pair_features
  MODIFY feature_value_text MEDIUMTEXT,
  MODIFY feature_value_json MEDIUMTEXT;

ALTER TABLE event_features
  MODIFY event_data_json MEDIUMTEXT;

UPDATE schema_metadata
SET value = '0012'
WHERE `key` = 'schema_version';

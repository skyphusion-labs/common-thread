-- Common Thread MySQL schema (Hyperdrive).
--
-- Apply:
--   MYSQL_URL='mysql://user:pass@host:3306/common_thread' npm run db:migrate
--   mysql -h HOST -u USER -p common_thread < mysql-schema.sql

CREATE DATABASE IF NOT EXISTS common_thread
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE common_thread;

-- ---------------------------------------------------------------------------
-- Investigations: the root container.
-- ---------------------------------------------------------------------------

CREATE TABLE investigations (
  id                  VARCHAR(255) PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  status              VARCHAR(32) NOT NULL,
  created_at          VARCHAR(64) NOT NULL,
  updated_at          VARCHAR(64) NOT NULL,
  metadata_json       TEXT,
  access_token_hash   VARCHAR(128) NOT NULL,
  CONSTRAINT chk_investigations_status
    CHECK (status IN ('active', 'archived', 'sealed'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Seed accounts: accounts in each investigation's seed set (§5.1).
-- Soft-deletable via removed_at to preserve audit trail.
-- ---------------------------------------------------------------------------

CREATE TABLE seed_accounts (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  investigation_id    VARCHAR(255) NOT NULL,
  platform            VARCHAR(64) NOT NULL,
  account_identifier  VARCHAR(255) NOT NULL,
  basis_statement     TEXT NOT NULL,
  added_at            VARCHAR(64) NOT NULL,
  added_by            VARCHAR(255),
  removed_at          VARCHAR(64),
  removed_reason      TEXT,
  is_control          TINYINT(1) NOT NULL DEFAULT 0,
  UNIQUE KEY uniq_seed (investigation_id, platform, account_identifier, added_at),
  INDEX idx_seed_accounts_lookup (investigation_id, platform, account_identifier),
  CONSTRAINT fk_seed_accounts_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Extractor runs: reproducibility log for feature extraction (§3.4).
-- Created before feature tables that reference it.
-- ---------------------------------------------------------------------------

CREATE TABLE extractor_runs (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  investigation_id       VARCHAR(255) NOT NULL,
  extractor_name         VARCHAR(128) NOT NULL,
  extractor_version      VARCHAR(64) NOT NULL,
  configuration_json     TEXT,
  manifest_hash_at_run   VARCHAR(128) NOT NULL,
  started_at             VARCHAR(64) NOT NULL,
  completed_at           VARCHAR(64),
  status                 VARCHAR(32) NOT NULL,
  input_artifact_count   INT,
  output_feature_count   INT,
  error_message          TEXT,
  INDEX idx_extractor_runs_by_investigation_extractor
    (investigation_id, extractor_name, extractor_version),
  INDEX idx_extractor_runs_by_manifest_hash (manifest_hash_at_run),
  CONSTRAINT chk_extractor_runs_status
    CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  CONSTRAINT fk_extractor_runs_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Account features: per-account features extracted from artifacts.
-- ---------------------------------------------------------------------------

CREATE TABLE account_features (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  investigation_id      VARCHAR(255) NOT NULL,
  platform              VARCHAR(64) NOT NULL,
  account_identifier    VARCHAR(255) NOT NULL,
  feature_category      VARCHAR(64) NOT NULL,
  feature_name          VARCHAR(128) NOT NULL,
  feature_value_text    TEXT,
  feature_value_numeric DOUBLE,
  feature_value_json    TEXT,
  extracted_at          VARCHAR(64) NOT NULL,
  extractor_name        VARCHAR(128) NOT NULL,
  extractor_version     VARCHAR(64) NOT NULL,
  extractor_run_id      INT,
  confidence_flag       VARCHAR(32),
  INDEX idx_account_features_lookup
    (investigation_id, platform, account_identifier, feature_category),
  INDEX idx_account_features_by_extractor
    (investigation_id, extractor_name, extractor_version),
  INDEX idx_account_features_by_name
    (investigation_id, feature_name),
  CONSTRAINT chk_account_features_value
    CHECK (
      (feature_value_text IS NOT NULL) +
      (feature_value_numeric IS NOT NULL) +
      (feature_value_json IS NOT NULL) = 1
    ),
  CONSTRAINT fk_account_features_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id),
  CONSTRAINT fk_account_features_extractor_run
    FOREIGN KEY (extractor_run_id) REFERENCES extractor_runs(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Pair features (migration 0002: platform_a / platform_b).
-- account_a and account_b are canonically ordered (account_a < account_b).
-- ---------------------------------------------------------------------------

CREATE TABLE pair_features (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  investigation_id      VARCHAR(255) NOT NULL,
  platform_a            VARCHAR(64) NOT NULL,
  platform_b            VARCHAR(64) NOT NULL,
  account_a             VARCHAR(255) NOT NULL,
  account_b             VARCHAR(255) NOT NULL,
  feature_category      VARCHAR(64) NOT NULL,
  feature_name          VARCHAR(128) NOT NULL,
  feature_value_text    TEXT,
  feature_value_numeric DOUBLE,
  feature_value_json    TEXT,
  extracted_at          VARCHAR(64) NOT NULL,
  extractor_name        VARCHAR(128) NOT NULL,
  extractor_version     VARCHAR(64) NOT NULL,
  extractor_run_id      INT,
  confidence_flag       VARCHAR(32),
  -- This is a non-unique LOOKUP index, so prefix lengths only trade a little
  -- index selectivity (190 chars is far longer than any real account id) and
  -- weaken NO uniqueness/dedup guarantee. Without them the full composite is
  -- 6 cols incl 3x VARCHAR(255) = 3828 bytes under utf8mb4, over InnoDB's
  -- 3072-byte index limit, so the table (and a fresh MySQL 8 bootstrap) fails
  -- with ER_TOO_LONG_KEY. The only UNIQUE keys in this schema (uniq_seed,
  -- uniq_*_artifact) are all well under the limit and are left untouched.
  INDEX idx_pair_features_lookup
    (investigation_id(190), platform_a, platform_b, account_a(190), account_b(190), feature_category),
  INDEX idx_pair_features_by_account_a (investigation_id, account_a),
  INDEX idx_pair_features_by_account_b (investigation_id, account_b),
  INDEX idx_pair_features_by_extractor
    (investigation_id, extractor_name, extractor_version),
  CONSTRAINT chk_pair_features_order CHECK (account_a < account_b),
  CONSTRAINT chk_pair_features_value
    CHECK (
      (feature_value_text IS NOT NULL) +
      (feature_value_numeric IS NOT NULL) +
      (feature_value_json IS NOT NULL) = 1
    ),
  CONSTRAINT fk_pair_features_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id),
  CONSTRAINT fk_pair_features_extractor_run
    FOREIGN KEY (extractor_run_id) REFERENCES extractor_runs(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Event features: time-anchored events extracted from artifacts.
-- ---------------------------------------------------------------------------

CREATE TABLE event_features (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  investigation_id    VARCHAR(255) NOT NULL,
  platform            VARCHAR(64) NOT NULL,
  account_identifier  VARCHAR(255) NOT NULL,
  event_timestamp     VARCHAR(64) NOT NULL,
  event_type          VARCHAR(64) NOT NULL,
  event_data_json     TEXT,
  extracted_at        VARCHAR(64) NOT NULL,
  extractor_name      VARCHAR(128) NOT NULL,
  extractor_version   VARCHAR(64) NOT NULL,
  extractor_run_id    INT,
  confidence_flag     VARCHAR(32),
  INDEX idx_event_features_by_account_time
    (investigation_id, account_identifier, event_timestamp),
  INDEX idx_event_features_by_type_time
    (investigation_id, event_type, event_timestamp),
  INDEX idx_event_features_by_time (investigation_id, event_timestamp),
  CONSTRAINT fk_event_features_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id),
  CONSTRAINT fk_event_features_extractor_run
    FOREIGN KEY (extractor_run_id) REFERENCES extractor_runs(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Provenance tables: link each feature row to archived artifacts (§3.1, §6.3).
-- ---------------------------------------------------------------------------

CREATE TABLE account_feature_provenance (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  account_feature_id  INT NOT NULL,
  artifact_hash       VARCHAR(128) NOT NULL,
  manifest_entry_hash VARCHAR(128),
  UNIQUE KEY uniq_account_feature_artifact (account_feature_id, artifact_hash),
  INDEX idx_account_feature_provenance_by_artifact (artifact_hash),
  CONSTRAINT fk_account_feature_provenance_feature
    FOREIGN KEY (account_feature_id) REFERENCES account_features(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE pair_feature_provenance (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  pair_feature_id     INT NOT NULL,
  artifact_hash       VARCHAR(128) NOT NULL,
  manifest_entry_hash VARCHAR(128),
  UNIQUE KEY uniq_pair_feature_artifact (pair_feature_id, artifact_hash),
  INDEX idx_pair_feature_provenance_by_artifact (artifact_hash),
  CONSTRAINT fk_pair_feature_provenance_feature
    FOREIGN KEY (pair_feature_id) REFERENCES pair_features(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE event_feature_provenance (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  event_feature_id    INT NOT NULL,
  artifact_hash       VARCHAR(128) NOT NULL,
  manifest_entry_hash VARCHAR(128),
  UNIQUE KEY uniq_event_feature_artifact (event_feature_id, artifact_hash),
  INDEX idx_event_feature_provenance_by_artifact (artifact_hash),
  CONSTRAINT fk_event_feature_provenance_feature
    FOREIGN KEY (event_feature_id) REFERENCES event_features(id)
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Attribution runs: LLM-assisted attribution reasoning sessions (§7.3).
-- Migration 0002: platform_a / platform_b.
-- ---------------------------------------------------------------------------

CREATE TABLE attribution_runs (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  investigation_id         VARCHAR(255) NOT NULL,
  account_a                VARCHAR(255) NOT NULL,
  account_b                VARCHAR(255) NOT NULL,
  platform_a               VARCHAR(64) NOT NULL,
  platform_b               VARCHAR(64) NOT NULL,
  model_name               VARCHAR(128) NOT NULL,
  model_version            VARCHAR(64) NOT NULL,
  reasoning_prompt_version VARCHAR(64) NOT NULL,
  prompt_sha256            VARCHAR(64),
  randomization_seed       VARCHAR(128),
  input_feature_count      INT NOT NULL,
  confidence_band          VARCHAR(32) NOT NULL,
  output_summary           TEXT NOT NULL,
  output_json              TEXT NOT NULL,
  started_at               VARCHAR(64) NOT NULL,
  completed_at             VARCHAR(64) NOT NULL,
  manifest_hash_at_run     VARCHAR(128) NOT NULL,
  INDEX idx_attribution_runs_by_pair (investigation_id, account_a, account_b),
  INDEX idx_attribution_runs_by_band (investigation_id, confidence_band),
  INDEX idx_attribution_runs_by_completed (investigation_id, completed_at),
  CONSTRAINT chk_attribution_runs_order CHECK (account_a < account_b),
  CONSTRAINT chk_attribution_runs_band
    CHECK (confidence_band IN ('insufficient', 'consistent', 'strongly_consistent')),
  CONSTRAINT fk_attribution_runs_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Ingest jobs (migration 0006).
-- ---------------------------------------------------------------------------

CREATE TABLE ingest_jobs (
  job_id            VARCHAR(255) PRIMARY KEY,
  investigation_id  VARCHAR(255) NOT NULL,
  provider          VARCHAR(64) NOT NULL,
  status            VARCHAR(32) NOT NULL,
  item_count        INT,
  manifest_hashes   TEXT,
  raw_file_hashes   TEXT,
  container_name    VARCHAR(255),
  started_at        VARCHAR(64),
  completed_at      VARCHAR(64),
  error_message     TEXT,
  created_at        VARCHAR(64) NOT NULL,
  INDEX idx_ingest_jobs_investigation (investigation_id),
  INDEX idx_ingest_jobs_status (status),
  CONSTRAINT fk_ingest_jobs_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Attribution jobs (migration 0009).
-- ---------------------------------------------------------------------------
-- Async attribution queue mirroring ingest_jobs. Server-credentials-only by
-- design: no credential column exists, so a BYOK key can never be persisted
-- (Conrad, 2026-07-11). options_json holds only non-secret run parameters.

CREATE TABLE attribution_jobs (
  job_id            VARCHAR(255) PRIMARY KEY,
  investigation_id  VARCHAR(255) NOT NULL,
  status            VARCHAR(32) NOT NULL,
  options_json      TEXT,
  pair_count        INT,
  container_name    VARCHAR(255),
  started_at        VARCHAR(64),
  completed_at      VARCHAR(64),
  error_message     TEXT,
  created_at        VARCHAR(64) NOT NULL,
  INDEX idx_attribution_jobs_investigation (investigation_id),
  INDEX idx_attribution_jobs_status (status),
  CONSTRAINT fk_attribution_jobs_investigation
    FOREIGN KEY (investigation_id) REFERENCES investigations(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- Schema metadata.
-- ---------------------------------------------------------------------------

CREATE TABLE schema_metadata (
  `key`       VARCHAR(128) PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  VARCHAR(64) NOT NULL
) ENGINE=InnoDB;

INSERT INTO schema_metadata (`key`, value, updated_at) VALUES
  ('schema_version', '0009', '1970-01-01T00:00:00.000Z'),
  ('schema_initialized_at', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'),
  (
    'pair_features_same_identifier_cross_platform_limitation',
    'The CHECK (account_a < account_b) constraint on pair_features and attribution_runs orders by account identifier only, not by (account, platform) tuple. Same-identifier-cross-platform pairs (e.g., ''bob'' on two platforms) cannot be inserted. See mysql-migrations/ for incremental schema history. A future migration can rebuild with a tuple CHECK if this edge case becomes operationally important.',
    '1970-01-01T00:00:00.000Z'
  );

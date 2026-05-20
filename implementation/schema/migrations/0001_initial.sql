-- Common Thread D1 schema, initial migration.
--
-- This migration establishes the relational schema for the feature
-- extraction and attribution reasoning layers. The schema enforces
-- the methodology paper's evidentiary commitments:
--
--   - Every feature row traces back to archived artifacts via the
--     provenance tables (§3.1, §6.3).
--   - Extractor runs are logged with the manifest hash at the time
--     of execution, supporting reproducibility verification (§3.4).
--   - Confidence bands on attribution outputs are constrained to
--     the three-band scheme (§7.3): insufficient, consistent,
--     strongly_consistent.
--
-- Provenance is normalized into per-feature-type provenance tables
-- rather than denormalized into JSON arrays. This supports the
-- "which features came from this artifact" query that is frequent
-- in evidentiary use.
--
-- Feature values use three nullable columns with a CHECK constraint
-- that exactly one is populated. This keeps numeric queries clean
-- while preserving the ability to store text and structured values.

-- ---------------------------------------------------------------------------
-- Investigations: the root container.
-- ---------------------------------------------------------------------------

CREATE TABLE investigations (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  status              TEXT NOT NULL CHECK (status IN ('active', 'archived', 'sealed')),
  created_at          TEXT NOT NULL,  -- ISO 8601 UTC
  updated_at          TEXT NOT NULL,  -- ISO 8601 UTC
  metadata_json       TEXT            -- free-form JSON for investigation-specific metadata
);

-- ---------------------------------------------------------------------------
-- Seed accounts: the accounts in each investigation's seed set with
-- basis statements (§5.1). Soft-deletable via removed_at to preserve
-- the audit trail of seed-set composition over time.
-- ---------------------------------------------------------------------------

CREATE TABLE seed_accounts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id    TEXT NOT NULL REFERENCES investigations(id),
  platform            TEXT NOT NULL,           -- e.g., 'twitter', 'reddit', 'bluesky'
  account_identifier  TEXT NOT NULL,           -- username or platform-stable identifier
  basis_statement     TEXT NOT NULL,           -- why this account is in the seed (§5.1)
  added_at            TEXT NOT NULL,           -- ISO 8601 UTC
  added_by            TEXT,                    -- practitioner identifier
  removed_at          TEXT,                    -- ISO 8601 UTC; null = still in seed
  removed_reason      TEXT,                    -- why removed; null if still in seed
  UNIQUE (investigation_id, platform, account_identifier, added_at)
);

CREATE INDEX idx_seed_accounts_active
  ON seed_accounts (investigation_id, platform, account_identifier)
  WHERE removed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Account features: per-account features extracted from artifacts.
--
-- feature_category groups features by §4 signal taxonomy:
--   account_metadata, temporal, stylometric, network, visual,
--   cross_platform, content_artifacts, metadata_leakage
--
-- feature_value_* columns: exactly one is populated.
--   feature_value_text     for short text values
--   feature_value_numeric  for scalar numeric values
--   feature_value_json     for structured values (vectors, distributions, objects)
-- ---------------------------------------------------------------------------

CREATE TABLE account_features (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id      TEXT NOT NULL REFERENCES investigations(id),
  platform              TEXT NOT NULL,
  account_identifier    TEXT NOT NULL,
  feature_category      TEXT NOT NULL,
  feature_name          TEXT NOT NULL,
  feature_value_text    TEXT,
  feature_value_numeric REAL,
  feature_value_json    TEXT,                -- JSON-encoded
  extracted_at          TEXT NOT NULL,       -- ISO 8601 UTC
  extractor_name        TEXT NOT NULL,
  extractor_version     TEXT NOT NULL,
  extractor_run_id      INTEGER REFERENCES extractor_runs(id),
  CHECK (
    (CASE WHEN feature_value_text    IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN feature_value_numeric IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN feature_value_json    IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX idx_account_features_lookup
  ON account_features (investigation_id, platform, account_identifier, feature_category);

CREATE INDEX idx_account_features_by_extractor
  ON account_features (investigation_id, extractor_name, extractor_version);

CREATE INDEX idx_account_features_by_name
  ON account_features (investigation_id, feature_name);

-- ---------------------------------------------------------------------------
-- Pair features: features over ordered pairs of accounts.
--
-- account_a and account_b are stored in canonical order (account_a < account_b
-- lexicographically) to deduplicate pairs. Application code should enforce
-- this ordering before insert.
-- ---------------------------------------------------------------------------

CREATE TABLE pair_features (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id      TEXT NOT NULL REFERENCES investigations(id),
  platform              TEXT NOT NULL,
  account_a             TEXT NOT NULL,
  account_b             TEXT NOT NULL,
  feature_category      TEXT NOT NULL,
  feature_name          TEXT NOT NULL,
  feature_value_text    TEXT,
  feature_value_numeric REAL,
  feature_value_json    TEXT,
  extracted_at          TEXT NOT NULL,
  extractor_name        TEXT NOT NULL,
  extractor_version     TEXT NOT NULL,
  extractor_run_id      INTEGER REFERENCES extractor_runs(id),
  CHECK (account_a < account_b),
  CHECK (
    (CASE WHEN feature_value_text    IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN feature_value_numeric IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN feature_value_json    IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX idx_pair_features_lookup
  ON pair_features (investigation_id, platform, account_a, account_b, feature_category);

CREATE INDEX idx_pair_features_by_account_a
  ON pair_features (investigation_id, account_a);

CREATE INDEX idx_pair_features_by_account_b
  ON pair_features (investigation_id, account_b);

CREATE INDEX idx_pair_features_by_extractor
  ON pair_features (investigation_id, extractor_name, extractor_version);

-- ---------------------------------------------------------------------------
-- Event features: time-anchored events extracted from artifacts.
--
-- event_type examples: 'post', 'reply', 'repost', 'like', 'follow',
-- 'unfollow', 'name_change', 'handle_change', 'profile_image_change'
-- ---------------------------------------------------------------------------

CREATE TABLE event_features (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id    TEXT NOT NULL REFERENCES investigations(id),
  platform            TEXT NOT NULL,
  account_identifier  TEXT NOT NULL,
  event_timestamp     TEXT NOT NULL,         -- ISO 8601 UTC
  event_type          TEXT NOT NULL,
  event_data_json     TEXT,                  -- JSON-encoded event payload
  extracted_at        TEXT NOT NULL,
  extractor_name      TEXT NOT NULL,
  extractor_version   TEXT NOT NULL,
  extractor_run_id    INTEGER REFERENCES extractor_runs(id)
);

CREATE INDEX idx_event_features_by_account_time
  ON event_features (investigation_id, account_identifier, event_timestamp);

CREATE INDEX idx_event_features_by_type_time
  ON event_features (investigation_id, event_type, event_timestamp);

CREATE INDEX idx_event_features_by_time
  ON event_features (investigation_id, event_timestamp);

-- ---------------------------------------------------------------------------
-- Provenance tables: link each feature row to the archived artifacts
-- that contributed to its value.
--
-- artifact_hash is the SHA-256 hex of the archived artifact (matches
-- the hash column in the R2-stored manifest).
--
-- manifest_entry_hash is optional. If the same artifact appears under
-- multiple manifest entries (e.g., re-collected from different sources),
-- the specific entry can be recorded here. If unspecified, provenance
-- attaches to the artifact at the archive level rather than to a specific
-- collection event.
-- ---------------------------------------------------------------------------

CREATE TABLE account_feature_provenance (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  account_feature_id  INTEGER NOT NULL REFERENCES account_features(id) ON DELETE CASCADE,
  artifact_hash       TEXT NOT NULL,
  manifest_entry_hash TEXT,
  UNIQUE (account_feature_id, artifact_hash)
);

CREATE INDEX idx_account_feature_provenance_by_artifact
  ON account_feature_provenance (artifact_hash);

CREATE TABLE pair_feature_provenance (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  pair_feature_id     INTEGER NOT NULL REFERENCES pair_features(id) ON DELETE CASCADE,
  artifact_hash       TEXT NOT NULL,
  manifest_entry_hash TEXT,
  UNIQUE (pair_feature_id, artifact_hash)
);

CREATE INDEX idx_pair_feature_provenance_by_artifact
  ON pair_feature_provenance (artifact_hash);

CREATE TABLE event_feature_provenance (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  event_feature_id    INTEGER NOT NULL REFERENCES event_features(id) ON DELETE CASCADE,
  artifact_hash       TEXT NOT NULL,
  manifest_entry_hash TEXT,
  UNIQUE (event_feature_id, artifact_hash)
);

CREATE INDEX idx_event_feature_provenance_by_artifact
  ON event_feature_provenance (artifact_hash);

-- ---------------------------------------------------------------------------
-- Extractor runs: reproducibility log for feature extraction.
--
-- manifest_hash_at_run captures the manifest's hash at the moment the
-- extractor ran. Used to verify reproducibility: rerunning an extractor
-- against the same manifest (same hash) should produce the same feature
-- rows. If the manifest has been appended to since, the hash will differ.
-- ---------------------------------------------------------------------------

CREATE TABLE extractor_runs (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id       TEXT NOT NULL REFERENCES investigations(id),
  extractor_name         TEXT NOT NULL,
  extractor_version      TEXT NOT NULL,
  configuration_json     TEXT,                   -- extractor-specific config
  manifest_hash_at_run   TEXT NOT NULL,          -- SHA-256 hex of manifest.jsonl at run time
  started_at             TEXT NOT NULL,          -- ISO 8601 UTC
  completed_at           TEXT,                   -- ISO 8601 UTC; null if still running
  status                 TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'partial')),
  input_artifact_count   INTEGER,
  output_feature_count   INTEGER,
  error_message          TEXT
);

CREATE INDEX idx_extractor_runs_by_investigation_extractor
  ON extractor_runs (investigation_id, extractor_name, extractor_version);

CREATE INDEX idx_extractor_runs_by_manifest_hash
  ON extractor_runs (manifest_hash_at_run);

-- ---------------------------------------------------------------------------
-- Attribution runs: log of LLM-assisted attribution reasoning sessions.
--
-- confidence_band is constrained to the three values from §7.3.
-- output_summary holds the human-readable attribution narrative.
-- output_json holds the structured attribution output for programmatic use.
-- ---------------------------------------------------------------------------

CREATE TABLE attribution_runs (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id         TEXT NOT NULL REFERENCES investigations(id),
  account_a                TEXT NOT NULL,
  account_b                TEXT NOT NULL,
  platform                 TEXT NOT NULL,
  model_name               TEXT NOT NULL,
  model_version            TEXT NOT NULL,
  reasoning_prompt_version TEXT NOT NULL,
  input_feature_count      INTEGER NOT NULL,
  confidence_band          TEXT NOT NULL CHECK (confidence_band IN ('insufficient', 'consistent', 'strongly_consistent')),
  output_summary           TEXT NOT NULL,        -- human-readable narrative
  output_json              TEXT NOT NULL,        -- structured attribution output
  started_at               TEXT NOT NULL,        -- ISO 8601 UTC
  completed_at             TEXT NOT NULL,        -- ISO 8601 UTC
  manifest_hash_at_run     TEXT NOT NULL,        -- manifest hash when reasoning executed
  CHECK (account_a < account_b)
);

CREATE INDEX idx_attribution_runs_by_pair
  ON attribution_runs (investigation_id, account_a, account_b);

CREATE INDEX idx_attribution_runs_by_band
  ON attribution_runs (investigation_id, confidence_band);

CREATE INDEX idx_attribution_runs_by_completed
  ON attribution_runs (investigation_id, completed_at);

-- ---------------------------------------------------------------------------
-- Schema metadata: track the schema version applied.
-- ---------------------------------------------------------------------------

CREATE TABLE schema_metadata (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

INSERT INTO schema_metadata (key, value, updated_at) VALUES
  ('schema_version', '0001', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('schema_initialized_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

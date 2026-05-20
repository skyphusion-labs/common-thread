-- Migration 0002: split pair_features.platform and attribution_runs.platform
-- into platform_a / platform_b, paired by index with the existing
-- canonically-ordered account_a / account_b columns.
--
-- Rationale: schema 0001 assumed pair features always involve two accounts
-- on the same platform. Cross-platform attribution (e.g., handle reuse
-- between a Twitter account and a Reddit account) requires recording both
-- platforms. This migration splits the single `platform` column into
-- `platform_a` and `platform_b`.
--
-- Pattern: ALTER TABLE RENAME + ADD COLUMN + backfill, NOT a table rebuild.
-- D1 transaction handling around PRAGMA foreign_keys = OFF/ON is fragile for
-- table rebuilds, and pair_feature_provenance has an FK to pair_features.id
-- that a rebuild risks orphaning.
--
-- Documented limitation: the existing CHECK (account_a < account_b)
-- continues to apply by account identifier alone, not by (account, platform)
-- tuple. A same-identifier-cross-platform pair (e.g., 'bob' on Twitter and
-- 'bob' on Reddit) cannot be inserted into pair_features or attribution_runs
-- as a same-identifier pair. The handle-reuse extractor still detects
-- similar-but-not-identical handles via its 7 transformation types
-- (year_suffix, numeric_suffix, etc.). A future 0003 migration can rebuild
-- with a tuple CHECK ((account_a, platform_a) < (account_b, platform_b)) if
-- this edge case becomes operationally important.

-- ------------------------------------------------------------------------
-- pair_features
-- ------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_pair_features_lookup;

ALTER TABLE pair_features RENAME COLUMN platform TO platform_a;
ALTER TABLE pair_features ADD COLUMN platform_b TEXT;

-- Backfill: pre-migration rows were implicitly same-platform.
UPDATE pair_features
SET platform_b = platform_a
WHERE platform_b IS NULL;

-- Note: SQLite cannot enforce NOT NULL via ALTER TABLE on an existing
-- column. The application layer is responsible for setting platform_b
-- on every INSERT going forward (see db-types.ts NewPairFeature shape
-- and pair-runner.ts writePairFeature INSERT).

CREATE INDEX idx_pair_features_lookup ON pair_features (
  investigation_id, platform_a, platform_b, account_a, account_b, feature_category
);

-- ------------------------------------------------------------------------
-- attribution_runs
-- ------------------------------------------------------------------------

ALTER TABLE attribution_runs RENAME COLUMN platform TO platform_a;
ALTER TABLE attribution_runs ADD COLUMN platform_b TEXT;

UPDATE attribution_runs
SET platform_b = platform_a
WHERE platform_b IS NULL;

-- attribution_runs has no platform-keyed indexes to recreate.

-- ------------------------------------------------------------------------
-- schema_metadata
-- ------------------------------------------------------------------------

UPDATE schema_metadata SET value = '0002' WHERE key = 'schema_version';

INSERT INTO schema_metadata (key, value) VALUES (
  'pair_features_same_identifier_cross_platform_limitation',
  'The CHECK (account_a < account_b) constraint on pair_features and attribution_runs orders by account identifier only, not by (account, platform) tuple. Same-identifier-cross-platform pairs (e.g., ''bob'' on two platforms) cannot be inserted. See schema/migrations/0002_split_pair_platform_columns.sql for the full rationale. A future 0003 migration can rebuild with a tuple CHECK if this edge case becomes operationally important.'
);

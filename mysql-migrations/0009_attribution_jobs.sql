-- MySQL migration 0009: async attribution jobs (#69)
--
-- Apply to an existing database:
--   mysql -h HOST -u USER -p common_thread < mysql-migrations/0009_attribution_jobs.sql
--
-- Fresh installs: use mysql-schema.sql (already includes attribution_jobs).
--
-- Adds the attribution_jobs queue mirroring ingest_jobs. Async attribution
-- runs (server-credentials only) enqueue here; the executor claims a job,
-- runs the reasoner, and records the terminal status. There is deliberately
-- NO credential column: BYOK requests stay synchronous inline and no
-- user-supplied key is ever persisted (Conrad, 2026-07-11).

USE common_thread;

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

UPDATE schema_metadata
SET value = '0009'
WHERE `key` = 'schema_version';

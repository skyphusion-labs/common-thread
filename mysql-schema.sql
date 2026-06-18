-- ============================================
-- Common Thread - MySQL Schema
-- Compatible with Cloudflare Hyperdrive
-- ============================================

-- Use this database
CREATE DATABASE IF NOT EXISTS common_thread
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE common_thread;

-- ============================================
-- Core Tables
-- ============================================

-- Investigations
CREATE TABLE investigations (
    id              VARCHAR(255) PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    status          VARCHAR(50) DEFAULT 'active',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Seed Accounts (accounts being investigated)
CREATE TABLE seed_accounts (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    investigation_id    VARCHAR(255) NOT NULL,
    platform            VARCHAR(50) NOT NULL,
    account_identifier  VARCHAR(255) NOT NULL,
    basis_statement     TEXT,
    added_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_seed (investigation_id, platform, account_identifier),
    INDEX idx_investigation (investigation_id),
    INDEX idx_platform (platform),
    CONSTRAINT fk_seed_investigation 
        FOREIGN KEY (investigation_id) 
        REFERENCES investigations(id) 
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- Job Tracking (for heavy processing)
-- ============================================

CREATE TABLE ingest_jobs (
    job_id            VARCHAR(255) PRIMARY KEY,
    investigation_id  VARCHAR(255) NOT NULL,
    provider          VARCHAR(50) NOT NULL,           -- 'twitter', 'reddit', etc.
    status            VARCHAR(50) NOT NULL DEFAULT 'queued',
    item_count        INT,
    manifest_hashes   JSON,
    raw_file_hashes   JSON,
    container_name    VARCHAR(255),
    started_at        DATETIME,
    completed_at      DATETIME,
    error_message     TEXT,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_investigation (investigation_id),
    INDEX idx_status (status),
    INDEX idx_provider (provider),
    CONSTRAINT fk_job_investigation 
        FOREIGN KEY (investigation_id) 
        REFERENCES investigations(id) 
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- Extractor Run Tracking
-- ============================================

CREATE TABLE account_extractor_runs (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    job_id            VARCHAR(255),
    investigation_id  VARCHAR(255) NOT NULL,
    extractor_name    VARCHAR(100) NOT NULL,
    extractor_version VARCHAR(50),
    input_artifact_count INT DEFAULT 0,
    output_feature_count INT DEFAULT 0,
    duration_ms       INT,
    status            VARCHAR(50) DEFAULT 'completed',
    error_message     TEXT,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_investigation (investigation_id),
    INDEX idx_extractor (extractor_name),
    INDEX idx_job (job_id),
    CONSTRAINT fk_account_run_investigation 
        FOREIGN KEY (investigation_id) 
        REFERENCES investigations(id) 
        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE pair_extractor_runs (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    job_id            VARCHAR(255),
    investigation_id  VARCHAR(255) NOT NULL,
    extractor_name    VARCHAR(100) NOT NULL,
    extractor_version VARCHAR(50),
    account_count     INT,
    pair_count        INT,
    output_feature_count INT DEFAULT 0,
    duration_ms       INT,
    status            VARCHAR(50) DEFAULT 'completed',
    error_message     TEXT,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_investigation (investigation_id),
    INDEX idx_extractor (extractor_name),
    INDEX idx_job (job_id),
    CONSTRAINT fk_pair_run_investigation 
        FOREIGN KEY (investigation_id) 
        REFERENCES investigations(id) 
        ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================
-- Optional: Feature Storage (if you want to store results)
-- ============================================

-- You can expand these later. For now they are commented out.
-- Uncomment and adjust as needed when you start writing features.

-- CREATE TABLE account_features (
--     id                INT AUTO_INCREMENT PRIMARY KEY,
--     investigation_id  VARCHAR(255) NOT NULL,
--     account           VARCHAR(255) NOT NULL,
--     feature_type      VARCHAR(100) NOT NULL,
--     feature_key       VARCHAR(255),
--     feature_value     JSON,
--     extractor_name    VARCHAR(100),
--     created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
--     INDEX idx_investigation_account (investigation_id, account),
--     INDEX idx_feature_type (feature_type),
--     CONSTRAINT fk_account_feature_investigation 
--         FOREIGN KEY (investigation_id) 
--         REFERENCES investigations(id) 
--         ON DELETE CASCADE
-- ) ENGINE=InnoDB;

-- CREATE TABLE pair_features (
--     id                INT AUTO_INCREMENT PRIMARY KEY,
--     investigation_id  VARCHAR(255) NOT NULL,
--     account_a         VARCHAR(255) NOT NULL,
--     account_b         VARCHAR(255) NOT NULL,
--     feature_type      VARCHAR(100) NOT NULL,
--     feature_key       VARCHAR(255),
--     feature_value     JSON,
--     extractor_name    VARCHAR(100),
--     created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
--     INDEX idx_investigation (investigation_id),
--     INDEX idx_pair (account_a, account_b),
--     CONSTRAINT fk_pair_feature_investigation 
--         FOREIGN KEY (investigation_id) 
--         REFERENCES investigations(id) 
--         ON DELETE CASCADE
-- ) ENGINE=InnoDB;

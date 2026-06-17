-- 0006_create_ingest_jobs.sql
CREATE TABLE IF NOT EXISTS ingest_jobs (
    job_id TEXT PRIMARY KEY,
    investigation_id TEXT NOT NULL,
    provider TEXT NOT NULL,                    -- 'twitter', 'reddit', etc.
    status TEXT NOT NULL,                      -- 'queued', 'running', 'completed', 'failed'
    item_count INTEGER,
    manifest_hashes TEXT,                      -- JSON array
    raw_file_hashes TEXT,                      -- JSON array
    container_name TEXT,
    started_at TEXT,
    completed_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_investigation 
    ON ingest_jobs(investigation_id);

CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status 
    ON ingest_jobs(status);

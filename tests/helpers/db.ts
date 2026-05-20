/**
 * D1 seeding helpers for tests.
 *
 * Each helper returns the inserted row's primary key for use in
 * provenance chains and assertions. All ID parameters are strings
 * (text PK on investigations) or numbers (autoincrement PK elsewhere)
 * matching the schema.
 *
 * These helpers are intentionally low-level: one helper per table.
 * Composing them into scenario builders is the test's job, not the
 * helper's. Scenarios that get reused across many tests can graduate
 * to higher-level fixtures later.
 */

import type { ConfidenceBand, FeatureValue } from '../../implementation/schema/db-types';
import { packFeatureValue } from '../../implementation/schema/db-types';

// ---------------------------------------------------------------------------
// Investigation
// ---------------------------------------------------------------------------

export interface CreateInvestigationOpts {
  id: string;
  name?: string;
  description?: string;
  status?: 'active' | 'archived' | 'sealed';
  metadata?: Record<string, unknown>;
}

export async function createInvestigation(
  db: D1Database,
  opts: CreateInvestigationOpts
): Promise<string> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO investigations (id, name, description, status, created_at, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      opts.id,
      opts.name ?? `Test investigation ${opts.id}`,
      opts.description ?? null,
      opts.status ?? 'active',
      now,
      now,
      opts.metadata ? JSON.stringify(opts.metadata) : null
    )
    .run();
  return opts.id;
}

// ---------------------------------------------------------------------------
// Seed accounts
// ---------------------------------------------------------------------------

export interface AddSeedAccountOpts {
  investigationId: string;
  platform: string;
  account: string;
  basisStatement?: string;
  addedBy?: string;
}

export async function addSeedAccount(
  db: D1Database,
  opts: AddSeedAccountOpts
): Promise<number> {
  const res = await db
    .prepare(
      `INSERT INTO seed_accounts (
         investigation_id, platform, account_identifier, basis_statement,
         added_at, added_by
       ) VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      opts.investigationId,
      opts.platform,
      opts.account,
      opts.basisStatement ?? `seeded for test (${opts.account})`,
      new Date().toISOString(),
      opts.addedBy ?? 'test'
    )
    .run();
  return res.meta.last_row_id as number;
}

// ---------------------------------------------------------------------------
// Extractor runs
// ---------------------------------------------------------------------------

export interface StartExtractorRunOpts {
  investigationId: string;
  extractorName: string;
  extractorVersion?: string;
  manifestHash?: string;
  status?: 'running' | 'completed' | 'failed' | 'partial';
  errorMessage?: string | null;
}

export async function startExtractorRun(
  db: D1Database,
  opts: StartExtractorRunOpts
): Promise<number> {
  const now = new Date().toISOString();
  const status = opts.status ?? 'completed';
  const completedAt = status === 'running' ? null : now;
  const res = await db
    .prepare(
      `INSERT INTO extractor_runs (
         investigation_id, extractor_name, extractor_version,
         manifest_hash_at_run, started_at, completed_at, status,
         error_message
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      opts.investigationId,
      opts.extractorName,
      opts.extractorVersion ?? '1.0.0',
      opts.manifestHash ?? TEST_MANIFEST_HASH,
      now,
      completedAt,
      status,
      opts.errorMessage ?? null
    )
    .run();
  return res.meta.last_row_id as number;
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

export interface InsertAccountFeatureOpts {
  investigationId: string;
  platform: string;
  account: string;
  category: string;
  name: string;
  value: FeatureValue;
  extractorName?: string;
  extractorVersion?: string;
  extractorRunId?: number;
  /** If provided, insert a provenance row pointing at this artifact hash. */
  artifactHashes?: string[];
}

export async function insertAccountFeature(
  db: D1Database,
  opts: InsertAccountFeatureOpts
): Promise<number> {
  const packed = packFeatureValue(opts.value);
  const res = await db
    .prepare(
      `INSERT INTO account_features (
         investigation_id, platform, account_identifier,
         feature_category, feature_name,
         feature_value_text, feature_value_numeric, feature_value_json,
         extracted_at, extractor_name, extractor_version, extractor_run_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      opts.investigationId,
      opts.platform,
      opts.account,
      opts.category,
      opts.name,
      packed.feature_value_text,
      packed.feature_value_numeric,
      packed.feature_value_json,
      new Date().toISOString(),
      opts.extractorName ?? 'test_extractor',
      opts.extractorVersion ?? '1.0.0',
      opts.extractorRunId ?? null
    )
    .run();
  const id = res.meta.last_row_id as number;
  for (const hash of opts.artifactHashes ?? []) {
    await db
      .prepare(
        `INSERT INTO account_feature_provenance (account_feature_id, artifact_hash)
         VALUES (?, ?)`
      )
      .bind(id, hash)
      .run();
  }
  return id;
}

export interface InsertPairFeatureOpts {
  investigationId: string;
  platformA: string;
  platformB: string;
  accountA: string;
  accountB: string;
  category: string;
  name: string;
  value: FeatureValue;
  extractorName?: string;
  extractorVersion?: string;
  extractorRunId?: number;
  artifactHashes?: string[];
}

export async function insertPairFeature(
  db: D1Database,
  opts: InsertPairFeatureOpts
): Promise<number> {
  // The schema CHECK constraint requires account_a < account_b
  // lexicographically. Throw early in tests if a caller passes
  // pre-canonical order.
  if (!(opts.accountA < opts.accountB)) {
    throw new Error(
      `insertPairFeature requires accountA < accountB; got accountA='${opts.accountA}', accountB='${opts.accountB}'. The schema CHECK (account_a < account_b) will reject this.`
    );
  }
  const packed = packFeatureValue(opts.value);
  const res = await db
    .prepare(
      `INSERT INTO pair_features (
         investigation_id, platform_a, platform_b, account_a, account_b,
         feature_category, feature_name,
         feature_value_text, feature_value_numeric, feature_value_json,
         extracted_at, extractor_name, extractor_version, extractor_run_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      opts.investigationId,
      opts.platformA,
      opts.platformB,
      opts.accountA,
      opts.accountB,
      opts.category,
      opts.name,
      packed.feature_value_text,
      packed.feature_value_numeric,
      packed.feature_value_json,
      new Date().toISOString(),
      opts.extractorName ?? 'test_extractor',
      opts.extractorVersion ?? '1.0.0',
      opts.extractorRunId ?? null
    )
    .run();
  const id = res.meta.last_row_id as number;
  for (const hash of opts.artifactHashes ?? []) {
    await db
      .prepare(
        `INSERT INTO pair_feature_provenance (pair_feature_id, artifact_hash)
         VALUES (?, ?)`
      )
      .bind(id, hash)
      .run();
  }
  return id;
}

// ---------------------------------------------------------------------------
// Attribution runs (read helper for assertions)
// ---------------------------------------------------------------------------

export interface AttributionRunSnapshot {
  id: number;
  investigation_id: string;
  account_a: string;
  account_b: string;
  platform_a: string;
  platform_b: string;
  model_name: string;
  model_version: string;
  reasoning_prompt_version: string;
  input_feature_count: number;
  confidence_band: ConfidenceBand;
  output_summary: string;
  output_json: string;
  started_at: string;
  completed_at: string;
  manifest_hash_at_run: string;
}

export async function readAttributionRuns(
  db: D1Database,
  investigationId: string
): Promise<AttributionRunSnapshot[]> {
  const res = await db
    .prepare(
      `SELECT * FROM attribution_runs WHERE investigation_id = ? ORDER BY id ASC`
    )
    .bind(investigationId)
    .all<AttributionRunSnapshot>();
  return res.results ?? [];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Deterministic 64-hex-char manifest hash for use across tests. */
export const TEST_MANIFEST_HASH =
  'a'.repeat(64);

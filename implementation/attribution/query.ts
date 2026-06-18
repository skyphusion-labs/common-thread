/**
 * Attribution run queries for the HTTP API.
 */

import type { Hyperdrive } from '@cloudflare/workers-types';
import { query, queryOne } from '../db';
import type { AttributionRunRow, ConfidenceBand } from '../schema/db-types';

export interface AttributionRunSummaryRow {
  id: number;
  account_a: string;
  account_b: string;
  platform_a: string;
  platform_b: string;
  confidence_band: ConfidenceBand;
  output_summary: string;
  started_at: string;
  completed_at: string;
}

export type AttributionRunDetail = Omit<AttributionRunRow, 'output_json'> & {
  output: Record<string, unknown>;
};

export async function listAttributionRuns(
  db: Hyperdrive,
  investigationId: string
): Promise<AttributionRunSummaryRow[]> {
  return query<AttributionRunSummaryRow>(
    db,
    `SELECT id, account_a, account_b, platform_a, platform_b,
            confidence_band, output_summary, started_at, completed_at
     FROM attribution_runs
     WHERE investigation_id = ?
     ORDER BY id ASC`,
    [investigationId]
  );
}

export async function getAttributionRun(
  db: Hyperdrive,
  investigationId: string,
  runId: number
): Promise<AttributionRunDetail | null> {
  const row = await queryOne<AttributionRunRow>(
    db,
    `SELECT *
     FROM attribution_runs
     WHERE id = ? AND investigation_id = ?`,
    [runId, investigationId]
  );
  if (!row) return null;

  let output: Record<string, unknown> = {};
  try {
    output = JSON.parse(row.output_json) as Record<string, unknown>;
  } catch {
    output = { parse_error: true, raw: row.output_json };
  }

  const { output_json: _omit, ...summary } = row;
  return { ...summary, output };
}

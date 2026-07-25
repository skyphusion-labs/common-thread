/**
 * Attribution run queries for the HTTP API.
 */

import type { Hyperdrive } from '@cloudflare/workers-types';
import { query, queryOne } from '../db';
import type { AttributionRunRow, ConfidenceBand } from '../schema/db-types';
import { readTextCell } from '../crypto/feature-cells';

/**
 * Decrypt an attribution output cell (§3.5). Both output_summary and
 * output_json were written under the same AAD context; a legacy plaintext cell
 * passes through unchanged. `encKey` is null for a legacy investigation.
 */
function outputCtx(investigationId: string, key: CryptoKey | null) {
  return { key, investigationId, column: 'attribution_runs.output' };
}

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
  investigationId: string,
  encKey: CryptoKey | null = null
): Promise<AttributionRunSummaryRow[]> {
  const rows = await query<AttributionRunSummaryRow>(
    db,
    `SELECT id, account_a, account_b, platform_a, platform_b,
            confidence_band, output_summary, started_at, completed_at
     FROM attribution_runs
     WHERE investigation_id = ?
     ORDER BY id ASC`,
    [investigationId]
  );
  const ctx = outputCtx(investigationId, encKey);
  for (const row of rows) {
    row.output_summary = (await readTextCell(row.output_summary, ctx)) ?? '';
  }
  return rows;
}

export async function getAttributionRun(
  db: Hyperdrive,
  investigationId: string,
  runId: number,
  encKey: CryptoKey | null = null
): Promise<AttributionRunDetail | null> {
  const row = await queryOne<AttributionRunRow>(
    db,
    `SELECT *
     FROM attribution_runs
     WHERE id = ? AND investigation_id = ?`,
    [runId, investigationId]
  );
  if (!row) return null;

  const ctx = outputCtx(investigationId, encKey);
  const summaryText = (await readTextCell(row.output_summary, ctx)) ?? '';
  const outputJsonText = (await readTextCell(row.output_json, ctx)) ?? '';

  let output: Record<string, unknown> = {};
  try {
    output = JSON.parse(outputJsonText) as Record<string, unknown>;
  } catch {
    output = { parse_error: true, raw: outputJsonText };
  }

  const { output_json: _omit, ...summary } = row;
  return { ...summary, output_summary: summaryText, output };
}

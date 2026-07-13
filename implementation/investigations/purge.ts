/**
 * Hard-delete an active investigation and its MySQL graph (§3.1 cleanup).
 *
 * Sealed and archived investigations are immutable evidence records and cannot
 * be deleted through this path. Content-addressed R2 blobs are global dedup
 * storage; archive-purge.ts removes only the per-investigation manifest keys.
 */

import { execute } from '../db';
import { assertInvestigationActiveForWrite } from './write-guard';

const CHILD_TABLES = [
  'account_features',
  'pair_features',
  'event_features',
  'extractor_runs',
  'attribution_runs',
  'ingest_jobs',
  'attribution_jobs',
  'seed_accounts',
] as const;

export interface DeleteInvestigationResult {
  deleted: boolean;
  tablesPurged: string[];
}

/**
 * Delete all MySQL rows for an investigation. Refuses when the investigation
 * is not committed-active (same write-time seal enforcement as other mutations).
 */
export async function deleteInvestigationData(
  db: Hyperdrive,
  investigationId: string
): Promise<DeleteInvestigationResult> {
  await assertInvestigationActiveForWrite(db, investigationId);

  for (const table of CHILD_TABLES) {
    await execute(db, `DELETE FROM ${table} WHERE investigation_id = ?`, [investigationId]);
  }

  const result = (await execute(
    db,
    `DELETE FROM investigations WHERE id = ? AND status = 'active'`,
    [investigationId]
  )) as unknown as { affectedRows?: number };

  return {
    deleted: (result.affectedRows ?? 0) > 0,
    tablesPurged: [...CHILD_TABLES, 'investigations'],
  };
}

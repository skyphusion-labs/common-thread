/**
 * Write-time enforcement of investigation seal status (paper §3.1, §3.1.1).
 *
 * The capability guard (investigations/access.ts) authorizes a request by
 * reading investigations.status. In production that read is served through
 * Hyperdrive query caching, which can return a stale `active` for the cache
 * TTL after an investigation has been sealed. A guard that trusts the cached
 * read can therefore admit a mutation to an already-sealed investigation,
 * violating the immutable-archival / read-only-when-sealed contract that the
 * evidentiary framework rests on (§3.1 Chain of custody; §3.1.1 Immutable
 * archival before any transformation).
 *
 * This module enforces status at WRITE time, where the check cannot be
 * satisfied by the read cache:
 *
 *   - Discrete single-statement mutations gate on status inside the write
 *     statement itself (`INSERT ... SELECT`, `UPDATE ... WHERE status = active`).
 *     A write is never served from cache, so MySQL evaluates the predicate at
 *     the origin against committed state, atomically with the mutation.
 *   - Multi-statement / long-running mutations (attribution, ingest) that have
 *     no single gating statement call assertInvestigationActiveForWrite first,
 *     which reads committed status through readCommittedRow (an in-transaction
 *     `SELECT ... FOR UPDATE`, never cached).
 *
 * Conservative failure mode (house style): any non-active or missing status
 * refuses the mutation.
 */

import { execute, readCommittedRow, resolveDatabase, type DbResult } from '../db';
import { InvestigationAccessError } from './access';

/**
 * Throw InvestigationAccessError unless the investigation is committed-active.
 * Used by mutations that cannot be expressed as one status-gated statement.
 */
export async function assertInvestigationActiveForWrite(
  db: Hyperdrive,
  investigationId: string
): Promise<void> {
  const row = await readCommittedRow<{ status: string }>(
    db,
    'SELECT status FROM investigations WHERE id = ? FOR UPDATE',
    [investigationId]
  );
  if (!row) {
    throw new InvestigationAccessError(
      'not_found',
      `Investigation not found: ${investigationId}`
    );
  }
  if (row.status !== 'active') {
    throw new InvestigationAccessError(
      'read_only',
      `Investigation is ${row.status} and cannot be modified. Unseal is not supported; create a new investigation to continue work.`
    );
  }
}

/**
 * Seal the investigation only if it is currently committed-active.
 * Returns true when this call performed the active -> sealed transition,
 * false when the row was already non-active (idempotent re-seal / concurrent
 * seal). The `WHERE status = active` predicate makes the transition atomic.
 */
export async function sealInvestigationIfActive(
  db: Hyperdrive,
  investigationId: string,
  now: string
): Promise<boolean> {
  const result = (await execute(
    db,
    `UPDATE investigations SET status = 'sealed', updated_at = ?
     WHERE id = ? AND status = 'active'`,
    [now, investigationId]
  )) as unknown as { affectedRows?: number };
  return (result.affectedRows ?? 0) > 0;
}

export interface InsertSeedParams {
  investigationId: string;
  platform: string;
  account: string;
  basis: string;
  now: string;
  addedBy: string;
  isControl: number;
}

/**
 * Insert a seed row only if the investigation is committed-active. The
 * `INSERT ... SELECT ... WHERE status = active` gates the write on origin
 * state atomically. Returns true when a row was inserted, false when the
 * investigation was not active (sealed/archived).
 */
export async function insertSeedIfActive(
  db: Hyperdrive,
  p: InsertSeedParams
): Promise<boolean> {
  const result = (await execute(
    db,
    // Idempotent: skip the insert when an active seed with the same
    // (investigation, platform, account) already exists, so a re-run ingest
    // does not stack duplicate seed rows (which would otherwise self-pair in
    // attribution). Soft-deleted rows (removed_at set) are ignored, so a
    // removed seed can still be re-added.
    `INSERT INTO seed_accounts (
       investigation_id, platform, account_identifier, basis_statement,
       added_at, added_by, is_control
     )
     SELECT ?, ?, ?, ?, ?, ?, ?
     FROM investigations
     WHERE id = ? AND status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM seed_accounts s
         WHERE s.investigation_id = ?
           AND s.platform = ?
           AND s.account_identifier = ?
           AND s.removed_at IS NULL
       )`,
    [
      p.investigationId,
      p.platform,
      p.account,
      p.basis,
      p.now,
      p.addedBy,
      p.isControl,
      p.investigationId,
      p.investigationId,
      p.platform,
      p.account,
    ]
  )) as unknown as { affectedRows?: number };
  return (result.affectedRows ?? 0) > 0;
}

export interface SoftDeleteSeedParams {
  investigationId: string;
  platform: string;
  account: string;
  now: string;
  reason: string;
}

/**
 * Soft-delete a seed (§5.1) only if the investigation is committed-active.
 * The `EXISTS (... status = active)` predicate gates the write at the origin.
 * Returns the number of rows updated; 0 means either no matching active seed
 * or the investigation is not active. Callers that have already confirmed an
 * active seed exists treat 0 as a seal refusal.
 */
export async function softDeleteSeedIfActive(
  db: Hyperdrive,
  p: SoftDeleteSeedParams
): Promise<number> {
  const dbClient = resolveDatabase(db);
  const result: DbResult = await dbClient
    .prepare(
      `UPDATE seed_accounts
       SET removed_at = ?, removed_reason = ?
       WHERE investigation_id = ?
         AND platform = ?
         AND account_identifier = ?
         AND removed_at IS NULL
         AND EXISTS (
           SELECT 1 FROM investigations i
           WHERE i.id = ? AND i.status = 'active'
         )`
    )
    .bind(
      p.now,
      p.reason,
      p.investigationId,
      p.platform,
      p.account,
      p.investigationId
    )
    .run();
  return result.meta.changes;
}

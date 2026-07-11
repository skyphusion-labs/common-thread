/**
 * Seal is enforced at WRITE time, not only at the capability guard.
 *
 * The requireWrite guard (investigations/access.ts) reads investigations.status
 * through Hyperdrive query caching, which can serve a stale `active` for the
 * cache TTL after a seal commits. These tests pin that every seal-sensitive
 * mutation refuses on committed-sealed status at the DB-enforcement layer, so a
 * stale-active guard read can no longer admit a write (§3.1 immutable
 * archival). The DB-layer cases exercise the enforcement functions directly:
 * that is exactly the situation where the (stale) guard read admitted the
 * request, so the write layer must be the backstop.
 */
import { describe, expect, it } from 'vitest';
import { env, testDb } from '../helpers/test-env';
import worker from '../../implementation/workers/index';
import { createInvestigation, addSeedAccount } from '../helpers/db';
import {
  assertInvestigationActiveForWrite,
  insertSeedIfActive,
  sealInvestigationIfActive,
  softDeleteSeedIfActive,
} from '../../implementation/investigations/write-guard';
import { InvestigationAccessError } from '../../implementation/investigations/access';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function statusOf(id: string): Promise<string | null> {
  const row = await testDb()
    .prepare('SELECT status FROM investigations WHERE id = ?')
    .bind(id)
    .first<{ status: string }>();
  return row?.status ?? null;
}

async function activeSeedCount(id: string): Promise<number> {
  const row = await testDb()
    .prepare(
      'SELECT COUNT(*) AS c FROM seed_accounts WHERE investigation_id = ? AND removed_at IS NULL'
    )
    .bind(id)
    .first<{ c: number }>();
  return Number(row?.c ?? 0);
}

describe('write-guard: DB-enforcement layer (guard read assumed stale-active)', () => {
  it('assertInvestigationActiveForWrite refuses a committed-sealed investigation', async () => {
    const id = uid('wg-assert-sealed');
    await createInvestigation(testDb(), { id, status: 'sealed' });
    await expect(
      assertInvestigationActiveForWrite(env.DB, id)
    ).rejects.toMatchObject({ code: 'read_only' });
    await expect(
      assertInvestigationActiveForWrite(env.DB, id)
    ).rejects.toBeInstanceOf(InvestigationAccessError);
  });

  it('assertInvestigationActiveForWrite refuses an archived investigation', async () => {
    const id = uid('wg-assert-archived');
    await createInvestigation(testDb(), { id, status: 'archived' });
    await expect(
      assertInvestigationActiveForWrite(env.DB, id)
    ).rejects.toMatchObject({ code: 'read_only' });
  });

  it('assertInvestigationActiveForWrite reports not_found for a missing investigation', async () => {
    await expect(
      assertInvestigationActiveForWrite(env.DB, uid('wg-missing'))
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('assertInvestigationActiveForWrite resolves for an active investigation', async () => {
    const id = uid('wg-assert-active');
    await createInvestigation(testDb(), { id, status: 'active' });
    await expect(
      assertInvestigationActiveForWrite(env.DB, id)
    ).resolves.toBeUndefined();
  });

  it('insertSeedIfActive inserts nothing on a sealed investigation', async () => {
    const id = uid('wg-addseed-sealed');
    await createInvestigation(testDb(), { id, status: 'sealed' });
    const inserted = await insertSeedIfActive(env.DB, {
      investigationId: id,
      platform: 'twitter',
      account: 'acct',
      basis: 'test',
      now: new Date().toISOString(),
      addedBy: 'test',
      isControl: 0,
    });
    expect(inserted).toBe(false);
    expect(await activeSeedCount(id)).toBe(0);
  });

  it('insertSeedIfActive inserts on an active investigation', async () => {
    const id = uid('wg-addseed-active');
    await createInvestigation(testDb(), { id, status: 'active' });
    const inserted = await insertSeedIfActive(env.DB, {
      investigationId: id,
      platform: 'twitter',
      account: 'acct',
      basis: 'test',
      now: new Date().toISOString(),
      addedBy: 'test',
      isControl: 0,
    });
    expect(inserted).toBe(true);
    expect(await activeSeedCount(id)).toBe(1);
  });

  it('softDeleteSeedIfActive changes nothing on a sealed investigation', async () => {
    const id = uid('wg-delseed-sealed');
    // Seed while active, then seal, then attempt the soft-delete.
    await createInvestigation(testDb(), { id, status: 'active' });
    await addSeedAccount(testDb(), { investigationId: id, platform: 'twitter', account: 'acct' });
    await sealInvestigationIfActive(env.DB, id, new Date().toISOString());
    const changes = await softDeleteSeedIfActive(env.DB, {
      investigationId: id,
      platform: 'twitter',
      account: 'acct',
      now: new Date().toISOString(),
      reason: 'test',
    });
    expect(changes).toBe(0);
    expect(await activeSeedCount(id)).toBe(1);
  });

  it('softDeleteSeedIfActive soft-deletes on an active investigation', async () => {
    const id = uid('wg-delseed-active');
    await createInvestigation(testDb(), { id, status: 'active' });
    await addSeedAccount(testDb(), { investigationId: id, platform: 'twitter', account: 'acct' });
    const changes = await softDeleteSeedIfActive(env.DB, {
      investigationId: id,
      platform: 'twitter',
      account: 'acct',
      now: new Date().toISOString(),
      reason: 'test',
    });
    expect(changes).toBe(1);
    expect(await activeSeedCount(id)).toBe(0);
  });

  it('sealInvestigationIfActive is atomic and idempotent', async () => {
    const id = uid('wg-seal');
    await createInvestigation(testDb(), { id, status: 'active' });
    const first = await sealInvestigationIfActive(env.DB, id, new Date().toISOString());
    expect(first).toBe(true);
    expect(await statusOf(id)).toBe('sealed');
    // Second call sees committed-sealed and performs no transition.
    const second = await sealInvestigationIfActive(env.DB, id, new Date().toISOString());
    expect(second).toBe(false);
    expect(await statusOf(id)).toBe('sealed');
  });
});

describe('sealed investigation refuses every guarded mutation end-to-end', () => {
  async function sealedFixture() {
    const id = uid('seal-e2e');
    const { accessToken } = await createInvestigation(testDb(), { id, status: 'active' });
    const headers = { 'X-Investigation-Token': accessToken };
    // Seal through the API so the seal path itself is exercised.
    const sealRes = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/seal`, { method: 'POST', headers }),
      env
    );
    expect(sealRes.status).toBe(200);
    expect(await statusOf(id)).toBe('sealed');
    return { id, headers };
  }

  it('POST /seeds is refused', async () => {
    const { id, headers } = await sealedFixture();
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/seeds`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'twitter', account: 'nope' }),
      }),
      env
    );
    expect(res.status).toBe(403);
    expect((await res.json() as { code?: string }).code).toBe('read_only');
    expect(await activeSeedCount(id)).toBe(0);
  });

  it('DELETE /seeds is refused (seed added before seal survives)', async () => {
    const id = uid('seal-del-e2e');
    const { accessToken } = await createInvestigation(testDb(), { id, status: 'active' });
    const headers = { 'X-Investigation-Token': accessToken };
    await addSeedAccount(testDb(), { investigationId: id, platform: 'twitter', account: 'acct' });
    await worker.fetch(
      new Request(`http://localhost/investigations/${id}/seal`, { method: 'POST', headers }),
      env
    );
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/seeds`, {
        method: 'DELETE',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: 'twitter', account: 'acct' }),
      }),
      env
    );
    expect(res.status).toBe(403);
    expect((await res.json() as { code?: string }).code).toBe('read_only');
    expect(await activeSeedCount(id)).toBe(1);
  });

  it('POST /attribute is refused', async () => {
    const { id, headers } = await sealedFixture();
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/attribute`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
      env
    );
    expect(res.status).toBe(403);
    expect((await res.json() as { code?: string }).code).toBe('read_only');
  });

  it('POST /ingest/apify-twitter is refused', async () => {
    const { id, headers } = await sealedFixture();
    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${id}/ingest/apify-twitter`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify([]),
      }),
      env
    );
    expect(res.status).toBe(403);
    expect((await res.json() as { code?: string }).code).toBe('read_only');
  });

});

import { describe, expect, it } from 'vitest';
import worker from '../../implementation/workers/index';
import { investigationManifestPath } from '../../implementation/archive/paths';
import { createInvestigation, addSeedAccount } from '../helpers/db';
import { env, testDb } from '../helpers/test-env';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

describe('DELETE /investigations/:id', () => {
  it('hard-deletes an active investigation and manifest sidecars', async () => {
    const id = uid('del-active');
    const { accessToken } = await createInvestigation(testDb(), { id });
    await addSeedAccount(testDb(), {
      investigationId: id,
      platform: 'twitter',
      account: 'alpha',
    });
    await env.ARCHIVE.put(
      investigationManifestPath(id),
      new TextEncoder().encode('{"hash":"sample"}\n')
    );

    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${id}`, {
        method: 'DELETE',
        headers: { 'X-Investigation-Token': accessToken },
      }),
      env
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      deleted: boolean;
      tables_purged: string[];
      archive_keys_deleted: string[];
    };
    expect(body.deleted).toBe(true);
    expect(body.tables_purged).toContain('investigations');
    expect(body.archive_keys_deleted).toContain(investigationManifestPath(id));

    const inv = await testDb()
      .prepare('SELECT id FROM investigations WHERE id = ?')
      .bind(id)
      .first();
    expect(inv).toBeNull();
    const seeds = await testDb()
      .prepare('SELECT COUNT(*) AS c FROM seed_accounts WHERE investigation_id = ?')
      .bind(id)
      .first<{ c: number }>();
    expect(Number(seeds?.c ?? 0)).toBe(0);
    expect(await env.ARCHIVE.head(investigationManifestPath(id))).toBeNull();
  });

  it('refuses deletion for a sealed investigation', async () => {
    const id = uid('del-sealed');
    const { accessToken } = await createInvestigation(testDb(), { id, status: 'sealed' });

    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${id}`, {
        method: 'DELETE',
        headers: { 'X-Investigation-Token': accessToken },
      }),
      env
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('read_only');
  });
});

/**
 * HTTP reject paths for #189 hard caps (node-db: real MySQL + worker.fetch).
 */
import { describe, expect, it } from 'vitest';
import { env, testDb } from '../helpers/test-env';
import worker from '../../implementation/workers/index';
import type { Env } from '../../implementation/workers/index';
import { createInvestigation, addSeedAccount, insertAccountFeature } from '../helpers/db';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function cappedEnv(overrides: Partial<Env>): Env {
  return { ...env, ...overrides };
}

describe('resource caps HTTP (#189)', () => {
  it('POST /seeds returns 400 seed_cap_exceeded when at MAX_SEED_ACCOUNTS', async () => {
    const created = await createInvestigation(testDb(), { id: uid('cap-seed') });
    const e = cappedEnv({ MAX_SEED_ACCOUNTS: '2' });

    for (const account of ['alice', 'bob']) {
      const res = await worker.fetch(
        new Request(`http://localhost/investigations/${created.id}/seeds`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${created.accessToken}`,
          },
          body: JSON.stringify({ platform: 'twitter', account }),
        }),
        e
      );
      expect(res.status).toBe(201);
    }

    const blocked = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/seeds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify({ platform: 'twitter', account: 'carol' }),
      }),
      e
    );
    expect(blocked.status).toBe(400);
    const body = (await blocked.json()) as {
      error: string;
      limit: number;
      attempted: number;
    };
    expect(body.error).toBe('seed_cap_exceeded');
    expect(body.limit).toBe(2);
    expect(body.attempted).toBe(2);
  });

  it('POST /ingest/apify-twitter returns 400 ingest_cap_exceeded', async () => {
    const created = await createInvestigation(testDb(), { id: uid('cap-ingest') });
    const e = cappedEnv({ MAX_INGEST_ITEMS: '3' });
    const items = [
      { id: '1', user: { userName: 'a' } },
      { id: '2', user: { userName: 'b' } },
      { id: '3', user: { userName: 'c' } },
      { id: '4', user: { userName: 'd' } },
    ];

    const res = await worker.fetch(
      new Request(
        `http://localhost/investigations/${created.id}/ingest/apify-twitter`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${created.accessToken}`,
          },
          body: JSON.stringify(items),
        }
      ),
      e
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; attempted: number };
    expect(body.error).toBe('ingest_cap_exceeded');
    expect(body.attempted).toBe(4);
  });

  it('POST /attribute returns 400 pair_cap_exceeded before LLM work', async () => {
    const created = await createInvestigation(testDb(), { id: uid('cap-pairs') });
    // 3 accounts → 3 pairs; cap at 2 so full run is refused without gateway.
    for (const account of ['alice', 'bob', 'carol']) {
      await addSeedAccount(testDb(), {
        investigationId: created.id,
        platform: 'twitter',
        account,
      });
    }

    const e = cappedEnv({
      MAX_ATTRIBUTION_PAIRS: '2',
      // Ensure we would have credentials if the cap did not fire first.
      PUBLIC_BYOK_ONLY: undefined,
    });

    const res = await worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/attribute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify({}),
      }),
      e
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      limit: number;
      attempted: number;
    };
    expect(body.error).toBe('pair_cap_exceeded');
    expect(body.limit).toBe(2);
    expect(body.attempted).toBe(3);
  });
});

describe('resource caps HTTP: pair cap with accountFilter (#189)', () => {
  async function attributeWithFilter(
    created: { id: string; accessToken: string },
    accountFilter: string[],
    maxPairs: string
  ): Promise<Response> {
    return worker.fetch(
      new Request(`http://localhost/investigations/${created.id}/attribute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${created.accessToken}`,
        },
        body: JSON.stringify({ accountFilter }),
      }),
      cappedEnv({ MAX_ATTRIBUTION_PAIRS: maxPairs, PUBLIC_BYOK_ONLY: undefined })
    );
  }

  it('counts soft-removed seeds the runner resolves through accountFilter', async () => {
    const created = await createInvestigation(testDb(), { id: uid('cap-filter-removed') });
    for (const account of ['alice', 'bob', 'carol']) {
      await addSeedAccount(testDb(), {
        investigationId: created.id,
        platform: 'twitter',
        account,
      });
    }
    await testDb()
      .prepare(
        `UPDATE seed_accounts SET removed_at = ? WHERE investigation_id = ?`
      )
      .bind(new Date().toISOString(), created.id)
      .run();

    // All three seeds are removed, but the filter path still resolves them
    // (3 accounts, 3 pairs), so a cap of 2 must refuse the run.
    const res = await attributeWithFilter(created, ['alice', 'bob', 'carol'], '2');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; limit: number; attempted: number };
    expect(body.error).toBe('pair_cap_exceeded');
    expect(body.limit).toBe(2);
    expect(body.attempted).toBe(3);
  });

  it('counts filter accounts resolved from account_features fallback', async () => {
    const created = await createInvestigation(testDb(), { id: uid('cap-filter-features') });
    for (const account of ['alice', 'bob', 'carol']) {
      await insertAccountFeature(testDb(), {
        investigationId: created.id,
        platform: 'twitter',
        account,
        category: 'stylometric',
        name: 'avg_word_length',
        value: { kind: 'numeric', value: 4.2 },
      });
    }

    const res = await attributeWithFilter(created, ['alice', 'bob', 'carol'], '2');
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; attempted: number };
    expect(body.error).toBe('pair_cap_exceeded');
    expect(body.attempted).toBe(3);
  });

  it('does not refuse a filtered set that fits under the cap', async () => {
    const created = await createInvestigation(testDb(), { id: uid('cap-filter-fits') });
    for (const account of ['alice', 'bob', 'carol']) {
      await addSeedAccount(testDb(), {
        investigationId: created.id,
        platform: 'twitter',
        account,
      });
    }

    // 2 of 3 accounts = 1 pair, under the cap of 2: the cap must not fire.
    const res = await attributeWithFilter(created, ['alice', 'bob'], '2');
    expect(await res.text()).not.toContain('pair_cap_exceeded');
  });
});

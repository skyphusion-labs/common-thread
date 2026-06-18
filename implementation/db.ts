// implementation/db.ts

import type { Env } from './workers/index';

export async function getConnection(env: Env) {
  return await env.DB.connect();
}

export async function execute(env: Env, sql: string, params: any[] = []) {
  const conn = await getConnection(env);
  try {
    const [result] = await conn.execute(sql, params);
    return result;
  } finally {
    await conn.end();
  }
}

export async function query<T = any>(env: Env, sql: string, params: any[] = []): Promise<T[]> {
  const conn = await getConnection(env);
  try {
    const [rows] = await conn.query(sql, params);
    return rows as T[];
  } finally {
    await conn.end();
  }
}

export async function queryOne<T = any>(env: Env, sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(env, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Database access for Hyperdrive (MySQL) with a D1-compatible prepare/bind API
 * so extractors and the reasoner can run unchanged.
 *
 * Tests continue to use native D1 via vitest; production uses Hyperdrive.
 */

import mysql from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

interface MysqlQueryable {
  execute(
    sql: string,
    values?: unknown[]
  ): Promise<[ResultSetHeader | RowDataPacket[], unknown]>;
  query<T extends RowDataPacket[]>(
    sql: string,
    values?: unknown[]
  ): Promise<[T, unknown]>;
  end(): Promise<void>;
}

/** Result shape returned by prepare().run() / .all(). */
export interface DbResult<T = Record<string, unknown>> {
  success: boolean;
  meta: {
    changes: number;
    last_row_id: number;
    duration: number;
  };
  results?: T[];
}

/** Subset of D1Database used by extractors, reasoner, and tests. */
export interface DatabaseClient {
  prepare(query: string): PreparedStatement;
}

export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  run(): Promise<DbResult>;
  all<T = Record<string, unknown>>(): Promise<DbResult<T>>;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
}

export function resolveDatabase(db: Hyperdrive | D1Database): DatabaseClient {
  if (isD1Database(db)) {
    return db;
  }
  return new HyperdriveDatabase(db);
}

function isD1Database(db: Hyperdrive | D1Database): db is D1Database {
  return typeof (db as D1Database).prepare === 'function';
}

export async function createMysqlConnection(hyperdrive: Hyperdrive): Promise<MysqlQueryable> {
  return mysql.createConnection({
    host: hyperdrive.host,
    user: hyperdrive.user,
    password: hyperdrive.password,
    database: hyperdrive.database,
    port: hyperdrive.port,
    disableEval: true,
  }) as unknown as MysqlQueryable;
}

export async function execute(hyperdrive: Hyperdrive, sql: string, params: unknown[] = []) {
  const conn = await createMysqlConnection(hyperdrive);
  try {
    const [result] = await conn.execute(sql, params);
    return result;
  } finally {
    await conn.end();
  }
}

export async function query<T = Record<string, unknown>>(
  hyperdrive: Hyperdrive,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const conn = await createMysqlConnection(hyperdrive);
  try {
    const [rows] = await conn.query<RowDataPacket[]>(sql, params);
    return rows as T[];
  } finally {
    await conn.end();
  }
}

export async function queryOne<T = Record<string, unknown>>(
  hyperdrive: Hyperdrive,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(hyperdrive, sql, params);
  return rows.length > 0 ? rows[0] : null;
}

class HyperdriveDatabase implements DatabaseClient {
  constructor(private hyperdrive: Hyperdrive) {}

  prepare(sql: string): PreparedStatement {
    return new HyperdrivePreparedStatement(this.hyperdrive, sql);
  }
}

class HyperdrivePreparedStatement implements PreparedStatement {
  private bindings: unknown[] = [];

  constructor(
    private hyperdrive: Hyperdrive,
    private sql: string
  ) {}

  bind(...values: unknown[]): PreparedStatement {
    this.bindings = values;
    return this;
  }

  async run(): Promise<DbResult> {
    const conn = await createMysqlConnection(this.hyperdrive);
    try {
      const [result] = await conn.execute(this.sql, this.bindings);
      const header = result as ResultSetHeader;
      return {
        success: true,
        meta: {
          changes: header.affectedRows,
          last_row_id: header.insertId,
          duration: 0,
        },
        results: [],
      };
    } finally {
      await conn.end();
    }
  }

  async all<T = Record<string, unknown>>(): Promise<DbResult<T>> {
    const conn = await createMysqlConnection(this.hyperdrive);
    try {
      const [rows] = await conn.query<RowDataPacket[]>(this.sql, this.bindings);
      return {
        success: true,
        meta: {
          changes: 0,
          last_row_id: 0,
          duration: 0,
        },
        results: rows as T[],
      };
    } finally {
      await conn.end();
    }
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const res = await this.all<T>();
    const row = res.results?.[0] ?? null;
    if (!row) return null;
    if (colName && typeof row === 'object') {
      return (row as Record<string, unknown>)[colName] as T;
    }
    return row;
  }
}

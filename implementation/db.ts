/**
 * Database access for Hyperdrive (MySQL).
 *
 * Exposes a small prepare/bind API used by extractors, the reasoner,
 * and tests. Production connects via Hyperdrive; tests use the same
 * client with a direct mysql2 connection string (TEST_MYSQL_URL).
 *
 * Hyperdrive does not support COM_STMT_PREPARE — use query(), not execute().
 */

import mysql from 'mysql2/promise';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';

interface MysqlQueryable {
  query<T extends RowDataPacket[] | ResultSetHeader>(
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

export interface DatabaseClient {
  prepare(query: string): PreparedStatement;
}

export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  run(): Promise<DbResult>;
  all<T = Record<string, unknown>>(): Promise<DbResult<T>>;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
}

export interface MysqlConnectionConfig {
  host: string;
  user: string;
  password: string;
  database: string;
  port: number;
}

export function hyperdriveToConfig(hyperdrive: Hyperdrive): MysqlConnectionConfig {
  return {
    host: hyperdrive.host,
    user: hyperdrive.user,
    password: hyperdrive.password,
    database: hyperdrive.database,
    port: hyperdrive.port,
  };
}

/** Parse a mysql:// or mysql2:// connection URL. */
export function parseMysqlUrl(url: string): MysqlConnectionConfig {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ''),
  };
}

export function resolveDatabase(hyperdrive: Hyperdrive): DatabaseClient {
  return createDatabaseClient(hyperdriveToConfig(hyperdrive));
}

export function createDatabaseClient(config: MysqlConnectionConfig): DatabaseClient {
  return new MysqlDatabase(config);
}

export async function createMysqlConnection(
  config: MysqlConnectionConfig
): Promise<MysqlQueryable> {
  return mysql.createConnection({
    host: config.host,
    user: config.user,
    password: config.password,
    database: config.database,
    port: config.port,
    disableEval: true,
  }) as unknown as MysqlQueryable;
}

export async function execute(hyperdrive: Hyperdrive, sql: string, params: unknown[] = []) {
  const conn = await createMysqlConnection(hyperdriveToConfig(hyperdrive));
  try {
    const [result] = await conn.query(sql, params);
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
  const conn = await createMysqlConnection(hyperdriveToConfig(hyperdrive));
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

/**
 * Read a single row's committed value with an origin (uncached) read.
 *
 * Hyperdrive serves ordinary read-only SELECTs from its query cache (a
 * configured TTL), so a plain query() can return a stale value for the TTL
 * after a committed write. Queries issued inside an explicit transaction are
 * never cached, and `SELECT ... FOR UPDATE` is a locking read that must reach
 * the origin (and serializes against a concurrent UPDATE of the same row).
 * This helper wraps such a read so write-time guards observe committed state
 * rather than a cached copy. Returns null when the row does not exist.
 */
export async function readCommittedRow<T = Record<string, unknown>>(
  hyperdrive: Hyperdrive,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const conn = await createMysqlConnection(hyperdriveToConfig(hyperdrive));
  try {
    await conn.query<ResultSetHeader>('START TRANSACTION');
    let rows: RowDataPacket[];
    try {
      [rows] = await conn.query<RowDataPacket[]>(sql, params);
      await conn.query<ResultSetHeader>('COMMIT');
    } catch (err) {
      await conn.query<ResultSetHeader>('ROLLBACK').catch(() => {});
      throw err;
    }
    return rows.length > 0 ? (rows[0] as T) : null;
  } finally {
    await conn.end();
  }
}

class MysqlDatabase implements DatabaseClient {
  constructor(private config: MysqlConnectionConfig) {}

  prepare(sql: string): PreparedStatement {
    return new MysqlPreparedStatement(this.config, sql);
  }
}

class MysqlPreparedStatement implements PreparedStatement {
  private bindings: unknown[] = [];

  constructor(
    private config: MysqlConnectionConfig,
    private sql: string
  ) {}

  bind(...values: unknown[]): PreparedStatement {
    this.bindings = values;
    return this;
  }

  async run(): Promise<DbResult> {
    const conn = await createMysqlConnection(this.config);
    try {
      const [result] = await conn.query(this.sql, this.bindings);
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
    const conn = await createMysqlConnection(this.config);
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

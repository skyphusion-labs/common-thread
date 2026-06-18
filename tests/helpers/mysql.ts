/**
 * MySQL test database helpers.
 *
 * Integration tests connect to a real MySQL instance via TEST_MYSQL_URL
 * (default mysql://root@127.0.0.1:3306/common_thread_test).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';
import {
  createDatabaseClient,
  parseMysqlUrl,
  type DatabaseClient,
  type MysqlConnectionConfig,
} from '../../implementation/db';

const DEFAULT_TEST_URL =
  'mysql://root@127.0.0.1:3306/common_thread_test';

let testDb: DatabaseClient | null = null;

export function testMysqlUrl(): string {
  return process.env.TEST_MYSQL_URL ?? DEFAULT_TEST_URL;
}

export function testMysqlConfig(): MysqlConnectionConfig {
  return parseMysqlUrl(testMysqlUrl());
}

export function getTestDatabase(): DatabaseClient {
  if (!testDb) {
    testDb = createDatabaseClient(testMysqlConfig());
  }
  return testDb;
}

/**
 * Ensure the test database exists and core tables are present.
 * Idempotent: skips when investigations already exists.
 */
export async function applyTestSchema(): Promise<void> {
  const config = testMysqlConfig();
  const admin = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    multipleStatements: true,
  });

  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await admin.end();
  }

  const db = getTestDatabase();
  const existing = await db
    .prepare(
      `SELECT TABLE_NAME AS name
       FROM information_schema.tables
       WHERE table_schema = ? AND table_name = 'investigations'
       LIMIT 1`
    )
    .bind(config.database)
    .first<{ name: string }>();

  if (existing?.name === 'investigations') {
    return;
  }

  const schemaPath = join(process.cwd(), 'mysql-schema.sql');
  let sql = readFileSync(schemaPath, 'utf8');
  sql = sql
    .replace(/CREATE DATABASE IF NOT EXISTS[\s\S]*?;/i, '')
    .replace(/USE common_thread\s*;/i, '')
    .replace(/INSERT INTO schema_metadata[\s\S]*?;/gi, '');

  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    multipleStatements: true,
  });

  try {
    await conn.query(sql);
  } finally {
    await conn.end();
  }
}

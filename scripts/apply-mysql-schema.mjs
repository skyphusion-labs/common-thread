#!/usr/bin/env node
/**
 * Apply mysql-schema.sql to a MySQL database.
 *
 * Usage:
 *   MYSQL_URL=mysql://user:pass@host:3306/common_thread npm run db:migrate
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const url = process.env.MYSQL_URL ?? process.argv[2];
if (!url) {
  console.error('Set MYSQL_URL or pass a mysql:// connection string as the first argument.');
  process.exit(1);
}

const parsed = new URL(url);
const database = parsed.pathname.replace(/^\//, '');
const config = {
  host: parsed.hostname,
  port: parsed.port ? Number(parsed.port) : 3306,
  user: decodeURIComponent(parsed.username),
  password: decodeURIComponent(parsed.password),
};

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, '..', 'mysql-schema.sql');
const sql = readFileSync(schemaPath, 'utf8');

const admin = await mysql.createConnection({ ...config, multipleStatements: true });
try {
  await admin.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
} finally {
  await admin.end();
}

const conn = await mysql.createConnection({ ...config, database, multipleStatements: true });
try {
  await conn.query(sql);
  console.log(`Applied schema to ${database}`);
} finally {
  await conn.end();
}

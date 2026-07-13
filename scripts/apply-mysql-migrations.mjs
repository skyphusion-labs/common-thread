#!/usr/bin/env node
/**
 * Apply pending mysql-migrations/*.sql incrementally (vivijure D1 migrations pattern).
 *
 * Tracks applied state via schema_metadata.schema_version. Only migrations with a
 * version number greater than the current schema_version run. Fresh installs that
 * use mysql-schema.sql at the latest version skip all pending files.
 *
 * Usage:
 *   MYSQL_URL=mysql://user:pass@host:3306/common_thread node scripts/apply-mysql-migrations.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { parseMysqlUrl } from './lib/mysql-url.mjs';

const url = process.env.MYSQL_URL ?? process.argv[2];
if (!url) {
  console.error('Set MYSQL_URL or pass a mysql:// connection string as the first argument.');
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const migrationsDir = join(repoRoot, 'mysql-migrations');
const schemaPath = join(repoRoot, 'mysql-schema.sql');

function listMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
}

function migrationVersion(filename) {
  return Number.parseInt(filename.slice(0, 4), 10);
}

function formatVersion(version) {
  return String(version).padStart(4, '0');
}

function readSquashedSchemaVersion() {
  const sql = readFileSync(schemaPath, 'utf8');
  const match = sql.match(
    /INSERT INTO schema_metadata[\s\S]*?\('schema_version',\s*'(\d{4})'/i
  );
  if (!match) {
    throw new Error('Could not read squashed schema_version from mysql-schema.sql');
  }
  return Number.parseInt(match[1], 10);
}

function prepareMigrationSql(sql) {
  return sql.replace(/^\s*USE\s+[\w`]+\s*;\s*/im, '').trim();
}

async function readCurrentVersion(conn) {
  const [tables] = await conn.query(
    `SELECT TABLE_NAME AS name
     FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'schema_metadata'
     LIMIT 1`
  );

  if (tables.length === 0) {
    return null;
  }

  const [rows] = await conn.query(
    `SELECT value FROM schema_metadata WHERE \`key\` = 'schema_version' LIMIT 1`
  );

  if (rows.length === 0) {
    // Legacy test bootstrap applied mysql-schema.sql without schema_metadata rows.
    return readSquashedSchemaVersion();
  }

  return Number.parseInt(String(rows[0].value), 10);
}

async function applyPendingMigrations(conn) {
  let current = await readCurrentVersion(conn);
  if (current === null) {
    console.error('schema_metadata table is missing; run scripts/apply-mysql-schema.mjs first.');
    process.exit(1);
  }

  const migrations = listMigrations();
  let applied = 0;

  for (const file of migrations) {
    const version = migrationVersion(file);
    if (version <= current) {
      continue;
    }

    const sql = prepareMigrationSql(readFileSync(join(migrationsDir, file), 'utf8'));
    console.log(`Applying migration ${file}...`);
    await conn.query(sql);

    const next = await readCurrentVersion(conn);
    if (next === null || next < version) {
      throw new Error(
        `Migration ${file} did not advance schema_version to ${formatVersion(version)}`
      );
    }

    current = next;
    applied += 1;
  }

  if (applied === 0) {
    console.log(`Schema at ${formatVersion(current)}; no pending migrations`);
  } else {
    console.log(`Applied ${applied} migration(s); schema_version ${formatVersion(current)}`);
  }
}

const { database, config } = parseMysqlUrl(url);
const conn = await mysql.createConnection({
  ...config,
  database,
  multipleStatements: true,
});

try {
  await applyPendingMigrations(conn);
} finally {
  await conn.end();
}

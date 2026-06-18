# Common Thread MySQL schema

Relational storage uses **MySQL** via Cloudflare Hyperdrive. The canonical
schema lives at the repository root:

- [`mysql-schema.sql`](../../mysql-schema.sql) — full database (fresh install)
- [`mysql-migrations/`](../../mysql-migrations/) — incremental ALTER scripts

TypeScript row types: [`db-types.ts`](db-types.ts).

## Apply schema

```bash
# Fresh database
MYSQL_URL='mysql://user:pass@host:3306/common_thread' npm run db:migrate

# Or manually
mysql -h HOST -u USER -p common_thread < mysql-schema.sql
```

## Hyperdrive

Create Hyperdrive pointing at your MySQL instance and set `[[hyperdrive]]`
`binding = "DB"` in `wrangler.toml`. For local dev, set
`localConnectionString` or `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_DB`.

## Tests

Integration tests use a real MySQL database via `TEST_MYSQL_URL` (default
`mysql://root@127.0.0.1:3306/common_thread_test`). Schema is applied once in
`tests/setup.ts`.

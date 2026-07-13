# MySQL incremental migrations

Migrations **0001 through 0006** are folded into the base schema at
[`mysql-schema.sql`](../mysql-schema.sql). Fresh installs via
`npm run db:migrate` or the docker-entrypoint init hook already include
everything through schema version **0009**.

Incremental scripts in this directory begin at **0007** for upgrading
databases that were created before those columns landed:

| Migration | Purpose |
|-----------|---------|
| `0007_control_and_confidence.sql` | Control accounts (`is_control`) + per-feature `confidence_flag` |
| `0008_investigation_access_token.sql` | Investigation capability tokens (`access_token_hash`) |
| `0009_attribution_jobs.sql` | Async attribution job queue (`attribution_jobs`, #69) |
| `0010_attribution_reproducibility.sql` | `prompt_sha256` + `randomization_seed` on `attribution_runs` (#125) |

Apply in order against an existing database:

```bash
mysql -h HOST -u USER -p common_thread < mysql-migrations/0007_control_and_confidence.sql
mysql -h HOST -u USER -p common_thread < mysql-migrations/0008_investigation_access_token.sql
mysql -h HOST -u USER -p common_thread < mysql-migrations/0009_attribution_jobs.sql
mysql -h HOST -u USER -p common_thread < mysql-migrations/0010_attribution_reproducibility.sql
```

Verify:

```bash
mysql -h HOST -u USER -p common_thread -e "SELECT value FROM schema_metadata WHERE \`key\` = 'schema_version';"
```

# Common Thread D1 Schema

This directory contains the D1 (SQLite) schema for the Common Thread
reference implementation. The schema realizes the feature extraction
and attribution reasoning data models specified in the methodology
paper at §6 and §7.

## Layout

```
schema/
  migrations/
    0001_initial.sql       Initial schema migration
  db-types.ts              TypeScript types for schema rows and inserts
  README.md                This file
```

## Applying the schema

The schema is applied via Wrangler:

```bash
# Create the D1 database
wrangler d1 create common-thread

# Apply the initial migration to local development
wrangler d1 migrations apply common-thread --local

# Apply to remote (production)
wrangler d1 migrations apply common-thread --remote
```

Add the resulting database ID to your `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "common-thread"
database_id = "<from-wrangler-output>"
migrations_dir = "implementation/schema/migrations"
```

## Schema overview

### Investigations

The root container. Every other row in the schema is scoped to an
investigation by `investigation_id`.

### Seed accounts

Per §5.1 of the methodology paper, every account in an investigation's
seed set is recorded with a basis statement explaining why it was
included. Seed accounts are soft-deletable via `removed_at` to preserve
the audit trail of seed-set composition over time.

### Features (account, pair, event)

Three tables for the three feature shapes:

- **account_features**: features about a single account (e.g.
  creation year, post count, function-word vector).
- **pair_features**: features about a pair of accounts (e.g.
  follower overlap, stylometric distance, response-latency
  correlation).
- **event_features**: time-anchored events (e.g. a post at a
  specific time, a name change).

Each feature row has:

- Investigation scope (`investigation_id`, `platform`)
- Identity (`account_identifier` or pair, plus `feature_name`)
- Value (in one of three columns: text, numeric, or JSON)
- Provenance (in a separate provenance table, see below)
- Extractor metadata (`extractor_name`, `extractor_version`,
  `extractor_run_id`)

### Provenance

Per §3.1 and §6.3, every feature row traces back to the archived
artifacts that contributed to its value. Provenance is normalized
into three thin tables, one per feature type:

- `account_feature_provenance`
- `pair_feature_provenance`
- `event_feature_provenance`

Each provenance row links a feature row to an `artifact_hash` (the
SHA-256 hex of the archived artifact, matching the R2 archive layer's
content-addressed path). Optionally a `manifest_entry_hash` records
the specific collection event the artifact came from, supporting the
case where the same artifact appears under multiple manifest entries.

Normalized provenance supports both directions of query:

- "What artifacts contributed to this feature?" → JOIN feature row
  to its provenance table.
- "What features came from this artifact?" → SELECT from the
  provenance table by `artifact_hash`.

The latter query is frequent in evidentiary use (when an artifact's
chain of custody is challenged, you need to know which downstream
analytical claims depend on it).

### Extractor runs

Per §3.4, the methodology commits to reproducibility for the
deterministic parts of the pipeline. The `extractor_runs` table logs
each extractor invocation with:

- The extractor's name and version
- The configuration used
- The manifest hash at the time of the run (`manifest_hash_at_run`)
- Start and completion times
- Status and counts

Reproducibility verification: run the extractor again with the same
configuration against the same manifest hash. The produced feature
rows should be identical (modulo `extracted_at` timestamps and
`extractor_run_id` references).

### Attribution runs

Per §7, the LLM-assisted attribution reasoning layer produces
confidence-banded outputs for pairs of accounts. The `attribution_runs`
table logs each reasoning session with:

- The pair being attributed (canonically ordered)
- The model name, version, and prompt version used
- The confidence band: `insufficient`, `consistent`, or
  `strongly_consistent` (the only three values the schema allows)
- The narrative summary (`output_summary`) and structured output
  (`output_json`)
- The manifest hash at the time of reasoning

Numeric probabilities are explicitly not stored. Per §7.3, the
methodology commits to coarse confidence bands as the operational
output; storing fake-precision numbers would violate that commitment.

## Design decisions

### Why normalized provenance?

Two reasonable alternatives exist:

1. **Denormalized**: store provenance as a JSON array of artifact
   hashes inside each feature row.
2. **Normalized**: separate provenance tables joining features to
   artifacts.

I chose normalized because the "which features came from this
artifact" query is important in evidentiary contexts (chain-of-custody
challenges work backward from a contested artifact to the analytical
claims that depend on it). Denormalized makes that query painful;
normalized makes it a simple SELECT.

The cost is one extra INSERT per provenance link, which is cheap.

### Why three feature value columns instead of one JSON column?

Three columns (`feature_value_text`, `feature_value_numeric`,
`feature_value_json`) with a CHECK constraint that exactly one is
populated. Alternative: a single JSON column for everything.

I chose three columns because numeric range queries are clean
(`WHERE feature_value_numeric < 2020`) rather than requiring
`json_extract` and casting. The CHECK constraint prevents the
ambiguity that motivates JSON-everything in the first place.

### Why is `account_a < account_b` enforced for pair features?

Pair features are symmetric: the feature "follower overlap between A
and B" is identical to "follower overlap between B and A". Storing
both directions wastes space and creates the question of which row is
authoritative when they disagree. The CHECK constraint forces a
canonical order, eliminating the duplication.

Application code calls `canonicalPair(a, b)` (in `db-types.ts`)
before inserting to satisfy the constraint.

### Why `extractor_version` and `model_version` as TEXT?

Versions are application-defined strings rather than monotonic
integers because:

- Multiple version schemes coexist (semver for extractors,
  date-stamps for LLM models, git SHAs for unreleased builds).
- The schema doesn't need to compare versions; the application
  layer can apply whatever comparison logic the version scheme
  supports.

### Why no foreign keys to `seed_accounts` from `account_features`?

Account features are keyed by `(investigation_id, platform,
account_identifier)`, not by `seed_accounts.id`. This allows feature
extraction on accounts that were in the seed set at some past
moment but have since been removed, without losing the features.

The trade-off: features can reference accounts that don't currently
have rows in `seed_accounts`. This is correct behavior for an
evidentiary system that preserves historical analytical state.

## Schema versioning

The `schema_metadata` table records the current schema version.
Future migrations should:

1. Be added as numbered SQL files in `migrations/` (e.g.
   `0002_add_signal_strength.sql`).
2. Update `schema_metadata.value` for the `schema_version` key.
3. Be additive when possible (new columns, new tables) rather than
   destructive (dropped columns, renamed tables). The evidentiary
   commitments make schema-level data loss particularly costly.

## Querying patterns

### List all features for an account

```sql
SELECT * FROM account_features
WHERE investigation_id = ?
  AND platform = ?
  AND account_identifier = ?
ORDER BY feature_category, feature_name;
```

### Find features that depend on a specific artifact

```sql
SELECT af.* FROM account_features af
JOIN account_feature_provenance afp ON afp.account_feature_id = af.id
WHERE afp.artifact_hash = ?;
```

(Repeat for `pair_features` and `event_features` with their respective
provenance tables, or UNION across all three.)

### Get pair features between two accounts

```sql
-- After canonicalPair() to ensure account_a < account_b
SELECT * FROM pair_features
WHERE investigation_id = ?
  AND platform = ?
  AND account_a = ?
  AND account_b = ?
ORDER BY feature_category, feature_name;
```

### Reproducibility check: find all runs against a specific manifest

```sql
SELECT * FROM extractor_runs
WHERE manifest_hash_at_run = ?
ORDER BY started_at;
```

### Attribution outputs for an investigation

```sql
SELECT account_a, account_b, confidence_band, output_summary
FROM attribution_runs
WHERE investigation_id = ?
ORDER BY completed_at DESC;
```

## TypeScript types

See `db-types.ts` for TypeScript types corresponding to the schema rows
and the input shapes for inserts. Helper functions:

- `canonicalPair(a, b)` — produces the canonical pair ordering for
  pair_features and attribution_runs.
- `readFeatureValue(row)` — extracts the populated value from a
  feature row's three value columns, parsing JSON if needed.
- `packFeatureValue(value)` — produces the three column values for
  an INSERT given a typed FeatureValue.

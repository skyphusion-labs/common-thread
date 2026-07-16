# Archive backup and replication (§5.4.4)

The reference implementation stores investigation artifacts in a Cloudflare R2
bucket (`ARCHIVE` binding). Production deployments should maintain **at least
one independent backup** on separate infrastructure.

Two supported paths:

1. **Operator sync** (rclone / lifecycle rules) — always available; documented
   below.
2. **Optional in-Worker dual-write** (`ARCHIVE_REPLICA` + `ARCHIVE_DUAL_WRITE`)
   — synchronous second-bucket puts from the Worker (#154). Off by default.

## Optional dual-write (in-Worker)

When you want every archive `put` / investigation purge `delete` to land on a
second R2 bucket in the same request path:

1. Create a second bucket (e.g. `common-thread-archive-replica`).
2. In `wrangler.toml` (see `wrangler.toml.example`):

```toml
[[r2_buckets]]
binding = "ARCHIVE_REPLICA"
bucket_name = "common-thread-archive-replica"

[vars]
ARCHIVE_DUAL_WRITE = "true"
```

3. Redeploy. Reads still use `ARCHIVE` only; writes mirror to the replica.

If the flag is unset, or `ARCHIVE_REPLICA` is unbound, behavior is identical to
the historical single-bucket deploy (no wrapper, no extra R2 calls).

Implementation: `implementation/archive/dual-write.ts`
(`resolveArchiveBucket`, applied in the Worker `fetch` path and
`ManifestCoordinator`).

Dual-write does **not** replace off-site backups. Prefer a replica in another
account/region **and** a periodic rclone check to a third destination.

## Recommended approach (operator sync)

### 1. Periodic sync with rclone

Mirror the bucket to a second destination (another R2 bucket, S3-compatible
store, or Hetzner Storage Box):

```bash
# Example: R2 -> remote S3 (adjust remotes in rclone.conf)
rclone sync r2:common-thread-archive s3:common-thread-archive-backup \
  --checksum --transfers 8 --checkers 16
```

Run on a schedule (cron on a fleet box, GitHub Actions with restricted
credentials, or Cloudflare Workflow calling a privileged sync Worker).

### 2. What to copy

At minimum, replicate the full content-addressed tree:

- `sha256/**` (artifact bytes)
- `investigations/<id>/manifest.jsonl` and `manifest.jsonl.sigs.jsonl`

The manifest JSONL is the investigation index; without it, hashes alone are
not queryable.

### 3. Verify after sync

```bash
rclone check r2:common-thread-archive s3:common-thread-archive-backup
```

Optionally verify manifest signatures offline with the archive signing tools
in this repo.

### 4. Restore drill

Document restore steps for your org: create a fresh R2 bucket, `rclone copy`
from backup, rebind `ARCHIVE` in `wrangler.toml`, redeploy. MySQL
(investigation metadata, features, attribution runs) is **not** in R2; back
up Hyperdrive/MySQL separately.

## Related

- `implementation/archive/store.ts` (content-addressed puts)
- `implementation/archive/manifest.ts` (append-only manifest)
- `implementation/archive/dual-write.ts` (optional synchronous replica)
- `docs/DEPLOYMENT.md` (R2 bucket provisioning)
- `docs/MAINTENANCE.md` (ops posture + dual-write pointer)

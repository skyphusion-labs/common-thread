# Archive backup and replication (§5.4.4)

The reference implementation stores investigation artifacts in a single
Cloudflare R2 bucket (`ARCHIVE` binding). Production deployments should
maintain **at least one independent backup** on separate infrastructure.

This repository does **not** ship an automatic dual-write replicator. Backup
is an **operator responsibility**, configured outside the Worker runtime.

## Recommended approach

### 1. Periodic sync with rclone

Mirror the bucket to a second destination (another R2 bucket, S3-compatible
store, or Hetzner Storage Box):

```bash
# Example: R2 -> local staging -> remote S3 (adjust remotes in rclone.conf)
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

## Why not built-in dual-write?

Dual-write inside the Worker complicates failure modes (partial writes,
consistency across regions) and binds the open-source reference to a specific
second provider. Operator-managed replication keeps the core implementation
simple while meeting §5.4.4 when rclone or provider lifecycle rules are
documented and exercised.

## Related

- `implementation/archive/store.ts` (content-addressed puts)
- `implementation/archive/manifest.ts` (append-only manifest)
- `docs/DEPLOYMENT.md` (R2 bucket provisioning)

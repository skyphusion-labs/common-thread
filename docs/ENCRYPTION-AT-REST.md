# Encryption at rest (§3.5)

How Common Thread encrypts the sensitive analytic payload of an investigation in
the database, and the exact boundary of what that protects. This is the
implementation contract for paper §3.5; read them together.

## Threat model

- **Protects against:** exfiltration of data at rest (a dump of the MySQL
  database). The encrypted columns yield ciphertext with no key present in the
  store to decrypt them.
- **Does NOT protect against:** a compromise of the running Worker/container
  while a request holds the derived key in memory; the structural metadata that
  stays plaintext by design (which public accounts were examined, the coarse
  confidence band, timestamps); or the raw artifacts in R2, which are public
  posts and stay content-addressed plaintext so the §3.1/§3.4 signed-manifest
  reproducibility contract is untouched.
- **No recovery.** The investigation access token is the only key material.
  Losing it makes an encrypted investigation permanently unreadable. There is no
  operator escrow. An operator who needs recovery must escrow the token out of
  band (and thereby weakens the "only the secret decrypts" property).

## The single secret, two derivations

Every investigation is created with one unguessable capability token
(`ct_...`, 256 bits), returned once and never stored. It is used two ways under
domain-separated derivations:

| Purpose | Derivation | Stored |
|---------|-----------|--------|
| Authorization | `SHA-256(token)` -> `investigations.access_token_hash` | yes (one-way hash) |
| Encryption | `HKDF-SHA256(ikm=token, salt=investigation_id, info="ct/inv-enc/v1")` -> AES-256-GCM key | no (in-memory, per request) |

Because the encryption key is derived, never stored, the store holds only
ciphertext plus the authorization hash. Neither reveals the token.

Code: `implementation/crypto/investigation-key.ts`.

## Cell format

An encrypted cell is a self-describing string:

```
enc:1:<base64url( nonce[12] || AES-256-GCM ciphertext || tag[16] )>
```

- Fresh random 96-bit nonce per cell (so identical plaintext differs).
- **AAD binds a cell to its logical location** (`"<investigation_id>|<column>"`),
  so a dumped cell cannot be relocated to another column or investigation and
  still decrypt.
- `isEncryptedCell()` distinguishes an encrypted cell from legacy plaintext by
  the `enc:1:` prefix, so readers are tolerant of mixed-vintage rows.

## What is encrypted (this release)

- **Attribution conclusion:** `attribution_runs.output_json` and
  `attribution_runs.output_summary` (#227).
- **Evidence table + basis (#228):** `account_features` / `pair_features` value
  columns (via typed envelope in `feature_value_text`),
  `event_features.event_data_json`, `seed_accounts.basis_statement` and
  `removed_reason`, `investigations.metadata_json`.

A database dump no longer yields reconstructable reasoning inputs or the written
conclusion without the investigation access token.

Structural columns stay plaintext by design and remain indexed/queryable:
account identifiers (public handles), platforms, `confidence_band`, timestamps,
counts, model/extractor names, manifest hashes.

Pack/read seam: `implementation/crypto/feature-cells.ts`.

## Lifecycle

- **Creation** (`POST /investigations`): every new investigation is encrypted.
  The create path derives the key, stamps `crypto_version='v1'`, and stores a
  `key_check` (a fixed sentinel encrypted under the key) for fail-fast
  verification that a presented token derives the right key.
- **Request handling:** on any authorized route, once the token is validated
  against the auth hash, the Worker re-derives the in-memory key
  (`resolveEncKey` in `workers/index.ts`) and threads it to the compute path.
- **Attribution write:** `runAttribution({..., encKey})` encrypts the output
  before the `attribution_runs` INSERT.
- **Reads:** `getAttributionRun` / `listAttributionRuns` and the evidence-packet
  builders decrypt with the key; the PDF path renders already-decrypted HTML in
  the container, so the key never leaves the Worker.
- **VPC key-on-dispatch (#246):** when the request holds a valid access token
  for an encrypted investigation, the Worker may hand work to VPC ingest /
  attribution. The investigation AES key is **envelope-sealed** under a key
  derived from the container shared secret (`INGEST_SECRET` /
  `ATTRIBUTION_SECRET`) + investigation id: wire format
  `inv-enc-handoff:v1:<base64url>`. Cleartext AES bytes never ride the VPC body.
  The request-scoped `CryptoKey` in the Worker stays **non-extractable**; only
  a temporary extractable derivation exists inside the seal helper.
  Sealed material is sent **only** in the bearer-authenticated VPC handoff
  body — **never** `ingest_jobs` / `attribution_jobs`, R2, logs, or HTTP client
  responses. Containers unseal, optional `key_check` verify, pack/write, then
  drop the key. Error logs record `jobId` + message only (no Error object /
  handoff dump). **Fail closed:** `crypto_version` set with no sealed material
  refuses the job. BYOK AI credentials still never leave the Worker.
  Encrypted-cell reads throw on missing/wrong key (never return `enc:1:`
  ciphertext to callers or the LLM).

  **Trust boundary (accepted, pre-existing):** containers authorize with a
  static bearer shared secret on the private Workers VPC network (no public
  route). Compromising `INGEST_SECRET` / `ATTRIBUTION_SECRET` or a fleet
  container is already full data-plane compromise for that path; key-on-dispatch
  does not add a new public attack surface. mTLS / per-investigation MFA for
  container entry is out of scope for this change.

## Backward compatibility

`crypto_version` NULL means a legacy plaintext investigation (created before
this shipped, e.g. `test-investigation-1`). Its columns are read as-is; no
key is derived. Encryption cannot be applied retroactively because the store
never held the token. Readers handle mixed-vintage rows: a plaintext cell in an
otherwise-encrypted investigation is returned unchanged.

## Schema

Migration `mysql-migrations/0013_investigation_encryption.sql` adds two nullable
columns to `investigations`:

- `crypto_version VARCHAR(16)` — scheme tag (`v1`) or NULL for legacy plaintext.
- `key_check TEXT` — sentinel encrypted under the derived key.

No payload column type changes: ciphertext cells are ASCII and fit the existing
`TEXT`/`MEDIUMTEXT` columns. `mysql-schema.sql` declares both columns for fresh
installs (schema_version `0013`).

Apply on the shared DB (reachable only on-box on `damaged`; see the operator
runbook) by piping the migration SQL through `docker exec` into the
`common-thread-db_mysql` container.

## Release status

- **v0.3.0** ships #246/#250/#251 on Workers + GHCR images (tag-gated roll;
  fleet pin `:e420661` at cut). Live smoke: encrypted inv → VPC ingest 202 →
  completed on `json-ingest` → BYOK attribute → packet.

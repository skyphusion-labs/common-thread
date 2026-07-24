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

Scoped to the **analytic conclusion**, the most sensitive product:

- `attribution_runs.output_json` and `attribution_runs.output_summary`.

Everything else, including the `*_features` value columns, `basis_statement`,
`event_data_json`, and `metadata_json`, remains plaintext **for now**. Because
the feature values (the evidence/signal table) are still plaintext, a database
dump still permits partial reconstruction of the reasoning inputs; only the
written conclusion is protected. Widening encryption to those columns is a
tracked follow-up (see below); the paper's §3.5 boundary is written to match
what actually ships.

Structural columns stay plaintext by design and remain indexed/queryable:
account identifiers (public handles), platforms, `confidence_band`, timestamps,
counts, model/extractor names, manifest hashes.

The seam that packs/reads encrypted values (including the typed envelope that
lets numeric/JSON feature values be encrypted into the text column while keeping
the one-of-three CHECK satisfied) is `implementation/crypto/feature-cells.ts`,
ready for the follow-up.

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
- **Async attribution is forced inline for encrypted investigations.** The
  detached VPC executor has no way to derive the request-scoped key, so
  dispatching there would silently write a plaintext conclusion into an
  investigation the caller was told is encrypted. `handleAttribute` runs such
  investigations inline instead (both live deployments already attribute
  inline). Key-on-dispatch for the executor is a follow-up.

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

## Follow-up

Extend encryption to the evidence table and basis statements (`*_features`
value columns, `seed_accounts.basis_statement`/`removed_reason`,
`event_features.event_data_json`, `investigations.metadata_json`) via the
`feature-cells.ts` seam, threading `encKey` through the extractor runners and
the VPC ingest container (key-on-dispatch). Tracked as
[#228](https://github.com/skyphusion-labs/common-thread/issues/228); update
§3.5's boundary when it lands.

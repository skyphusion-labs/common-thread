# Verifier test fixtures (synthetic)

Synthetic evidence packets for `@skyphusion/common-thread-verify` round-trip and
negative-case tests. **No real accounts, no real investigation.** The signing key
is a throwaway generated solely for these fixtures.

| Fixture | Expected result | Exit code |
|---|---|---|
| `valid.json` | `VALID` — signature verifies against canonical markdown | 0 |
| `unsigned.json` | `UNSIGNED` — no `packet_signature` field | 2 |
| `tampered.json` | `INVALID` — markdown mutated, hash mismatch | 2 |
| `bad-signature.json` | `INVALID` — signature byte flipped, does not verify | 2 |

## Regenerating

From the repo root:

```bash
node scripts/keygen.mjs                      # note the private seed (do NOT commit it)
printf '<seed>' > /tmp/priv.key
node scripts/sign-packet.mjs --key /tmp/priv.key \
  --signer-id ct-fixture --note "synthetic parity fixture" \
  --out valid.json unsigned.json
# tampered / bad-signature: mutate valid.json's markdown / signature byte
```

`valid.json` is verifiable offline by both `scripts/verify-packet.mjs` and this
package's `bin/common-thread-verify.mjs`; they must agree (parity test).

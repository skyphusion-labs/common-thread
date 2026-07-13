# @skyphusion/common-thread-verify

Offline verifier for Common Thread evidence packet detached Ed25519 signatures
(methodology paper §8.1.3).

Third parties (courts, journalists, opposing counsel) can verify exported
packets without access to the Worker, archive, or this repository's AGPL codebase.

## Usage

```bash
npx @skyphusion/common-thread-verify packet.json
cat packet.json | npx @skyphusion/common-thread-verify
```

Exit codes: `0` valid, `2` invalid or unsigned, `1` usage/parse error.

## Provenance

Extracted from the [common-thread](https://github.com/skyphusion-labs/common-thread)
reference implementation (`scripts/verify-packet.mjs`, `implementation/archive/signing.ts`).
This npm package is **MIT licensed**; the main repository remains **AGPL-3.0**.

## Development

From the monorepo root:

```bash
node packages/common-thread-verify/bin/common-thread-verify.mjs path/to/packet.json
```

Publish workflow: `.github/workflows/publish-verify-npm.yml` (requires `NPM_TOKEN`).

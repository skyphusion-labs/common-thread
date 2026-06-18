# Test runner setup

What this slice delivers, how to wire it into `package.json`, how to
run the suite, and what is intentionally deferred to follow-on slices.

## Prerequisites

Integration tests require a **real MySQL** instance. By default they
connect to:

```
mysql://root@127.0.0.1:3306/common_thread_test
```

Override with `TEST_MYSQL_URL` if your test database is elsewhere.
Miniflare Hyperdrive emulation requires a password in the URL; if yours
omits one, the test runner supplies `local` for the Hyperdrive binding
only (`mysql://user:local@host/...`). Use an explicit password in
`TEST_MYSQL_URL` when your MySQL credentials differ.

```bash
TEST_MYSQL_URL='mysql://user:pass@host:3306/common_thread_test' npm test
```

`tests/global-setup.ts` creates the database if needed and applies
`mysql-schema.sql` once before tests run (in the Node host process, not
inside the Workers pool).

## Files in this slice

| File | Purpose |
|---|---|
| `vitest.config.mts` | Workers-pool config: R2 bindings, AI Gateway test secrets, test discovery |
| `tests/global-setup.ts` | Applies `mysql-schema.sql` to `TEST_MYSQL_URL` before the Workers pool starts |
| `tests/helpers/mysql.ts` | MySQL connection + schema bootstrap for tests |
| `tests/helpers/test-env.ts` | `testDb()`, `testRunnerEnv()`, `testReasonerEnv()` helpers |
| `tests/helpers/db.ts` | Typed seeding helpers (investigations, seed accounts, features, extractor runs, provenance) |
| `tests/helpers/llm.ts` | AI Gateway mocking via `fetchMock` from `cloudflare:test`: triage and reasoning shapers |
| `tests/reasoner/ai-gateway.test.ts` | `extractJSONObject` pure-function coverage + `callLLM` HTTP smoke + error path |
| `tests/reasoner/triage.test.ts` | Triage verdict success paths + §7.5.2 conservative escalation + methodology metadata |
| `tests/reasoner/reasoner.test.ts` | §7.2.3 retry loop (format + content failures) + declination on exhaustion + `buildRetryPromptAddition` unit tests + retry feedback on-wire verification |
| `tests/reasoner/validator.test.ts` | §7.2.2 format layer + §7.3.3 cluster composition + §7.3.1 content aggregates + citation directionality |
| `tests/reasoner/runner-internals.test.ts` | Pure-function unit tests for `derivePairBand` and `seededShuffle` exported from `runner.ts` |
| `tests/reasoner/runner.test.ts` | End-to-end integration of `runAttribution` with seeded MySQL, including a multi-category `consistent` happy path |

## package.json additions

Add to `devDependencies`:

```json
{
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "vitest": "^2.0.0",
    "mysql2": "^3.22.0"
  }
}
```

Add or update under `scripts`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui"
  }
}
```

Version notes:

- `vitest 2.x` is the major-version line `@cloudflare/vitest-pool-workers 0.5.x` was built and tested against. Pin to whatever the current Cloudflare-pool-workers release notes recommend at install time; the API surface used here (`defineWorkersConfig`, `cloudflare:test` module exports `env`, `fetchMock`) has been stable across the 0.5.x series.
- The `vitest --ui` script is optional. Add `@vitest/ui` to devDependencies if you want it.

After updating `package.json`:

```bash
npm install
```

## Running

```bash
# One-shot run (MySQL must be reachable)
npm test

# Watch mode (re-runs on file change)
npm run test:watch

# Run only the runner integration test
npx vitest run tests/reasoner/runner.test.ts

# Run a single test by name pattern
npx vitest run -t "triage filters"
```

## How the framework boots

1. `vitest.config.mts` loads, sees `pool: workers`, spins up a Miniflare-backed Workers runtime per test worker.
2. `wrangler.toml` is read for R2 and var bindings. The `bindings` block in `vitest.config.mts` adds the test-only `AI_GATEWAY_URL` and `ANTHROPIC_API_KEY` values that wrangler.toml documents as out-of-band secrets.
3. `tests/global-setup.ts` runs in Node before workers start: connects to `TEST_MYSQL_URL`, creates the test database if needed, and applies `mysql-schema.sql` when tables are missing. Each test file shares the same schema; data accumulates within a single `vitest` run unless tests scope themselves to unique investigation IDs (the runner test does).
4. Integration tests use `testDb()` / `testReasonerEnv()` from `tests/helpers/test-env.ts` for MySQL + R2. R2 still comes from `cloudflare:test`.
5. Tests import the source modules via relative paths (`../../implementation/reasoner/...`).

## How LLM mocking works

`@cloudflare/vitest-pool-workers` exposes `fetchMock` from the `cloudflare:test` virtual module. This is an undici-style interceptor that captures `fetch()` calls inside the Workers runtime before they reach the network.

```ts
import { fetchMock } from 'cloudflare:test';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  // Fails the test if a queued intercept was never consumed.
  fetchMock.assertNoPendingInterceptors();
});
```

`tests/helpers/llm.ts` wraps the raw `fetchMock` API with shapers (`mockTriageResponse`, `mockReasoningResponse`, ...) that build well-formed Anthropic `/v1/messages` response bodies. Each helper queues ONE intercept. A test that issues N triage calls and M reasoning calls needs N + M queued shapes before invoking the runner.

## How ManifestStore mocking works

`runner.ts` does `new ManifestStore({ bucket: env.ARCHIVE }).manifestHash()` to capture the manifest hash at run time. Tests mock the manifest module at the module level via `vi.mock`:

```ts
vi.mock('../../implementation/archive/manifest', () => ({
  ManifestStore: class {
    constructor(_opts: { bucket: R2Bucket }) {}
    async manifestHash(): Promise<string> {
      return TEST_MANIFEST_HASH;
    }
  },
}));
```

`vi.mock` is hoisted by Vitest to the top of the file. The mock must be declared before the `import` of `runner.ts`.

If your project layout differs and `implementation/archive/manifest` is not the right path, adjust the mock specifier to match what `runner.ts` actually imports.

## What this slice covers (and doesn't)

### Covered

- `extractJSONObject`: prompt-conformant parse, code-fence stripping (both with and without language tag), brace-extraction fallback, outermost-object preference, failure paths.
- `callLLM`: request shape via `fetch`, response parsing including mixed content blocks, model and usage extraction, non-200 error path, URL normalization for trailing slashes on the gateway base.
- `runAttribution` end-to-end: candidate resolution from `seed_accounts`, triage filter path (records `insufficient` row, skips reasoning), triage-escalation path with multi-category seeding (calls reasoning, persists a `consistent` claim), canonical account ordering on insert, `manifest_hash_at_run` capture, `output_json` shape.
- `runTriage` per-verdict behavior: both valid verdicts preserved with reasons, undefined reason when omitted, and all four §7.5.2 conservative-escalation paths (malformed JSON, missing verdict field, off-spec verdicts including `consistent` and `strongly_consistent`, arbitrary off-spec strings). Methodology metadata authoring on both success and escalation paths.
- `runReasoning` retry loop and declination: first-attempt success, retry on format failure (malformed JSON), retry on content failure (insufficient category coverage), §7.2.3 declination after exhausted retries with `declined_pairs` populated from pair-scope signals, `max_attempts` override. Methodology metadata authoring overwrites model self-reports. Retry feedback wire-up: attempt-2 user prompt asserted to contain `buildRetryPromptAddition`'s output verbatim, attempt 1's prompt asserted not to.
- `buildRetryPromptAddition` (from `prompts.ts`): attempt/max-attempts header, §7.2.3 citation, per-failure layer and reason listing, location tags by claim/citation/alternative index, defensive non-empty output on zero failures.
- `validateReasoningOutput` (validator.ts) format and content layers: structural conformance, citation parseability and fabricated-identifier detection, §7.4.3 alternative-explanation requirement, §7.2.1 citation requirement on substantive claims, methodology metadata presence and non-empty fields, §7.3.3 cluster transitive composition (band equality, composed_from size and bounds), §7.3.1 category-coverage thresholds for both `consistent` and `strongly_consistent` bands, `strongly_consistent` stylometric-or-network rule, predominantly-sufficient confidence-flag rule, citation directionality rules for distance/jsd and similarity/overlap features.
- `derivePairBand` (runner.ts): empty-claims fallback, single-match selection, highest-band selection across multiple matches, non-matching pair fallback, cluster-claim suppression even when accounts overlap, correct behavior when both matching pair and cluster claim are present.
- `seededShuffle` (runner.ts): determinism across same-seed invocations, empty / single-element edge cases, length and element-set preservation, input non-mutation, distinct seeds produce distinct orderings on substantive input.

### Deferred

All previously deferred reasoner-layer test items are now covered. Remaining test work is outside the reasoner module:

- **Extractor-layer test coverage.** None of the extractors (stylometric pair, temporal, network, etc.) have direct tests. They follow the same data-pull-and-compute pattern as the runner, so the test scaffolding is reusable, but each extractor needs its own fixture suite. Best taken one extractor at a time.
- **Smoke verification.** Run `npm test` against a live MySQL instance before merging schema changes. The first run will surface connection issues, migration ordering problems, or environment-specific Vitest/Workers-pool quirks.

## Known wrinkles

- **Schema state shared within a `vitest` run.** `tests/setup.ts` uses `beforeAll`, so the schema is applied once and the MySQL database is shared across test files in the same worker process. Each test file should use a unique `investigation_id` to avoid cross-test row leakage. If isolation per test becomes important, switch to `beforeEach` with an in-test schema reset.
- **`fetchMock.assertNoPendingInterceptors()` in `afterEach`.** This is strict by design: it catches tests that queue more intercepts than they consume. If a test should NOT consume all queued intercepts, scope the assertion off for that test only.
- **`vi.mock` path matching.** The mock specifier must match what the importing module uses. If `runner.ts` imports `'../archive/manifest'` and your test file is at `tests/reasoner/runner.test.ts`, the test mock specifier resolves the relative path independently. Vitest uses module-ID matching, not specifier-string matching, so as long as both paths resolve to the same absolute file on disk, the mock applies.
- **`fetchMock` and the AI Gateway origin.** The intercept origin (`https://gateway.test`) must match the `AI_GATEWAY_URL` env binding in `vitest.config.mts`. If you change one, change the other.

/**
 * Attribution runner.
 *
 * Iterates ordered pairs of accounts in an investigation, builds a
 * SignalTable for each pair per §7.4.1, calls triage (§7.5.2),
 * escalates to reasoning (§7.4) where triage flags
 * 'warrants_further_analysis', and writes one attribution_runs row
 * per pair regardless of outcome.
 *
 * Mirrors the structural pattern of extractors/pair-runner.ts:
 *   - Resolves candidate accounts with per-account platforms via
 *     loadSeedAccounts (or resolveAccountPlatforms for accountFilter).
 *   - Iterates canonical pairs via canonicalPlatformedPair.
 *   - Reads from D1 (account_features, pair_features, provenance,
 *     extractor_runs, seed_accounts, investigations).
 *   - Captures manifest hash at run time for reproducibility (§3.4).
 *
 * Signal table assembly is bundled into this file rather than split
 * into a sibling helper because the assembly logic is tightly coupled
 * to the pair iteration loop: each pair's signal table is built from
 * pair_features for the canonical pair plus account_features for
 * either account. A separate helper file would mostly export one
 * function that takes the same D1 handle the runner already holds.
 *
 * v1 scope notes:
 *   - event_features are not included in signal tables. The schema
 *     and the SignalId taxonomy (account:N | pair:N | event:N) reserve
 *     the slot; the §7.3.1 category-coverage rules in validator.ts
 *     don't have a clean event category. Add an event-row → signal
 *     mapping when the methodology resolves the event treatment.
 *   - control_accounts (§5.1.4) are not populated. seed_accounts has
 *     no is_control flag yet; SignalTable.control_accounts is left
 *     undefined.
 *   - time_bounds (§5.2.1) are populated when investigations.metadata_json
 *     contains a 'time_bounds' object; otherwise undefined.
 */

import { ManifestStore } from '../archive/manifest';
import {
  canonicalPlatformedPair,
  packFeatureValue,
  readFeatureValue,
} from '../schema/db-types';
import type {
  ConfidenceBand,
  FeatureValue,
  NewAttributionRun,
} from '../schema/db-types';
import { REASONING_PROMPT_VERSION, TRIAGE_PROMPT_VERSION } from './prompts';
import { runReasoning } from './reasoner';
import { runTriage } from './triage';
import type {
  ConfidenceFlag,
  PresentedSignal,
  ReasoningClaim,
  ReasoningOutput,
  SignalId,
  SignalTable,
  TriageOutput,
} from './types';

// ---------------------------------------------------------------------------
// Env contract (matches wrangler.toml bindings)
// ---------------------------------------------------------------------------

export interface ReasonerRunnerEnv {
  DB: D1Database;
  ARCHIVE: R2Bucket;
  /** Cloudflare AI Gateway base URL ending in '/anthropic'. */
  AI_GATEWAY_URL: string;
  /** Anthropic API key. */
  ANTHROPIC_API_KEY: string;
  /** Triage model identifier. Default 'claude-haiku-4-5'. */
  TRIAGE_MODEL: string;
  /** Reasoning model identifier. Default 'claude-opus-4-7'. */
  REASONING_MODEL: string;
}

// ---------------------------------------------------------------------------
// Options and result shapes
// ---------------------------------------------------------------------------

export interface RunAttributionOptions {
  investigationId: string;

  /** Optional: restrict to this subset of seed accounts. */
  accountFilter?: string[];

  /** Maximum reasoning retry attempts per §7.2.3. Default 3. */
  maxRetries?: number;

  /**
   * Override the randomization seed for signal-order presentation.
   * Default: a fresh random UUID per pair (recorded with each run).
   */
  randomizationSeed?: string;

  /**
   * If true, bypass triage and run reasoning directly on every pair.
   * Useful for evaluation and for investigations where the triage
   * cost saving is not desired. Default false.
   */
  skipTriage?: boolean;
}

export interface AttributionRunSummary {
  account_a: string;
  account_b: string;
  platform_a: string;
  platform_b: string;
  attributionRunId: number;
  confidence_band: ConfidenceBand;
  /** Set when triage ran. Undefined when skipTriage=true. */
  triage_verdict?: TriageOutput['verdict'];
  /** True if reasoning was called (triage escalated or skipTriage). */
  reasoning_invoked: boolean;
  /** True if reasoning declined per §7.2.3. False when not invoked or success. */
  reasoning_declined: boolean;
  /** Number of reasoning attempts (undefined when reasoning not invoked). */
  reasoning_attempts?: number;
  /** Wall clock duration in milliseconds. */
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Public entrypoint
// ---------------------------------------------------------------------------

export async function runAttribution(
  env: ReasonerRunnerEnv,
  options: RunAttributionOptions
): Promise<AttributionRunSummary[]> {
  const manifest = new ManifestStore({ bucket: env.ARCHIVE });
  const manifestHash = await manifest.manifestHash();
  if (!manifestHash) {
    throw new Error(
      'Cannot run attribution against empty manifest. Collect artifacts and run extractors first.'
    );
  }

  const candidates =
    options.accountFilter && options.accountFilter.length > 0
      ? await resolveAccountPlatforms(
          env.DB,
          options.investigationId,
          [...new Set(options.accountFilter)].sort()
        )
      : await loadSeedAccounts(env.DB, options.investigationId);

  if (candidates.length < 2) {
    throw new Error(
      `Attribution requires at least 2 accounts; got ${candidates.length}`
    );
  }

  // Investigation-level context (basis statements, time bounds) once.
  const basisStatements = await loadBasisStatements(
    env.DB,
    options.investigationId,
    candidates.map(c => c.account)
  );
  const timeBounds = await loadTimeBounds(env.DB, options.investigationId);

  const summaries: AttributionRunSummary[] = [];

  for (let i = 0; i < candidates.length - 1; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const [left, right] = canonicalPlatformedPair(candidates[i], candidates[j]);
      const startMs = Date.now();
      const startedAt = new Date().toISOString();

      const seed = options.randomizationSeed ?? crypto.randomUUID();

      const signalTable = await buildSignalTable(env.DB, {
        investigationId: options.investigationId,
        pair: {
          account_a: left.account,
          account_b: right.account,
          platform_a: left.platform,
          platform_b: right.platform,
        },
        basisStatementsForPair: basisStatements.filter(
          b => b.account === left.account || b.account === right.account
        ),
        timeBounds,
        randomizationSeed: seed,
      });

      let triageOut: TriageOutput | undefined;
      let escalate = !!options.skipTriage;

      if (!options.skipTriage) {
        triageOut = await runTriage({
          apiKey: env.ANTHROPIC_API_KEY,
          gatewayUrl: env.AI_GATEWAY_URL,
          model: env.TRIAGE_MODEL,
          pair: {
            account_a: left.account,
            account_b: right.account,
            platform_a: left.platform,
            platform_b: right.platform,
          },
          signal_table: signalTable,
        });
        escalate = triageOut.verdict === 'warrants_further_analysis';
      }

      let reasoningOutput: ReasoningOutput | undefined;
      let reasoningAttempts: number | undefined;
      let reasoningDeclined = false;

      if (escalate) {
        const result = await runReasoning({
          apiKey: env.ANTHROPIC_API_KEY,
          gatewayUrl: env.AI_GATEWAY_URL,
          model: env.REASONING_MODEL,
          signal_table: signalTable,
          max_attempts: options.maxRetries,
        });
        reasoningOutput = result.output;
        reasoningAttempts = result.attempts;
        reasoningDeclined = result.declined;
      }

      const completedAt = new Date().toISOString();

      const { band, summary, outputJson } = synthesizeAttributionOutput({
        triageOut,
        reasoningOutput,
        pair: {
          account_a: left.account,
          account_b: right.account,
          platform_a: left.platform,
          platform_b: right.platform,
        },
      });

      const attributionRunId = await writeAttributionRun(env.DB, {
        investigationId: options.investigationId,
        accounts: [left.account, right.account],
        platforms: [left.platform, right.platform],
        model_name:
          reasoningOutput?.methodology_metadata.model_identifier ??
          triageOut?.methodology_metadata.model_identifier ??
          env.TRIAGE_MODEL,
        model_version:
          reasoningOutput?.methodology_metadata.model_version ??
          triageOut?.methodology_metadata.model_version ??
          env.TRIAGE_MODEL,
        reasoning_prompt_version: reasoningOutput
          ? REASONING_PROMPT_VERSION
          : TRIAGE_PROMPT_VERSION,
        input_feature_count: signalTable.signals.length,
        confidence_band: band,
        output_summary: summary,
        output: outputJson,
        started_at: startedAt,
        completed_at: completedAt,
        manifest_hash_at_run: manifestHash,
      });

      summaries.push({
        account_a: left.account,
        account_b: right.account,
        platform_a: left.platform,
        platform_b: right.platform,
        attributionRunId,
        confidence_band: band,
        triage_verdict: triageOut?.verdict,
        reasoning_invoked: !!reasoningOutput,
        reasoning_declined: reasoningDeclined,
        reasoning_attempts: reasoningAttempts,
        durationMs: Date.now() - startMs,
      });
    }
  }

  return summaries;
}

// ---------------------------------------------------------------------------
// Output synthesis: choose band + summary + JSON to persist
// ---------------------------------------------------------------------------

interface SynthesizeArgs {
  triageOut: TriageOutput | undefined;
  reasoningOutput: ReasoningOutput | undefined;
  pair: {
    account_a: string;
    account_b: string;
    platform_a: string;
    platform_b: string;
  };
}

interface SynthesizedOutput {
  band: ConfidenceBand;
  summary: string;
  outputJson: Record<string, unknown>;
}

function synthesizeAttributionOutput(args: SynthesizeArgs): SynthesizedOutput {
  // Case 1: triage filtered the pair (no reasoning run).
  if (args.triageOut && !args.reasoningOutput) {
    if (args.triageOut.verdict === 'obviously_not_coordinated') {
      const reason = args.triageOut.reason ?? '(no reason supplied)';
      return {
        band: 'insufficient',
        summary: `Triage filtered (§7.5.2): obviously_not_coordinated. ${reason}`,
        outputJson: {
          triage: args.triageOut,
          claims: [],
          alternative_explanations: [],
          declined_pairs: [],
        },
      };
    }
    // Triage escalated but reasoning was skipped (shouldn't normally
    // happen; defensive default).
    return {
      band: 'insufficient',
      summary: 'Triage escalated but reasoning did not run (defensive default).',
      outputJson: {
        triage: args.triageOut,
        claims: [],
        alternative_explanations: [],
        declined_pairs: [],
      },
    };
  }

  // Case 2: reasoning ran (with or without triage upstream).
  if (args.reasoningOutput) {
    const band = derivePairBand(args.reasoningOutput, args.pair);
    const summary = buildReasoningSummary(args.reasoningOutput, args.pair, band);
    return {
      band,
      summary,
      outputJson: {
        triage: args.triageOut,
        ...args.reasoningOutput,
      } as unknown as Record<string, unknown>,
    };
  }

  // Case 3: skipTriage=true but reasoning didn't produce output
  // (shouldn't happen given the call structure; defensive default).
  return {
    band: 'insufficient',
    summary: 'No reasoning output produced (defensive default).',
    outputJson: {
      claims: [],
      alternative_explanations: [],
      declined_pairs: [],
    },
  };
}

/**
 * Derive the attribution_runs.confidence_band value from a
 * ReasoningOutput for a specific pair. Selection rule: find claims
 * whose subject is the pair under analysis (after canonical ordering)
 * and take the highest band among them. If no pair-scope claim
 * matches, return 'insufficient'. Cluster claims are ignored when
 * choosing the band for a pair row because clusters span multiple
 * accounts; the cluster band is preserved in output_json.
 *
 * Exported for direct unit testing.
 */
export function derivePairBand(
  output: ReasoningOutput,
  pair: { account_a: string; account_b: string; platform_a: string; platform_b: string }
): ConfidenceBand {
  let best: ConfidenceBand = 'insufficient';
  for (const claim of output.claims) {
    if (claim.subject.type !== 'pair') continue;
    if (
      claim.subject.account_a === pair.account_a &&
      claim.subject.account_b === pair.account_b &&
      claim.subject.platform_a === pair.platform_a &&
      claim.subject.platform_b === pair.platform_b
    ) {
      if (bandValue(claim.confidence_band) > bandValue(best)) {
        best = claim.confidence_band;
      }
    }
  }
  return best;
}

function bandValue(b: ConfidenceBand): number {
  return b === 'strongly_consistent' ? 2 : b === 'consistent' ? 1 : 0;
}

function buildReasoningSummary(
  output: ReasoningOutput,
  pair: { account_a: string; account_b: string; platform_a: string; platform_b: string },
  band: ConfidenceBand
): string {
  // Find the matching pair-scope claim for its reasoning text.
  let claim: ReasoningClaim | undefined;
  for (const c of output.claims) {
    if (c.subject.type !== 'pair') continue;
    if (
      c.subject.account_a === pair.account_a &&
      c.subject.account_b === pair.account_b &&
      c.subject.platform_a === pair.platform_a &&
      c.subject.platform_b === pair.platform_b
    ) {
      claim = c;
      break;
    }
  }

  if (claim) {
    const reasoningExcerpt = claim.reasoning.length > 400
      ? claim.reasoning.slice(0, 397) + '...'
      : claim.reasoning;
    return `${band} (§7.4 reasoning): ${reasoningExcerpt}`;
  }

  // No matching claim: was the pair declined?
  const declined = output.declined_pairs.find(
    d =>
      d.account_a === pair.account_a &&
      d.account_b === pair.account_b &&
      d.platform_a === pair.platform_a &&
      d.platform_b === pair.platform_b
  );
  if (declined) {
    return `insufficient (§7.2.3 declination): ${declined.reason}`;
  }

  return `${band}: reasoning produced no claim or declination for this pair`;
}

// ---------------------------------------------------------------------------
// Signal table assembly per §7.4.1
// ---------------------------------------------------------------------------

interface BuildSignalTableArgs {
  investigationId: string;
  pair: {
    account_a: string;
    account_b: string;
    platform_a: string;
    platform_b: string;
  };
  basisStatementsForPair: Array<{ account: string; platform: string; statement: string }>;
  timeBounds?: { start: string; end: string };
  randomizationSeed: string;
}

async function buildSignalTable(
  db: D1Database,
  args: BuildSignalTableArgs
): Promise<SignalTable> {
  const pairSignals = await loadPairSignals(db, args.investigationId, args.pair);
  const accountSignals = await loadAccountSignals(db, args.investigationId, [
    args.pair.account_a,
    args.pair.account_b,
  ]);

  const all = [...pairSignals, ...accountSignals];
  const ordered = seededShuffle(all, args.randomizationSeed);

  return {
    investigation_id: args.investigationId,
    basis_statements: args.basisStatementsForPair,
    time_bounds: args.timeBounds,
    // control_accounts intentionally omitted in v1 (no is_control flag
    // on seed_accounts; see v1 scope notes at top of file).
    signals: ordered,
    randomization_seed: args.randomizationSeed,
  };
}

interface PairSignalRow {
  id: number;
  platform_a: string;
  platform_b: string;
  account_a: string;
  account_b: string;
  feature_category: string;
  feature_name: string;
  feature_value_text: string | null;
  feature_value_numeric: number | null;
  feature_value_json: string | null;
  confidence_flag: ConfidenceFlag;
}

async function loadPairSignals(
  db: D1Database,
  investigationId: string,
  pair: { account_a: string; account_b: string }
): Promise<PresentedSignal[]> {
  const sql = `
    SELECT
      pf.id,
      pf.platform_a,
      pf.platform_b,
      pf.account_a,
      pf.account_b,
      pf.feature_category,
      pf.feature_name,
      pf.feature_value_text,
      pf.feature_value_numeric,
      pf.feature_value_json,
      CASE
        WHEN er.status = 'completed' AND er.error_message IS NULL THEN 'sufficient'
        ELSE 'degraded'
      END AS confidence_flag
    FROM pair_features pf
    LEFT JOIN extractor_runs er ON er.id = pf.extractor_run_id
    WHERE pf.investigation_id = ?
      AND pf.account_a = ?
      AND pf.account_b = ?
    ORDER BY pf.feature_category, pf.feature_name
  `;
  const res = await db
    .prepare(sql)
    .bind(investigationId, pair.account_a, pair.account_b)
    .all<PairSignalRow>();
  const rows = res.results ?? [];
  if (rows.length === 0) return [];

  const fingerprintMap = await loadProvenanceFingerprints(
    db,
    'pair_feature_provenance',
    'pair_feature_id',
    rows.map(r => r.id)
  );

  return rows.map((row): PresentedSignal => {
    const value = readFeatureValue({
      feature_value_text: row.feature_value_text,
      feature_value_numeric: row.feature_value_numeric,
      feature_value_json: row.feature_value_json,
    });
    return {
      signal_id: `pair:${row.id}` as SignalId,
      category: row.feature_category,
      feature_name: row.feature_name,
      scope: {
        type: 'pair',
        account_a: row.account_a,
        account_b: row.account_b,
        platform_a: row.platform_a,
        platform_b: row.platform_b,
      },
      value: value as FeatureValue,
      confidence_flag: row.confidence_flag,
      provenance_fingerprint: fingerprintMap.get(row.id) ?? '',
    };
  });
}

interface AccountSignalRow {
  id: number;
  platform: string;
  account_identifier: string;
  feature_category: string;
  feature_name: string;
  feature_value_text: string | null;
  feature_value_numeric: number | null;
  feature_value_json: string | null;
  confidence_flag: ConfidenceFlag;
}

async function loadAccountSignals(
  db: D1Database,
  investigationId: string,
  accounts: string[]
): Promise<PresentedSignal[]> {
  if (accounts.length === 0) return [];
  const placeholders = accounts.map(() => '?').join(', ');
  const sql = `
    SELECT
      af.id,
      af.platform,
      af.account_identifier,
      af.feature_category,
      af.feature_name,
      af.feature_value_text,
      af.feature_value_numeric,
      af.feature_value_json,
      CASE
        WHEN er.status = 'completed' AND er.error_message IS NULL THEN 'sufficient'
        ELSE 'degraded'
      END AS confidence_flag
    FROM account_features af
    LEFT JOIN extractor_runs er ON er.id = af.extractor_run_id
    WHERE af.investigation_id = ?
      AND af.account_identifier IN (${placeholders})
    ORDER BY af.account_identifier, af.feature_category, af.feature_name
  `;
  const res = await db
    .prepare(sql)
    .bind(investigationId, ...accounts)
    .all<AccountSignalRow>();
  const rows = res.results ?? [];
  if (rows.length === 0) return [];

  const fingerprintMap = await loadProvenanceFingerprints(
    db,
    'account_feature_provenance',
    'account_feature_id',
    rows.map(r => r.id)
  );

  return rows.map((row): PresentedSignal => {
    const value = readFeatureValue({
      feature_value_text: row.feature_value_text,
      feature_value_numeric: row.feature_value_numeric,
      feature_value_json: row.feature_value_json,
    });
    return {
      signal_id: `account:${row.id}` as SignalId,
      category: row.feature_category,
      feature_name: row.feature_name,
      scope: {
        type: 'account',
        account: row.account_identifier,
        platform: row.platform,
      },
      value: value as FeatureValue,
      confidence_flag: row.confidence_flag,
      provenance_fingerprint: fingerprintMap.get(row.id) ?? '',
    };
  });
}

/**
 * Load provenance fingerprints for a set of feature IDs. Per §7.4.1
 * the fingerprint is the first 8 hex chars of each contributing
 * artifact_hash, comma-joined when multiple artifacts contributed.
 *
 * Returns Map<feature_id, fingerprint_string>. Feature IDs with no
 * provenance rows are omitted (caller defaults to empty string).
 *
 * Note: the provenance table name and feature_id column name vary
 * per feature type (account_feature_provenance.account_feature_id,
 * pair_feature_provenance.pair_feature_id, etc.). They are
 * parameterized here. SQL identifier interpolation is acceptable
 * because the values are bounded by the type signature, not
 * caller-supplied.
 */
async function loadProvenanceFingerprints(
  db: D1Database,
  table: 'account_feature_provenance' | 'pair_feature_provenance' | 'event_feature_provenance',
  fkColumn: 'account_feature_id' | 'pair_feature_id' | 'event_feature_id',
  featureIds: number[]
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (featureIds.length === 0) return out;
  const placeholders = featureIds.map(() => '?').join(', ');
  const sql = `
    SELECT ${fkColumn} AS feature_id,
           GROUP_CONCAT(DISTINCT SUBSTR(artifact_hash, 1, 8)) AS fingerprint
    FROM ${table}
    WHERE ${fkColumn} IN (${placeholders})
    GROUP BY ${fkColumn}
  `;
  const res = await db
    .prepare(sql)
    .bind(...featureIds)
    .all<{ feature_id: number; fingerprint: string | null }>();
  for (const row of res.results ?? []) {
    out.set(row.feature_id, row.fingerprint ?? '');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Investigation-level context loaders
// ---------------------------------------------------------------------------

async function loadBasisStatements(
  db: D1Database,
  investigationId: string,
  accounts: string[]
): Promise<Array<{ account: string; platform: string; statement: string }>> {
  if (accounts.length === 0) return [];
  const placeholders = accounts.map(() => '?').join(', ');
  const sql = `
    SELECT account_identifier, platform, basis_statement
    FROM seed_accounts
    WHERE investigation_id = ?
      AND account_identifier IN (${placeholders})
      AND removed_at IS NULL
    ORDER BY account_identifier
  `;
  const res = await db
    .prepare(sql)
    .bind(investigationId, ...accounts)
    .all<{ account_identifier: string; platform: string; basis_statement: string }>();
  return (res.results ?? []).map(r => ({
    account: r.account_identifier,
    platform: r.platform,
    statement: r.basis_statement,
  }));
}

async function loadTimeBounds(
  db: D1Database,
  investigationId: string
): Promise<{ start: string; end: string } | undefined> {
  const res = await db
    .prepare('SELECT metadata_json FROM investigations WHERE id = ?')
    .bind(investigationId)
    .first<{ metadata_json: string | null }>();
  if (!res || !res.metadata_json) return undefined;
  try {
    const parsed = JSON.parse(res.metadata_json) as Record<string, unknown>;
    const tb = parsed.time_bounds as Record<string, unknown> | undefined;
    if (tb && typeof tb.start === 'string' && typeof tb.end === 'string') {
      return { start: tb.start, end: tb.end };
    }
  } catch {
    // metadata_json is not parseable JSON; treat as no time bounds.
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Candidate account resolution (mirrors pair-runner.ts)
// ---------------------------------------------------------------------------

async function loadSeedAccounts(
  db: D1Database,
  investigationId: string
): Promise<Array<{ account: string; platform: string }>> {
  const res = await db
    .prepare(
      `SELECT account_identifier, MIN(platform) AS platform
       FROM seed_accounts
       WHERE investigation_id = ? AND removed_at IS NULL
       GROUP BY account_identifier
       ORDER BY account_identifier ASC`
    )
    .bind(investigationId)
    .all<{ account_identifier: string; platform: string }>();
  return (res.results ?? []).map(r => ({
    account: r.account_identifier,
    platform: r.platform,
  }));
}

async function resolveAccountPlatforms(
  db: D1Database,
  investigationId: string,
  accounts: string[]
): Promise<Array<{ account: string; platform: string }>> {
  if (accounts.length === 0) return [];
  const placeholders = accounts.map(() => '?').join(', ');

  const seedRes = await db
    .prepare(
      `SELECT account_identifier, MIN(platform) AS platform
       FROM seed_accounts
       WHERE investigation_id = ?
         AND account_identifier IN (${placeholders})
       GROUP BY account_identifier`
    )
    .bind(investigationId, ...accounts)
    .all<{ account_identifier: string; platform: string }>();

  const resolved = new Map<string, string>();
  for (const row of seedRes.results ?? []) {
    resolved.set(row.account_identifier, row.platform);
  }

  const unresolved = accounts.filter(a => !resolved.has(a));
  if (unresolved.length > 0) {
    const fbPlaceholders = unresolved.map(() => '?').join(', ');
    const fbRes = await db
      .prepare(
        `SELECT account_identifier, MIN(platform) AS platform
         FROM account_features
         WHERE investigation_id = ?
           AND account_identifier IN (${fbPlaceholders})
         GROUP BY account_identifier`
      )
      .bind(investigationId, ...unresolved)
      .all<{ account_identifier: string; platform: string }>();
    for (const row of fbRes.results ?? []) {
      resolved.set(row.account_identifier, row.platform);
    }
  }

  const stillUnresolved = accounts.filter(a => !resolved.has(a));
  if (stillUnresolved.length > 0) {
    throw new Error(
      `Cannot resolve platform for accounts in investigation '${investigationId}': ` +
        `[${stillUnresolved.join(', ')}]. ` +
        `Account must exist in seed_accounts (current or historical) or in ` +
        `account_features for the investigation.`
    );
  }

  return accounts.map(a => ({ account: a, platform: resolved.get(a)! }));
}

// ---------------------------------------------------------------------------
// attribution_runs writer
// ---------------------------------------------------------------------------

async function writeAttributionRun(
  db: D1Database,
  row: NewAttributionRun
): Promise<number> {
  // Canonicalize accounts + platforms (mirrors NewPairFeature handling
  // in pair-runner.ts).
  const [a, b] = row.accounts[0] < row.accounts[1]
    ? [row.accounts[0], row.accounts[1]]
    : [row.accounts[1], row.accounts[0]];
  const [pa, pb] = row.accounts[0] < row.accounts[1]
    ? [row.platforms[0], row.platforms[1]]
    : [row.platforms[1], row.platforms[0]];

  const result = await db
    .prepare(
      `INSERT INTO attribution_runs (
         investigation_id, account_a, account_b, platform_a, platform_b,
         model_name, model_version, reasoning_prompt_version,
         input_feature_count, confidence_band,
         output_summary, output_json,
         started_at, completed_at, manifest_hash_at_run
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      row.investigation_id,
      a,
      b,
      pa,
      pb,
      row.model_name,
      row.model_version,
      row.reasoning_prompt_version,
      row.input_feature_count,
      row.confidence_band,
      row.output_summary,
      JSON.stringify(row.output),
      row.started_at,
      row.completed_at,
      row.manifest_hash_at_run
    )
    .run();
  return result.meta.last_row_id as number;
}

// ---------------------------------------------------------------------------
// Seeded shuffle for §7.4.1 signal-order randomization
// ---------------------------------------------------------------------------

/**
 * Fisher-Yates shuffle seeded deterministically from a string. Uses
 * xorshift32 over a djb2 hash of the seed. Output is reproducible for
 * a given (input order, seed) pair, which is the §7.4.1 contract: a
 * reviewer can reproduce the order from the recorded seed.
 *
 * Not cryptographically random; methodology paper does not require
 * cryptographic guarantees on signal order, only reproducibility.
 */
export function seededShuffle<T>(arr: ReadonlyArray<T>, seed: string): T[] {
  const out = arr.slice();
  let state = djb2(seed);
  if (state === 0) state = 1; // xorshift32 cannot escape zero
  for (let i = out.length - 1; i > 0; i--) {
    state = xorshift32(state);
    const j = (state >>> 0) % (i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h | 0;
}

function xorshift32(x: number): number {
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x | 0;
}

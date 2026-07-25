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
 *   - Reads from MySQL (account_features, pair_features, provenance,
 *     extractor_runs, seed_accounts, investigations).
 *   - Captures manifest hash at run time for reproducibility (§3.4).
 *
 * Signal table assembly is bundled into this file rather than split
 * into a sibling helper because the assembly logic is tightly coupled
 * to the pair iteration loop: each pair's signal table is built from
 * pair_features for the canonical pair plus account_features for
 * either account. A separate helper file would mostly export one
 * function that takes the same database handle the runner already holds.
 *
 *   - event_features are included for accounts in the pair scope.
 *   - control_accounts (§5.1.4) populate from seed_accounts.is_control.
 *   - Per-feature confidence_flag columns (§6.4.1) map to presentation
 *     sufficient/degraded flags in the signal table.
 */

import { ManifestStore } from '../archive/manifest';
import type { DatabaseClient } from '../db';
import {
  canonicalPlatformedPair,
  readFeatureValue,
} from '../schema/db-types';
import { packTextCell } from '../crypto/feature-cells';
import type {
  ConfidenceBand,
  FeatureValue,
  NewAttributionRun,
} from '../schema/db-types';
import {
  REASONING_PROMPT_VERSION,
  TRIAGE_PROMPT_VERSION,
  TRIAGE_SYSTEM_PROMPT,
  buildTriageUserPrompt,
  promptSha256,
} from './prompts';
import { isLlmTransportError } from './ai-gateway';
import { runReasoning } from './reasoner';
import { runTriage } from './triage';
import { persistAttributionMetadata } from '../investigations/attribution-metadata';
import { toPresentationConfidence } from '../extractors/confidence';
import { capBandForNonEnglish, bandValue } from './bands';
import {
  composeInvestigationClusters,
  type CompositionRunInput,
} from './cluster-composition';
import { annotateControlComparisons } from './control-comparison';
import { determineInvestigationLanguage } from './investigation-language';
import type {
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
  DB: DatabaseClient;
  ARCHIVE: R2Bucket;
  /** Cloudflare AI Gateway base URL ending in '/anthropic'. */
  AI_GATEWAY_URL: string;
  /** Anthropic API key (x-api-key). Optional when CF_AIG_TOKEN is set. */
  ANTHROPIC_API_KEY?: string;
  /**
   * Cloudflare AI Gateway token for keyless Unified Billing (#111). When
   * set, LLM calls authenticate with cf-aig-authorization and omit
   * x-api-key. Takes precedence over ANTHROPIC_API_KEY.
   */
  CF_AIG_TOKEN?: string;
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
   * When set, the same seed is reused for every pair in the run (useful
   * for deterministic test replays). Default: a fresh random UUID per
   * pair, recorded on each attribution_runs row.
   */
  randomizationSeed?: string;

  /**
   * If true, bypass triage and run reasoning directly on every pair.
   * Useful for evaluation and for investigations where the triage
   * cost saving is not desired. Default false.
   */
  skipTriage?: boolean;

  /**
   * Per-investigation encryption key (§3.5). When set (an encrypted
   * investigation), the attribution output (output_summary + output_json) is
   * encrypted at rest under it before the attribution_runs row is written.
   * Null/undefined leaves the output plaintext (legacy investigation).
   */
  encKey?: CryptoKey | null;
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
  const manifest = new ManifestStore({ bucket: env.ARCHIVE, investigationId: options.investigationId });
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
  const controlAccounts = await loadControlAccounts(env.DB, options.investigationId);
  const languageProfile = await determineInvestigationLanguage(
    env.DB,
    options.investigationId
  );
  const controlKeys = new Set(
    controlAccounts.map((c) => `${c.platform}:${c.account}`)
  );

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
        controlAccounts,
        randomizationSeed: seed,
        nonEnglishInvestigation: languageProfile.is_non_english,
      });

      const triageUserPrompt = buildTriageUserPrompt({
        account_a: left.account,
        account_b: right.account,
        platform_a: left.platform,
        platform_b: right.platform,
        signal_table: signalTable,
      });
      const triagePromptSha = await promptSha256(TRIAGE_SYSTEM_PROMPT, triageUserPrompt);

      let triageOut: TriageOutput | undefined;
      let escalate = !!options.skipTriage;
      let reasoningOutput: ReasoningOutput | undefined;
      let reasoningAttempts: number | undefined;
      let reasoningDeclined = false;
      let transportFailure = false;
      let recordedPromptSha = triagePromptSha;
      let recordedPromptVersion = TRIAGE_PROMPT_VERSION;

      try {
        if (!options.skipTriage) {
          triageOut = await runTriage({
            apiKey: env.ANTHROPIC_API_KEY,
            cfAigToken: env.CF_AIG_TOKEN,
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

        if (escalate) {
          const result = await runReasoning({
            apiKey: env.ANTHROPIC_API_KEY,
            cfAigToken: env.CF_AIG_TOKEN,
            gatewayUrl: env.AI_GATEWAY_URL,
            model: env.REASONING_MODEL,
            signal_table: signalTable,
            max_attempts: options.maxRetries,
          });
          reasoningOutput = result.output;
          reasoningAttempts = result.attempts;
          reasoningDeclined = result.declined;
          recordedPromptSha = result.prompt_sha256;
          recordedPromptVersion = REASONING_PROMPT_VERSION;

          if (reasoningOutput) {
            reasoningOutput = await annotateControlComparisons(
              env.DB,
              options.investigationId,
              {
                account_a: left.account,
                account_b: right.account,
                platform_a: left.platform,
                platform_b: right.platform,
              },
              controlAccounts,
              reasoningOutput
            );
          }
        }
      } catch (err) {
        if (!isLlmTransportError(err)) throw err;
        transportFailure = true;
        reasoningDeclined = true;
        reasoningOutput = buildTransportFailureOutput(signalTable, err);
      }

      const completedAt = new Date().toISOString();

      const { band, summary, outputJson } = transportFailure
        ? synthesizeTransportFailureOutput({
            triageOut,
            reasoningOutput: reasoningOutput!,
            pair: {
              account_a: left.account,
              account_b: right.account,
              platform_a: left.platform,
              platform_b: right.platform,
            },
            transportError: reasoningOutput!.declined_pairs[0]?.reason ?? 'LLM transport failure',
          })
        : synthesizeAttributionOutput({
            triageOut,
            reasoningOutput,
            pair: {
              account_a: left.account,
              account_b: right.account,
              platform_a: left.platform,
              platform_b: right.platform,
            },
            isNonEnglish: languageProfile.is_non_english,
          });

      const attributionRunId = await writeAttributionRun(env.DB, options.encKey ?? null, {
        investigation_id: options.investigationId,
        accounts: [left.account, right.account],
        platforms: [left.platform, right.platform],
        model_name:
          reasoningOutput?.methodology_metadata.model_identifier ??
          triageOut?.methodology_metadata.model_identifier ??
          env.TRIAGE_MODEL,
        model_version:
          reasoningOutput?.methodology_metadata.model_version ??
          triageOut?.methodology_metadata.model_version ??
          '',
        reasoning_prompt_version: recordedPromptVersion,
        prompt_sha256: recordedPromptSha,
        randomization_seed: seed,
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

  const runRows = await env.DB
    .prepare(
      `SELECT id, account_a, account_b, platform_a, platform_b, confidence_band
       FROM attribution_runs
       WHERE investigation_id = ?
       ORDER BY id ASC`
    )
    .bind(options.investigationId)
    .all<CompositionRunInput>();

  const composition = composeInvestigationClusters(
    runRows.results ?? [],
    controlKeys
  );

  await persistAttributionMetadata(env.DB, options.investigationId, {
    investigation_language: languageProfile,
    cluster_composition: composition,
  });

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
  isNonEnglish?: boolean;
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
    let band = derivePairBand(args.reasoningOutput, args.pair);
    if (args.isNonEnglish) {
      band = capBandForNonEnglish(band, true);
    }
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

function buildTransportFailureOutput(
  signal_table: SignalTable,
  err: Error
): ReasoningOutput {
  const seen = new Set<string>();
  const declined_pairs: ReasoningOutput['declined_pairs'] = [];
  for (const sig of signal_table.signals) {
    if (sig.scope.type !== 'pair') continue;
    const key = `${sig.scope.account_a}|${sig.scope.account_b}|${sig.scope.platform_a}|${sig.scope.platform_b}`;
    if (seen.has(key)) continue;
    seen.add(key);
    declined_pairs.push({
      account_a: sig.scope.account_a,
      account_b: sig.scope.account_b,
      platform_a: sig.scope.platform_a,
      platform_b: sig.scope.platform_b,
      reason: `LLM transport failure; pair declined per §7.2.3: ${err.message}`,
    });
  }

  return {
    claims: [],
    alternative_explanations: [],
    declined_pairs,
    methodology_metadata: {
      model_identifier: '',
      model_version: '',
      prompt_version: REASONING_PROMPT_VERSION,
      randomization_seed: signal_table.randomization_seed,
      run_timestamp: new Date().toISOString(),
    },
  };
}

function synthesizeTransportFailureOutput(args: {
  triageOut: TriageOutput | undefined;
  reasoningOutput: ReasoningOutput;
  pair: {
    account_a: string;
    account_b: string;
    platform_a: string;
    platform_b: string;
  };
  transportError: string;
}): SynthesizedOutput {
  return {
    band: 'insufficient',
    summary: `insufficient (LLM transport failure): ${args.transportError}`,
    outputJson: {
      triage: args.triageOut,
      ...args.reasoningOutput,
    } as unknown as Record<string, unknown>,
  };
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
  controlAccounts?: Array<{ account: string; platform: string }>;
  randomizationSeed: string;
  nonEnglishInvestigation?: boolean;
}

async function buildSignalTable(
  db: DatabaseClient,
  args: BuildSignalTableArgs
): Promise<SignalTable> {
  const pairSignals = await loadPairSignals(db, args.investigationId, args.pair);
  const accountSignals = await loadAccountSignals(db, args.investigationId, [
    args.pair.account_a,
    args.pair.account_b,
  ]);
  const eventSignals = await loadEventSignals(db, args.investigationId, [
    args.pair.account_a,
    args.pair.account_b,
  ]);

  const all = [...pairSignals, ...accountSignals, ...eventSignals];
  const ordered = seededShuffle(all, args.randomizationSeed);

  return {
    investigation_id: args.investigationId,
    basis_statements: args.basisStatementsForPair,
    time_bounds: args.timeBounds,
    control_accounts:
      args.controlAccounts && args.controlAccounts.length > 0
        ? args.controlAccounts
        : undefined,
    non_english_investigation: args.nonEnglishInvestigation ? true : undefined,
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
  stored_confidence: string | null;
  extractor_status: string | null;
  extractor_error: string | null;
}

async function loadPairSignals(
  db: DatabaseClient,
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
      pf.confidence_flag AS stored_confidence,
      er.status AS extractor_status,
      er.error_message AS extractor_error
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
      confidence_flag: toPresentationConfidence(
        row.stored_confidence as 'sufficient' | 'marginal' | 'insufficient' | null,
        row.extractor_status === 'completed' && !row.extractor_error
      ),
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
  stored_confidence: string | null;
  extractor_status: string | null;
  extractor_error: string | null;
}

async function loadAccountSignals(
  db: DatabaseClient,
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
      af.confidence_flag AS stored_confidence,
      er.status AS extractor_status,
      er.error_message AS extractor_error
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
      confidence_flag: toPresentationConfidence(
        row.stored_confidence as 'sufficient' | 'marginal' | 'insufficient' | null,
        row.extractor_status === 'completed' && !row.extractor_error
      ),
      provenance_fingerprint: fingerprintMap.get(row.id) ?? '',
    };
  });
}

interface EventSignalRow {
  id: number;
  platform: string;
  account_identifier: string;
  event_timestamp: string;
  event_type: string;
  event_data_json: string | null;
  stored_confidence: string | null;
  extractor_status: string | null;
  extractor_error: string | null;
}

async function loadEventSignals(
  db: DatabaseClient,
  investigationId: string,
  accounts: string[]
): Promise<PresentedSignal[]> {
  if (accounts.length === 0) return [];
  const placeholders = accounts.map(() => '?').join(', ');
  const sql = `
    SELECT
      ef.id,
      ef.platform,
      ef.account_identifier,
      ef.event_timestamp,
      ef.event_type,
      ef.event_data_json,
      ef.confidence_flag AS stored_confidence,
      er.status AS extractor_status,
      er.error_message AS extractor_error
    FROM event_features ef
    LEFT JOIN extractor_runs er ON er.id = ef.extractor_run_id
    WHERE ef.investigation_id = ?
      AND ef.account_identifier IN (${placeholders})
    ORDER BY ef.account_identifier, ef.event_timestamp, ef.event_type
    LIMIT 500
  `;
  const res = await db
    .prepare(sql)
    .bind(investigationId, ...accounts)
    .all<EventSignalRow>();
  const rows = res.results ?? [];
  if (rows.length === 0) return [];

  const fingerprintMap = await loadProvenanceFingerprints(
    db,
    'event_feature_provenance',
    'event_feature_id',
    rows.map(r => r.id)
  );

  return rows.map((row): PresentedSignal => {
    let eventData: unknown = row.event_data_json;
    if (typeof row.event_data_json === 'string') {
      try {
        eventData = JSON.parse(row.event_data_json);
      } catch {
        eventData = row.event_data_json;
      }
    }

    return {
      signal_id: `event:${row.id}` as SignalId,
      category: 'event',
      feature_name: row.event_type,
      scope: {
        type: 'account',
        account: row.account_identifier,
        platform: row.platform,
      },
      value: {
        kind: 'json',
        value: {
          event_timestamp: row.event_timestamp,
          event_type: row.event_type,
          event_data: eventData,
        },
      },
      confidence_flag: toPresentationConfidence(
        row.stored_confidence as 'sufficient' | 'marginal' | 'insufficient' | null,
        row.extractor_status === 'completed' && !row.extractor_error
      ),
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
  db: DatabaseClient,
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
  db: DatabaseClient,
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
  db: DatabaseClient,
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

async function loadControlAccounts(
  db: DatabaseClient,
  investigationId: string
): Promise<Array<{ account: string; platform: string }>> {
  const res = await db
    .prepare(
      `SELECT account_identifier, platform
       FROM seed_accounts
       WHERE investigation_id = ?
         AND removed_at IS NULL
         AND is_control = 1
       ORDER BY account_identifier ASC, platform ASC`
    )
    .bind(investigationId)
    .all<{ account_identifier: string; platform: string }>();
  return (res.results ?? []).map(r => ({
    account: r.account_identifier,
    platform: r.platform,
  }));
}

// ---------------------------------------------------------------------------
// Candidate account resolution (mirrors pair-runner.ts)
// ---------------------------------------------------------------------------

async function loadSeedAccounts(
  db: DatabaseClient,
  investigationId: string
): Promise<Array<{ account: string; platform: string }>> {
  const res = await db
    .prepare(
      // DISTINCT: a non-idempotent ingest can leave duplicate seed rows for the
      // same (account, platform); without dedup the pair loop would form a
      // self-pair and canonicalPlatformedPair would throw (500). Mirrors
      // resolveAccountPlatforms below.
      `SELECT DISTINCT account_identifier, platform
       FROM seed_accounts
       WHERE investigation_id = ? AND removed_at IS NULL
       ORDER BY account_identifier ASC, platform ASC`
    )
    .bind(investigationId)
    .all<{ account_identifier: string; platform: string }>();
  return (res.results ?? []).map(r => ({
    account: r.account_identifier,
    platform: r.platform,
  }));
}

async function resolveAccountPlatforms(
  db: DatabaseClient,
  investigationId: string,
  accounts: string[]
): Promise<Array<{ account: string; platform: string }>> {
  if (accounts.length === 0) return [];
  const placeholders = accounts.map(() => '?').join(', ');

  const seedRes = await db
    .prepare(
      `SELECT DISTINCT account_identifier, platform
       FROM seed_accounts
       WHERE investigation_id = ?
         AND account_identifier IN (${placeholders})
       ORDER BY account_identifier ASC, platform ASC`
    )
    .bind(investigationId, ...accounts)
    .all<{ account_identifier: string; platform: string }>();

  const out: Array<{ account: string; platform: string }> = [];
  const seen = new Set<string>();
  const resolvedIds = new Set<string>();
  for (const row of seedRes.results ?? []) {
    const key = `${row.platform}\0${row.account_identifier}`;
    if (seen.has(key)) continue;
    seen.add(key);
    resolvedIds.add(row.account_identifier);
    out.push({ account: row.account_identifier, platform: row.platform });
  }

  const unresolved = accounts.filter(a => !resolvedIds.has(a));
  if (unresolved.length > 0) {
    const fbPlaceholders = unresolved.map(() => '?').join(', ');
    const fbRes = await db
      .prepare(
        `SELECT DISTINCT account_identifier, platform
         FROM account_features
         WHERE investigation_id = ?
           AND account_identifier IN (${fbPlaceholders})
         ORDER BY account_identifier ASC, platform ASC`
      )
      .bind(investigationId, ...unresolved)
      .all<{ account_identifier: string; platform: string }>();
    for (const row of fbRes.results ?? []) {
      const key = `${row.platform}\0${row.account_identifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolvedIds.add(row.account_identifier);
      out.push({ account: row.account_identifier, platform: row.platform });
    }
  }

  const stillUnresolved = accounts.filter(a => !resolvedIds.has(a));
  if (stillUnresolved.length > 0) {
    throw new Error(
      `Cannot resolve platform for accounts in investigation '${investigationId}': ` +
        `[${stillUnresolved.join(', ')}]. ` +
        `Account must exist in seed_accounts (current or historical) or in ` +
        `account_features for the investigation.`
    );
  }

  return out;
}

// ---------------------------------------------------------------------------
// attribution_runs writer
// ---------------------------------------------------------------------------

async function writeAttributionRun(
  db: DatabaseClient,
  encKey: CryptoKey | null,
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

  // Encryption at rest (§3.5): the analytic conclusion (summary + full output
  // JSON) is the sensitive payload. Encrypt it under the investigation key when
  // present; structural columns (accounts, platforms, band, timestamps) stay
  // plaintext so listing/indexing keep working.
  const ctx = {
    key: encKey,
    investigationId: row.investigation_id,
    column: 'attribution_runs.output',
  };
  const outputSummaryCell = await packTextCell(row.output_summary, ctx);
  const outputJsonCell = await packTextCell(JSON.stringify(row.output), ctx);

  const result = await db
    .prepare(
      `INSERT INTO attribution_runs (
         investigation_id, account_a, account_b, platform_a, platform_b,
         model_name, model_version, reasoning_prompt_version,
         prompt_sha256, randomization_seed,
         input_feature_count, confidence_band,
         output_summary, output_json,
         started_at, completed_at, manifest_hash_at_run
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      row.prompt_sha256 ?? null,
      row.randomization_seed,
      row.input_feature_count,
      row.confidence_band,
      outputSummaryCell,
      outputJsonCell,
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

/**
 * Triage filter per §7.5.2.
 *
 * Calls the triage model with the §7.5.2 prompt for one pair and
 * returns a TriageOutput. The model is restricted by prompt to two
 * verdicts:
 *
 *   - 'obviously_not_coordinated': pair is recorded as 'insufficient'
 *     in attribution_runs with no further reasoning. Triage filtered.
 *   - 'warrants_further_analysis': pair escalates to the reasoning
 *     model (reasoner.ts) for full §7.4 treatment.
 *
 * The triage call is one-shot: no validation pass, no retry loop.
 * Triage outputs are filter decisions, not attribution claims, so they
 * do not require the §7.2 citation discipline.
 *
 * §7.5.2 default-behavior rule: when the model output cannot be
 * confidently parsed (malformed JSON, missing verdict, invalid verdict
 * such as the model attempting to emit 'consistent'), the triage call
 * conservatively escalates to 'warrants_further_analysis'. False-
 * negative triage (silently filtering a coordinated pair) is the
 * methodology's most serious failure mode; false-positive triage
 * (escalating a non-coordinated pair) just spends one extra reasoning
 * call.
 */

import { callLLM, extractJSONObject } from './ai-gateway';
import {
  TRIAGE_PROMPT_VERSION,
  TRIAGE_SYSTEM_PROMPT,
  buildTriageUserPrompt,
} from './prompts';
import type {
  MethodologyMetadata,
  SignalTable,
  TriageOutput,
  TriageVerdict,
} from './types';

const DEFAULT_MAX_TOKENS = 512;

/**
 * Conservative parse failure default per §7.5.2. Triage cannot
 * confidently filter the pair, so it escalates.
 */
const ESCALATE_ON_PARSE_FAILURE: TriageVerdict = 'warrants_further_analysis';

export interface RunTriageOptions {
  apiKey: string;
  gatewayUrl: string;
  /** Triage model identifier (e.g., 'claude-haiku-4-5'). */
  model: string;
  /**
   * Pair under triage. Account / platform identifiers in canonical
   * order (account_a < account_b), matching the SignalTable contents.
   */
  pair: {
    account_a: string;
    account_b: string;
    platform_a: string;
    platform_b: string;
  };
  /** Pair-relevant signal subset. */
  signal_table: SignalTable;
  /** Optional. Maximum response tokens. Default 512. */
  max_tokens?: number;
}

export async function runTriage(opts: RunTriageOptions): Promise<TriageOutput> {
  const userPrompt = buildTriageUserPrompt({
    account_a: opts.pair.account_a,
    account_b: opts.pair.account_b,
    platform_a: opts.pair.platform_a,
    platform_b: opts.pair.platform_b,
    signal_table: opts.signal_table,
  });

  const response = await callLLM({
    apiKey: opts.apiKey,
    gatewayUrl: opts.gatewayUrl,
    model: opts.model,
    systemPrompt: TRIAGE_SYSTEM_PROMPT,
    userPrompt,
    maxTokens: opts.max_tokens ?? DEFAULT_MAX_TOKENS,
  });

  const methodology_metadata: MethodologyMetadata = {
    model_identifier: opts.model,
    model_version: response.modelVersion,
    prompt_version: TRIAGE_PROMPT_VERSION,
    randomization_seed: opts.signal_table.randomization_seed,
    run_timestamp: new Date().toISOString(),
  };

  let parsed: unknown;
  try {
    parsed = extractJSONObject(response.text);
  } catch {
    return {
      verdict: ESCALATE_ON_PARSE_FAILURE,
      reason: 'triage response not parseable as JSON; conservatively escalating per §7.5.2',
      methodology_metadata,
    };
  }

  const verdict = sanitizeVerdict(parsed);
  const reason = extractReason(parsed, verdict);

  return {
    verdict,
    reason,
    methodology_metadata,
  };
}

function sanitizeVerdict(parsed: unknown): TriageVerdict {
  if (!parsed || typeof parsed !== 'object' || !('verdict' in parsed)) {
    return ESCALATE_ON_PARSE_FAILURE;
  }
  const v = (parsed as Record<string, unknown>).verdict;
  if (v === 'obviously_not_coordinated' || v === 'warrants_further_analysis') {
    return v;
  }
  // Prompt-enforcement violation: model emitted 'consistent',
  // 'strongly_consistent', or anything else outside the binary
  // verdict space. Conservatively escalate per §7.5.2.
  return ESCALATE_ON_PARSE_FAILURE;
}

function extractReason(parsed: unknown, verdict: TriageVerdict): string | undefined {
  if (parsed && typeof parsed === 'object' && 'reason' in parsed) {
    const r = (parsed as Record<string, unknown>).reason;
    if (typeof r === 'string' && r.length > 0) return r;
  }
  // If we escalated because of a verdict-sanitization failure, the
  // model's original output was off-spec. Note that for downstream
  // diagnostics.
  if (verdict === ESCALATE_ON_PARSE_FAILURE) {
    return 'triage verdict missing or off-spec; conservatively escalating per §7.5.2';
  }
  return undefined;
}

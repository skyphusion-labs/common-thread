/**
 * Reasoning call per §7.4 with the §7.2.3 retry loop.
 *
 * Calls the reasoning model with the §7.4 system prompt. Validates the
 * output per §7.2.2 (format and content layers via validator.ts). On
 * validation failure, retries up to max_attempts times, appending the
 * §7.2.3 retry feedback to the user prompt. On final failure returns
 * the §7.2.3 declination default: an output with no claims, no
 * alternative explanations, and `declined_pairs` populated with every
 * pair-scope subject in the signal table.
 *
 * Provenance metadata. The methodology_metadata on the returned
 * ReasoningOutput is authored by this runner, not trusted from the
 * model. The model's self-reported methodology_metadata (if any) is
 * overwritten with the run-source values. This protects against a
 * model claiming a model_version or prompt_version that does not
 * match the actual run.
 */

import { callLLM, extractJSONObject } from './ai-gateway';
import {
  REASONING_PROMPT_VERSION,
  REASONING_SYSTEM_PROMPT,
  buildReasoningUserPrompt,
  buildRetryPromptAddition,
  promptSha256,
} from './prompts';
import { validateReasoningOutput } from './validator';
import type {
  DeclinedPair,
  MethodologyMetadata,
  ReasoningOutput,
  SignalTable,
  ValidationFailure,
} from './types';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_TOKENS = 8192;

export interface RunReasoningOptions {
  apiKey?: string;
  /** Keyless Unified Billing token (#111); preferred over apiKey when set. */
  cfAigToken?: string;
  gatewayUrl: string;
  /** Reasoning model identifier (e.g., 'claude-opus-4-7'). */
  model: string;
  /** Signal table for the pair (or pairs) under reasoning. */
  signal_table: SignalTable;
  /** Maximum retry attempts per §7.2.3. Default 3. */
  max_attempts?: number;
  /** Optional. Maximum response tokens. Default 8192. */
  max_tokens?: number;
}

export interface RunReasoningResult {
  output: ReasoningOutput;
  /** Number of attempts taken (1 = first-pass success; max_attempts = exhausted). */
  attempts: number;
  /**
   * True if the final output is the §7.2.3 declination default rather
   * than a model-produced output. Callers use this to set the
   * confidence_band on the attribution_runs row appropriately.
   */
  declined: boolean;
  /** Failures from the final attempt (if any). Empty when declined=false. */
  final_failures: ValidationFailure[];
  /** SHA-256 of system + initial user prompt (§3.4.2). */
  prompt_sha256: string;
}

export async function runReasoning(opts: RunReasoningOptions): Promise<RunReasoningResult> {
  const maxAttempts = opts.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
  const maxTokens = opts.max_tokens ?? DEFAULT_MAX_TOKENS;
  const baseUserPrompt = buildReasoningUserPrompt({ signal_table: opts.signal_table });
  const basePromptSha = await promptSha256(REASONING_SYSTEM_PROMPT, baseUserPrompt);

  let attempt = 0;
  let lastFailures: ValidationFailure[] = [];
  let lastOutput: ReasoningOutput | undefined;
  let lastModelVersion: string = opts.model;

  while (attempt < maxAttempts) {
    attempt++;
    let userPrompt = baseUserPrompt;
    if (attempt > 1) {
      userPrompt += buildRetryPromptAddition({
        attempt_number: attempt,
        max_attempts: maxAttempts,
        failures: lastFailures,
        prior_output: lastOutput,
      });
    }

    const response = await callLLM({
      apiKey: opts.apiKey,
      cfAigToken: opts.cfAigToken,
      gatewayUrl: opts.gatewayUrl,
      model: opts.model,
      systemPrompt: REASONING_SYSTEM_PROMPT,
      userPrompt,
      maxTokens,
    });
    lastModelVersion = response.modelVersion;

    const methodologyMetadata: MethodologyMetadata = {
      model_identifier: opts.model,
      model_version: response.modelVersion,
      prompt_version: REASONING_PROMPT_VERSION,
      randomization_seed: opts.signal_table.randomization_seed,
      run_timestamp: new Date().toISOString(),
    };

    let parsed: ReasoningOutput | undefined;
    try {
      const obj = extractJSONObject(response.text) as ReasoningOutput;
      // Run-source provenance is authoritative; overwrite anything
      // the model self-reported.
      obj.methodology_metadata = methodologyMetadata;
      parsed = obj;
    } catch (err) {
      lastFailures = [
        {
          layer: 'format',
          reason: `reasoning response was not parseable as a JSON object: ${err instanceof Error ? err.message : String(err)}`,
        },
      ];
      lastOutput = undefined;
      continue;
    }

    const validation = validateReasoningOutput(parsed, opts.signal_table);
    if (validation.passed) {
      return {
        output: parsed,
        attempts: attempt,
        declined: false,
        final_failures: [],
        prompt_sha256: basePromptSha,
      };
    }

    lastFailures = validation.failures;
    lastOutput = parsed;
  }

  // §7.2.3 declination: max attempts exhausted. Return an insufficient-
  // evidence default with declined_pairs populated from the pair-scope
  // subjects in the signal table.
  const declinationMetadata: MethodologyMetadata = {
    model_identifier: opts.model,
    model_version: lastModelVersion,
    prompt_version: REASONING_PROMPT_VERSION,
    randomization_seed: opts.signal_table.randomization_seed,
    run_timestamp: new Date().toISOString(),
  };

  return {
    output: buildDeclinationOutput(opts.signal_table, declinationMetadata, lastFailures),
    attempts: attempt,
    declined: true,
    final_failures: lastFailures,
    prompt_sha256: basePromptSha,
  };
}

/**
 * Build the §7.2.3 declination default. No claims, no alternative
 * explanations; every pair-scope signal's pair is listed in
 * declined_pairs with a brief reason summarizing the failure.
 *
 * If the signal table contains no pair-scope signals (rare; could
 * happen if a caller invokes reasoning on an account-only signal
 * table), declined_pairs is empty and the output is still valid.
 */
function buildDeclinationOutput(
  signal_table: SignalTable,
  methodology_metadata: MethodologyMetadata,
  failures: ValidationFailure[]
): ReasoningOutput {
  const seen = new Set<string>();
  const declined_pairs: DeclinedPair[] = [];
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
      reason: summarizeDeclination(failures),
    });
  }

  return {
    claims: [],
    alternative_explanations: [],
    declined_pairs,
    methodology_metadata,
  };
}

function summarizeDeclination(failures: ValidationFailure[]): string {
  if (failures.length === 0) {
    return 'reasoning declined per §7.2.3 (max attempts exhausted with no validatable output)';
  }
  const summary = failures
    .slice(0, 3)
    .map(f => `[${f.layer}] ${f.reason}`)
    .join('; ');
  const more = failures.length > 3 ? ` (+${failures.length - 3} more)` : '';
  return `reasoning declined per §7.2.3 after retries; final-attempt failures: ${summary}${more}`;
}

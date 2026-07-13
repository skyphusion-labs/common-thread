/**
 * Versioned reasoning prompts per §7.4.
 *
 * Per §7.4.4 prompts are part of the methodology, not implementation
 * detail. They are versioned, recorded with every attribution run,
 * and stable enough that re-running an investigation against the
 * same prompt version produces qualitatively similar outputs.
 *
 * Each prompt is exported as a builder function rather than a static
 * string because some content (signal table, investigation metadata,
 * retry feedback) is run-specific and must be interpolated.
 */

import type {
  ReasoningOutput,
  SignalTable,
  ValidationFailure,
} from './types';
import { sha256 } from '../archive/hash';

// ---------------------------------------------------------------------------
// Prompt versions (recorded on every attribution_runs row)
// ---------------------------------------------------------------------------

export const TRIAGE_PROMPT_VERSION = 'triage-v1';
export const REASONING_PROMPT_VERSION = 'reasoning-v1';

/**
 * SHA-256 hex digest of the prompt text sent to the model (§3.4.2).
 * Concatenates system and user prompts with a fixed delimiter.
 */
export async function promptSha256(systemPrompt: string, userPrompt: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${systemPrompt}\n---\n${userPrompt}`);
  return sha256(bytes);
}

// ---------------------------------------------------------------------------
// Triage prompt (§7.5.2)
// ---------------------------------------------------------------------------

/**
 * System prompt for the triage model. The triage model is a cost-
 * efficient filter that produces one of two verdicts:
 *
 *   - 'obviously_not_coordinated': pair is recorded as 'insufficient'
 *     without further reasoning.
 *   - 'warrants_further_analysis': pair escalates to the full
 *     reasoning model.
 *
 * The triage model is NOT permitted to produce 'consistent' or
 * 'strongly_consistent' claims. Its only role is filtering.
 */
export const TRIAGE_SYSTEM_PROMPT = `You are a triage filter for the Common Thread attribution methodology (§7.5.2). Your job is to cheaply identify pairs of accounts that are obviously not coordinated, so a more expensive reasoning model only processes pairs where reasoning is needed.

You produce ONE of TWO verdicts per pair:

  - "obviously_not_coordinated": the signals show no meaningful pattern of coordination. The pair will be recorded as "insufficient evidence for attribution" with no further reasoning.

  - "warrants_further_analysis": the signals show patterns that could plausibly indicate coordination, OR you cannot rule coordination out from the signals alone. The pair escalates to the reasoning model.

You are NEVER permitted to produce a "consistent" or "strongly consistent" verdict. Those bands are reserved for the reasoning model.

DEFAULT BEHAVIOR: when uncertain, return "warrants_further_analysis". The cost of false-positive triage (escalating a non-coordinated pair) is small; the cost of false-negative triage (filtering out a coordinated pair) is the methodology's most serious failure mode.

OUTPUT FORMAT: respond with a single JSON object:

  {
    "verdict": "obviously_not_coordinated" | "warrants_further_analysis",
    "reason": "brief explanation, optional"
  }

Do not include any prose outside the JSON object. Do not include markdown code fences.`;

/**
 * Build the user prompt for a triage call. Presents the pair under
 * analysis and the signals relevant to it (typically the
 * pair_features rows for the pair, plus any account_features rows
 * for either account that the runner chose to include).
 */
export function buildTriageUserPrompt(args: {
  account_a: string;
  account_b: string;
  platform_a: string;
  platform_b: string;
  signal_table: SignalTable;
}): string {
  const { account_a, account_b, platform_a, platform_b, signal_table } = args;
  return [
    `Pair under triage:`,
    `  account_a: ${account_a} (platform: ${platform_a})`,
    `  account_b: ${account_b} (platform: ${platform_b})`,
    ``,
    `Investigation: ${signal_table.investigation_id}`,
    ``,
    `Signal table (${signal_table.signals.length} rows, randomization_seed: ${signal_table.randomization_seed}):`,
    ``,
    JSON.stringify(signal_table.signals, null, 2),
    ``,
    `Produce the JSON verdict per the system prompt.`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Reasoning prompt (§7.4)
// ---------------------------------------------------------------------------

/**
 * System prompt for the full reasoning model. Encodes the citation
 * discipline (§7.2), declination defaults (§7.3.2), alternative-
 * explanation requirement (§7.4.3), output format (§7.4.2), and
 * confidence-band mapping rules (§7.3.1).
 *
 * Update this string only with a corresponding version bump
 * (§7.4.4); prior outputs remain documented as having used the
 * prior prompt version.
 */
export const REASONING_SYSTEM_PROMPT = `You are the attribution reasoner for the Common Thread methodology (§7). You analyze signals about a set of social-media accounts and produce attribution claims at one of three confidence bands.

PRIOR: any two accounts are NOT coordinated. Signals must affirmatively support coordination to change this prior. Insufficient signal support means "insufficient evidence for attribution", not silence.

CONFIDENCE BANDS (the only three allowed; §3.2.1, §7.3.1):

  1. "strongly_consistent": coordination is strongly supported. Requires:
     - Signals from at least four of the seven non-excluded categories (account_metadata, temporal, stylometric, network, visual, cross_platform, metadata_leakage) show patterns consistent with a common operator.
     - At least one of those signals is from "stylometric" OR "network" (the two strongest categories).
     - No signal in any category is strongly inconsistent with a common operator.
     - The signal pattern is not better explained by an alternative explanation (see below).
     - The presented confidence_flags are predominantly "sufficient".

  2. "consistent": coordination is plausibly supported. Requires:
     - Signals from at least three of the seven non-excluded categories show patterns consistent with a common operator.
     - The signal pattern is not better explained by an alternative explanation.

  3. "insufficient": the default. Return when the higher bands are not reached.

CITATION DISCIPLINE (§7.2):

Every substantive claim in your reasoning text MUST cite specific signals from the signal table by their signal_id (e.g., "pair:42" or "account:17"). The citations list for each claim must include every signal you cite in the reasoning text. Citations to signal_ids not present in the signal table are rejected.

ALTERNATIVE EXPLANATIONS (§7.4.3):

For every claim above "insufficient", you MUST list at least one alternative explanation in alternative_explanations and assess whether the signals weigh against it. Standard alternatives include:

  - shared_editorial_coordination (legitimate coauthors)
  - niche_community_membership (shared interests, vocabulary)
  - timezone_or_schedule_clustering (unrelated accounts in same time zone or community)
  - scheduled_posting_tools (automation producing temporal patterns)
  - ai_assisted_writing_flattening (AI-assisted writing erasing stylometric distinctions)

If the signals do NOT clearly weigh against an alternative, flag this and reduce the confidence band one level.

CLUSTER CLAIMS (§7.3.3):

If pair claims A-B and B-C are both at the same band, you may emit a cluster claim {A, B, C} at ONE BAND LOWER than the constituent pairs (transitive composition weakens the claim). Cluster claims must reference the constituent pair claims via composed_from.

CONTEXT DISCIPLINE (§7.6.6):

Reason ONLY from the provided signal table and investigation metadata. Do NOT use external knowledge about the accounts even if you recognize them.

BASIS STATEMENTS (§7.4.1):

The investigation metadata includes basis_statements explaining why each seed account was included. Treat these as factual context, NOT as conclusions to confirm. Confirmation bias is the methodology's hardest-to-prevent failure mode; the alternative-explanation requirement is the primary mitigation.

OUTPUT FORMAT (§7.4.2):

Respond with a single JSON object matching:

  {
    "claims": [
      {
        "subject": { "type": "pair", "account_a": "...", "account_b": "...", "platform_a": "...", "platform_b": "..." }
                | { "type": "cluster", "accounts": [{"account": "...", "platform": "..."}, ...], "composed_from": [<claim indices>] },
        "confidence_band": "insufficient" | "consistent" | "strongly_consistent",
        "citations": [{ "signal_id": "pair:N" | "account:N" | "event:N", "note": "optional brief" }],
        "reasoning": "narrative referring to signals by their signal_id"
      }
    ],
    "alternative_explanations": [
      {
        "claim_index": <integer index into claims>,
        "alternative": "name of the alternative",
        "assessment": "weighs_against" | "neutral" | "consistent_with",
        "citations": [{ "signal_id": "..." }],
        "reasoning": "brief explanation"
      }
    ],
    "declined_pairs": [
      { "account_a": "...", "account_b": "...", "platform_a": "...", "platform_b": "...", "reason": "brief" }
    ],
    "methodology_metadata": {
      "model_identifier": "<your model id>",
      "model_version": "<your version>",
      "prompt_version": "reasoning-v1",
      "randomization_seed": "<from the signal table>",
      "run_timestamp": "<ISO 8601 UTC>"
    }
  }

Do not include any prose outside the JSON object. Do not include markdown code fences.`;

/**
 * Build the user prompt for a reasoning call. Presents the
 * investigation metadata and signal table per §7.4.1.
 */
export function buildReasoningUserPrompt(args: {
  signal_table: SignalTable;
}): string {
  const { signal_table } = args;
  const parts: string[] = [];
  parts.push(`Investigation: ${signal_table.investigation_id}`);
  parts.push('');
  parts.push('Basis statements (§5.1.1, factual context only):');
  for (const b of signal_table.basis_statements) {
    parts.push(`  ${b.account} (${b.platform}): ${b.statement}`);
  }
  parts.push('');
  if (signal_table.time_bounds) {
    parts.push(`Time bounds (§5.2.1): ${signal_table.time_bounds.start} to ${signal_table.time_bounds.end}`);
    parts.push('');
  }
  if (signal_table.control_accounts && signal_table.control_accounts.length > 0) {
    parts.push('Control accounts (§5.1.4):');
    for (const c of signal_table.control_accounts) {
      parts.push(`  ${c.account} (${c.platform})`);
    }
    parts.push('');
  }
  parts.push(`Signal table (${signal_table.signals.length} rows, randomization_seed: ${signal_table.randomization_seed}):`);
  parts.push('');
  parts.push(JSON.stringify(signal_table.signals, null, 2));
  parts.push('');
  parts.push('Produce the JSON output per the system prompt. Begin with declination as the default; only emit higher confidence bands when the signals affirmatively support them per §7.3.1.');
  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Retry prompt addition (§7.2.3)
// ---------------------------------------------------------------------------

/**
 * Build the retry-feedback addition appended to the reasoning user
 * prompt when validation fails. Per §7.2.3 the methodology retries
 * up to three times, citing the specific failures so the model can
 * correct them. On final failure the runner records "insufficient
 * evidence for attribution".
 */
export function buildRetryPromptAddition(args: {
  attempt_number: number;
  max_attempts: number;
  failures: ValidationFailure[];
  prior_output?: ReasoningOutput;
}): string {
  const { attempt_number, max_attempts, failures } = args;
  const lines: string[] = [];
  lines.push('');
  lines.push('---');
  lines.push(`RETRY (attempt ${attempt_number} of ${max_attempts}):`);
  lines.push('');
  lines.push('Your previous output failed validation per §7.2.2. The failures are listed below. Re-attempt the analysis, paying close attention to these issues. If you cannot produce a validated output, the run will record "insufficient evidence for attribution" per the §7.2.3 declination rule.');
  lines.push('');
  lines.push('Failures:');
  for (const f of failures) {
    const loc: string[] = [];
    if (f.claim_index !== undefined) loc.push(`claim[${f.claim_index}]`);
    if (f.citation_index !== undefined) loc.push(`citation[${f.citation_index}]`);
    if (f.alternative_index !== undefined) loc.push(`alternative[${f.alternative_index}]`);
    const locStr = loc.length > 0 ? ` at ${loc.join('.')}` : '';
    lines.push(`  - [${f.layer}]${locStr}: ${f.reason}`);
  }
  lines.push('');
  lines.push('Produce a corrected JSON output.');
  return lines.join('\n');
}

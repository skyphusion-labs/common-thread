/**
 * AI Gateway mocking helpers.
 *
 * Wraps the undici-style fetchMock exposed by @cloudflare/vitest-pool-workers
 * with shapers that build well-formed Anthropic /v1/messages responses
 * for the most common test scenarios:
 *
 *   - Triage: 'obviously_not_coordinated' or 'warrants_further_analysis'
 *   - Reasoning: a fully-formed ReasoningOutput (claims + alternatives +
 *     methodology_metadata) or a declination
 *   - Malformed responses for testing parse-failure paths
 *
 * The AI Gateway origin must match what's configured in vitest.config.ts
 * (https://gateway.test/anthropic). The intercept path is the /v1/messages
 * suffix that ai-gateway.ts appends.
 *
 * fetchMock intercepts each call once. Tests that issue N triage + M
 * reasoning calls need N + M intercepts queued before the runner call.
 * The convenience helpers below queue one intercept per call.
 */

import { fetchMock } from 'cloudflare:test';

import type {
  AlternativeExplanation,
  ReasoningClaim,
  ReasoningOutput,
  TriageVerdict,
} from '../../implementation/reasoner/types';

const ORIGIN = 'https://gateway.test';
const PATH = '/anthropic/v1/messages';

// ---------------------------------------------------------------------------
// Triage
// ---------------------------------------------------------------------------

export interface MockTriageOpts {
  verdict: TriageVerdict;
  reason?: string;
  /** Override the response model field. Default 'claude-haiku-4-5-20260101'. */
  modelVersion?: string;
}

export function mockTriageResponse(opts: MockTriageOpts): void {
  const body = {
    verdict: opts.verdict,
    ...(opts.reason ? { reason: opts.reason } : {}),
  };
  queueAnthropicResponse({
    modelVersion: opts.modelVersion ?? 'claude-haiku-4-5-20260101',
    text: JSON.stringify(body),
  });
}

/**
 * Queue a triage response that returns malformed JSON, exercising the
 * §7.5.2 conservative-escalation path in triage.ts.
 */
export function mockTriageMalformed(text: string): void {
  queueAnthropicResponse({
    modelVersion: 'claude-haiku-4-5-20260101',
    text,
  });
}

// ---------------------------------------------------------------------------
// Reasoning
// ---------------------------------------------------------------------------

export interface MockReasoningOpts {
  claims?: ReasoningClaim[];
  alternative_explanations?: AlternativeExplanation[];
  declined_pairs?: ReasoningOutput['declined_pairs'];
  /** Override the response model field. Default 'claude-opus-4-7-20260101'. */
  modelVersion?: string;
  /** Override the seed embedded in methodology_metadata. */
  randomization_seed?: string;
}

export function mockReasoningResponse(opts: MockReasoningOpts): void {
  // methodology_metadata is overwritten by reasoner.ts regardless, but
  // the validator does require its fields to be present and non-empty.
  // Populate with placeholders the validator will accept.
  const output: ReasoningOutput = {
    claims: opts.claims ?? [],
    alternative_explanations: opts.alternative_explanations ?? [],
    declined_pairs: opts.declined_pairs ?? [],
    methodology_metadata: {
      model_identifier: 'placeholder',
      model_version: 'placeholder',
      prompt_version: 'placeholder',
      randomization_seed: opts.randomization_seed ?? 'placeholder',
      run_timestamp: new Date().toISOString(),
    },
  };
  queueAnthropicResponse({
    modelVersion: opts.modelVersion ?? 'claude-opus-4-7-20260101',
    text: JSON.stringify(output),
  });
}

/**
 * Queue a reasoning response that returns malformed text, exercising
 * the §7.2.3 retry-loop format-failure path.
 */
export function mockReasoningMalformed(text: string): void {
  queueAnthropicResponse({
    modelVersion: 'claude-opus-4-7-20260101',
    text,
  });
}

// ---------------------------------------------------------------------------
// Low-level intercept
// ---------------------------------------------------------------------------

interface QueueOpts {
  modelVersion: string;
  text: string;
}

function queueAnthropicResponse(opts: QueueOpts): void {
  const responseBody = {
    id: `msg_test_${Math.random().toString(36).slice(2)}`,
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: opts.text }],
    model: opts.modelVersion,
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
  fetchMock
    .get(ORIGIN)
    .intercept({ path: PATH, method: 'POST' })
    .reply(200, responseBody, {
      headers: { 'content-type': 'application/json' },
    });
}

/**
 * Queue an HTTP-level error response (e.g., 500 from the gateway) for
 * testing callLLM's non-200 error path. Not used by the bundled tests
 * but exposed for follow-on coverage.
 */
export function mockGatewayHttpError(status: number, body: string): void {
  fetchMock
    .get(ORIGIN)
    .intercept({ path: PATH, method: 'POST' })
    .reply(status, body);
}

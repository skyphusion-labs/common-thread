/**
 * Cloudflare AI Gateway routing for Anthropic /v1/messages.
 *
 * Per §7.5.2 the methodology uses two models (a cheap triage filter
 * and a full reasoning model) configurable independently. Both are
 * routed through a single Cloudflare AI Gateway endpoint, which adds
 * caching, rate limiting, and observability without requiring code
 * changes per provider.
 *
 * This module is the thin HTTP layer both `triage.ts` and `reasoner.ts`
 * consume. It is intentionally provider-coupled (Anthropic /v1/messages
 * request and response shape) rather than abstracted: introducing a
 * second provider would warrant a separate file rather than overloading
 * this one.
 *
 * Env contract (see wrangler.toml):
 *   AI_GATEWAY_URL    secret. Full base URL ending in '/anthropic',
 *                     e.g., 'https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/anthropic'
 *   ANTHROPIC_API_KEY secret. Anthropic API key for x-api-key header.
 *   TRIAGE_MODEL      var. Triage model identifier (e.g., 'claude-haiku-4-5').
 *   REASONING_MODEL   var. Reasoning model identifier (e.g., 'claude-opus-4-7').
 */

const ANTHROPIC_VERSION = '2023-06-01';
const MESSAGES_PATH = '/v1/messages';

/** Default wall-clock timeout per LLM attempt. */
export const DEFAULT_LLM_TIMEOUT_MS = 120_000;

/** Default transport-level retries on 429/5xx and network errors. */
export const DEFAULT_LLM_MAX_RETRIES = 3;

const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface LLMCallOptions {
  /**
   * Anthropic API key for the x-api-key header (BYOK / direct billing).
   * Optional: omit when using keyless Unified Billing via cfAigToken.
   */
  apiKey?: string;
  /**
   * Cloudflare AI Gateway token for keyless Unified Billing (#111). When
   * set, callLLM sends cf-aig-authorization and OMITS x-api-key, so the
   * gateway injects the upstream provider key and bills the account credit
   * instead of switching to BYOK/direct billing. Takes precedence over
   * apiKey when both are supplied.
   */
  cfAigToken?: string;
  /** Full base URL ending in '/anthropic'; '/v1/messages' is appended. */
  gatewayUrl: string;
  /** Model identifier passed to the Anthropic API (the alias). */
  model: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  /**
   * Optional. If set, override the default Anthropic temperature.
   * Triage and reasoner both default to undefined (provider default,
   * which is 1.0; methodology accepts the variability for triage
   * because the verdict space is binary, and for reasoning because
   * §7.2.3's retry loop + §7.2.2 validator catch malformed outputs).
   */
  temperature?: number;
  /** Per-attempt timeout in milliseconds. Default {@link DEFAULT_LLM_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Transport retries on 429/5xx and network errors. Default {@link DEFAULT_LLM_MAX_RETRIES}. */
  maxRetries?: number;
}

export interface LLMCallResult {
  /**
   * Concatenated text content from the response. The Anthropic API
   * returns a content array; for our usage all blocks are 'text' and
   * are joined in order.
   */
  text: string;
  /**
   * The provider-resolved model version string from the response
   * 'model' field, e.g., 'claude-opus-4-7-20260301'. Distinct from
   * the input `model` (which is the alias).
   */
  modelVersion: string;
  /** Anthropic stop_reason for diagnostic logging. */
  stopReason: string | null;
  /** Token usage for diagnostic / cost-tracking purposes. */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * True when an error originated from the LLM transport layer (timeout,
 * non-retryable exhaustion of retries, or non-200 after retries).
 * Callers use this to isolate per-pair failures in runAttribution.
 */
export function isLlmTransportError(err: unknown): err is Error {
  return err instanceof Error && err.name === 'LlmTransportError';
}

/**
 * Make one Anthropic /v1/messages call via the Cloudflare AI Gateway.
 * Retries transient 429/5xx and network failures with bounded backoff.
 * Throws {@link LlmTransportError} on timeout or exhausted retries.
 */
export async function callLLM(opts: LLMCallOptions): Promise<LLMCallResult> {
  const url = joinGatewayPath(opts.gatewayUrl, MESSAGES_PATH);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_LLM_MAX_RETRIES;

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: opts.userPrompt }],
  };
  if (typeof opts.temperature === 'number') {
    body.temperature = opts.temperature;
  }

  const authHeaders = buildAuthHeaders(opts);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '<unreadable>');
        const message = `AI Gateway request failed: HTTP ${res.status} ${res.statusText} for model '${opts.model}'. Body: ${errText.slice(0, 500)}`;
        if (RETRYABLE_HTTP_STATUSES.has(res.status) && attempt < maxRetries - 1) {
          lastError = new LlmTransportError(message);
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw new LlmTransportError(message);
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch (err) {
        throw new LlmTransportError(
          `AI Gateway response was not JSON for model '${opts.model}': ${err instanceof Error ? err.message : String(err)}`
        );
      }

      return parseLlmResponse(json, opts.model);
    } catch (err) {
      if (err instanceof LlmTransportError) {
        if (attempt < maxRetries - 1) {
          lastError = err;
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw err;
      }

      const message =
        err instanceof Error && err.name === 'AbortError'
          ? `AI Gateway request timed out after ${timeoutMs}ms for model '${opts.model}'`
          : `AI Gateway request failed for model '${opts.model}': ${err instanceof Error ? err.message : String(err)}`;

      if (attempt < maxRetries - 1) {
        lastError = new LlmTransportError(message);
        await sleep(retryDelayMs(attempt));
        continue;
      }
      throw new LlmTransportError(message);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new LlmTransportError(`AI Gateway request failed for model '${opts.model}'`);
}

export class LlmTransportError extends Error {
  override name = 'LlmTransportError';
}

/**
 * Build the request headers for one AI Gateway call, choosing the auth
 * mode (#111). Keyless Unified Billing (cfAigToken) is preferred: send
 * cf-aig-authorization and omit x-api-key so the gateway does not switch to
 * BYOK/direct billing. Otherwise fall back to the x-api-key path, which is
 * byte-identical to the prior behavior for external AGPL deployers.
 */
function buildAuthHeaders(opts: LLMCallOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': ANTHROPIC_VERSION,
  };
  if (opts.cfAigToken) {
    headers['cf-aig-authorization'] = `Bearer ${opts.cfAigToken}`;
  } else if (opts.apiKey) {
    headers['x-api-key'] = opts.apiKey;
  }
  return headers;
}

function parseLlmResponse(json: unknown, modelAlias: string): LLMCallResult {
  if (!json || typeof json !== 'object') {
    throw new LlmTransportError(
      `AI Gateway response was not an object for model '${modelAlias}'`
    );
  }

  const obj = json as Record<string, unknown>;
  const content = obj.content;
  if (!Array.isArray(content)) {
    throw new LlmTransportError(
      `AI Gateway response missing 'content' array for model '${modelAlias}'. Got keys: ${Object.keys(obj).join(', ')}`
    );
  }

  const textParts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as Record<string, unknown>).type === 'text') {
      const t = (block as Record<string, unknown>).text;
      if (typeof t === 'string') textParts.push(t);
    }
  }

  const usage = obj.usage as Record<string, unknown> | undefined;
  return {
    text: textParts.join(''),
    modelVersion: typeof obj.model === 'string' ? obj.model : modelAlias,
    stopReason: typeof obj.stop_reason === 'string' ? obj.stop_reason : null,
    usage: {
      inputTokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0,
      outputTokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0,
    },
  };
}

function retryDelayMs(attempt: number): number {
  // 1s, 2s, 4s capped at 8s.
  return Math.min(1000 * 2 ** attempt, 8000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function joinGatewayPath(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : '/' + path;
  return b + p;
}

/**
 * Extract the first JSON object from a model response. Robust to:
 *   - Leading/trailing whitespace
 *   - Markdown code fences (```json ... ``` or ``` ... ```), even
 *     though the prompts forbid them
 *   - Surrounding prose before/after the JSON, even though the
 *     prompts forbid it
 *
 * Throws if no parseable object is found. Callers decide whether to
 * retry, escalate, or decline on failure.
 */
export function extractJSONObject(text: string): unknown {
  let s = text.trim();

  // Strip a single layer of markdown code fences if present.
  if (s.startsWith('```')) {
    const firstNewline = s.indexOf('\n');
    if (firstNewline >= 0) s = s.slice(firstNewline + 1);
    const closingFence = s.lastIndexOf('```');
    if (closingFence >= 0) s = s.slice(0, closingFence);
    s = s.trim();
  }

  // Direct parse first; this is the prompt-conformant path.
  try {
    return JSON.parse(s);
  } catch {
    // Fall through to balanced-scan extraction.
  }

  // Fallback: scan the string and collect every balanced top-level
  // {...} substring, ignoring braces that appear inside string
  // literals. Try parsing them in order of longest to shortest so we
  // prefer the most-complete object when the model leaks both an
  // example and the real output, or when prose surrounds the JSON.
  // This handles cases like:
  //   "here is an example {"x":1} and the real answer {"a":1,"b":2}"
  // where the simple indexOf/lastIndexOf approach would slice across
  // both and produce invalid JSON.
  const candidates: string[] = [];
  let depth = 0;
  let openIdx = -1;
  let inString = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (c === '\\') {
        escape = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') {
      if (depth === 0) openIdx = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && openIdx >= 0) {
        candidates.push(s.slice(openIdx, i + 1));
        openIdx = -1;
      } else if (depth < 0) {
        // Stray closing brace; reset so a later balanced {...} can
        // still be captured.
        depth = 0;
        openIdx = -1;
      }
    }
  }

  if (candidates.length === 0) {
    throw new Error('No JSON object found in response text');
  }

  candidates.sort((a, b) => b.length - a.length);
  let lastErr: unknown;
  for (const cand of candidates) {
    try {
      return JSON.parse(cand);
    } catch (err) {
      lastErr = err;
    }
  }
  // Surface the last parse error so callers see the SyntaxError
  // shape they would have seen from a direct JSON.parse call.
  throw lastErr;
}

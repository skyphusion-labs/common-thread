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

export interface LLMCallOptions {
  apiKey: string;
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
 * Make one Anthropic /v1/messages call via the Cloudflare AI Gateway.
 * Throws on network error, non-200 HTTP status, or malformed response
 * shape. Callers (triage.ts, reasoner.ts) handle their own retry /
 * declination semantics.
 */
export async function callLLM(opts: LLMCallOptions): Promise<LLMCallResult> {
  const url = joinGatewayPath(opts.gatewayUrl, MESSAGES_PATH);

  const body: Record<string, unknown> = {
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: opts.userPrompt }],
  };
  if (typeof opts.temperature === 'number') {
    body.temperature = opts.temperature;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '<unreadable>');
    throw new Error(
      `AI Gateway request failed: HTTP ${res.status} ${res.statusText} for model '${opts.model}'. Body: ${errText.slice(0, 500)}`
    );
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new Error(
      `AI Gateway response was not JSON for model '${opts.model}': ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!json || typeof json !== 'object') {
    throw new Error(`AI Gateway response was not an object for model '${opts.model}'`);
  }

  const obj = json as Record<string, unknown>;
  const content = obj.content;
  if (!Array.isArray(content)) {
    throw new Error(
      `AI Gateway response missing 'content' array for model '${opts.model}'. Got keys: ${Object.keys(obj).join(', ')}`
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
    modelVersion: typeof obj.model === 'string' ? obj.model : opts.model,
    stopReason: typeof obj.stop_reason === 'string' ? obj.stop_reason : null,
    usage: {
      inputTokens: typeof usage?.input_tokens === 'number' ? usage.input_tokens : 0,
      outputTokens: typeof usage?.output_tokens === 'number' ? usage.output_tokens : 0,
    },
  };
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
    // Fall through to brace-extraction.
  }

  // Fallback: take the outermost {...}. This handles cases where the
  // model leaks a sentence of prose before or after the object.
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) {
    const slice = s.slice(start, end + 1);
    return JSON.parse(slice); // re-throws if still malformed
  }

  throw new Error('No JSON object found in response text');
}

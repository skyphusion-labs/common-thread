/**
 * Resolve Anthropic / AI Gateway credentials for attribution.
 *
 * Server env secrets are used when present. Callers may override via
 * request headers or JSON body (BYOK for public deployments).
 */

export interface AttributionCredentials {
  aiGatewayUrl: string;
  anthropicApiKey: string;
  source: 'request' | 'environment';
}

export interface ResolveAttributionCredentialsInput {
  envAiGatewayUrl?: string;
  envAnthropicApiKey?: string;
  requestHeaders: Headers;
  body?: Record<string, unknown>;
}

const HEADER_AI_GATEWAY_URL = 'x-ai-gateway-url';
const HEADER_ANTHROPIC_API_KEY = 'x-anthropic-api-key';

function readBodyString(
  body: Record<string, unknown> | undefined,
  ...keys: string[]
): string | undefined {
  if (!body) return undefined;
  for (const key of keys) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

export function resolveAttributionCredentials(
  input: ResolveAttributionCredentialsInput
): AttributionCredentials | { error: string } {
  const fromHeaderGateway = input.requestHeaders.get(HEADER_AI_GATEWAY_URL)?.trim();
  const fromHeaderKey = input.requestHeaders.get(HEADER_ANTHROPIC_API_KEY)?.trim();
  const fromBodyGateway = readBodyString(
    input.body,
    'aiGatewayUrl',
    'ai_gateway_url'
  );
  const fromBodyKey = readBodyString(
    input.body,
    'anthropicApiKey',
    'anthropic_api_key'
  );

  const requestGateway = fromHeaderGateway || fromBodyGateway;
  const requestKey = fromHeaderKey || fromBodyKey;
  const usedRequest = Boolean(requestGateway || requestKey);

  const aiGatewayUrl = requestGateway || input.envAiGatewayUrl?.trim() || '';
  const anthropicApiKey = requestKey || input.envAnthropicApiKey?.trim() || '';

  if (!aiGatewayUrl || !anthropicApiKey) {
    return {
      error: usedRequest
        ? 'Attribution requires both AI Gateway URL and Anthropic API key. Provide X-AI-Gateway-Url and X-Anthropic-Api-Key headers, or aiGatewayUrl and anthropicApiKey in the request body.'
        : 'Attribution requires AI Gateway URL and Anthropic API key. Configure server secrets or supply credentials with the request (BYOK).',
    };
  }

  return {
    aiGatewayUrl,
    anthropicApiKey,
    source: usedRequest ? 'request' : 'environment',
  };
}

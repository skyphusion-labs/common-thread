/**
 * Resolve Anthropic / AI Gateway credentials for attribution.
 *
 * Server env secrets are used when present. Callers may override via
 * request headers or JSON body (BYOK for public deployments).
 *
 * AI Gateway URLs are validated before return so server-side fetches cannot
 * be redirected to private or arbitrary hosts (SSRF).
 */

export const DEFAULT_AI_GATEWAY_ALLOWED_HOSTS = [
  'gateway.ai.cloudflare.com',
] as const;

export interface AttributionCredentials {
  aiGatewayUrl: string;
  anthropicApiKey: string;
  /**
   * Keyless Unified Billing token (#111), set only from server env and only
   * when the request did not supply its own (BYOK) credentials. When present
   * it takes precedence over anthropicApiKey at the transport layer.
   */
  cfAigToken?: string;
  source: 'request' | 'environment';
}

export interface ResolveAttributionCredentialsInput {
  envAiGatewayUrl?: string;
  envAnthropicApiKey?: string;
  /** Server-only keyless Unified Billing token (#111). Never sourced from a request. */
  envCfAigToken?: string;
  requestHeaders: Headers;
  body?: Record<string, unknown>;
  /** Hostnames permitted for AI Gateway URLs (default: Cloudflare AI Gateway). */
  allowedGatewayHosts?: readonly string[];
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

function isIpv4Host(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  return match.slice(1).every((octet) => {
    const value = Number(octet);
    return value >= 0 && value <= 255;
  });
}

function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  if (isIpv4Host(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (host.includes(':')) {
    if (host === '::1') return true;
    if (host.startsWith('fe80:')) return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
    if (host.startsWith('::ffff:')) {
      const mapped = host.slice('::ffff:'.length);
      if (isIpv4Host(mapped)) return isPrivateOrReservedHost(mapped);
    }
  }

  return false;
}

function isHostAllowed(hostname: string, allowedHosts: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((allowed) => {
    const permitted = allowed.toLowerCase();
    return host === permitted || host.endsWith(`.${permitted}`);
  });
}

/**
 * Validate a caller- or env-supplied AI Gateway base URL before any fetch.
 * Fails closed: malformed, non-HTTPS, disallowed, or reserved hosts are rejected.
 */
export function validateAiGatewayUrl(
  raw: string,
  allowedHosts: readonly string[] = DEFAULT_AI_GATEWAY_ALLOWED_HOSTS
): { url: string } | { error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: 'AI Gateway URL is not a valid URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { error: 'AI Gateway URL must use HTTPS.' };
  }

  if (parsed.username || parsed.password) {
    return { error: 'AI Gateway URL must not include credentials.' };
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    return { error: 'AI Gateway URL has no host.' };
  }

  if (isPrivateOrReservedHost(hostname)) {
    return {
      error:
        'AI Gateway URL must not target private, link-local, or loopback hosts.',
    };
  }

  const hosts =
    allowedHosts.length > 0 ? allowedHosts : DEFAULT_AI_GATEWAY_ALLOWED_HOSTS;
  if (!isHostAllowed(hostname, hosts)) {
    return {
      error: `AI Gateway URL host is not permitted. Allowed hosts: ${hosts.join(', ')}.`,
    };
  }

  return {
    url: `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}`,
  };
}

export function parseAllowedGatewayHosts(
  configured?: string
): readonly string[] {
  if (!configured?.trim()) return DEFAULT_AI_GATEWAY_ALLOWED_HOSTS;
  const hosts = configured
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return hosts.length > 0 ? hosts : DEFAULT_AI_GATEWAY_ALLOWED_HOSTS;
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

  // Keyless Unified Billing token (#111) is a server-only secret. It is used
  // only when the request did not supply its own credentials, so BYOK stays
  // on the x-api-key path and a user request can never present the house
  // token. When configured it satisfies the auth requirement on its own and
  // takes precedence over a server x-api-key at the transport layer.
  const cfAigToken = usedRequest
    ? undefined
    : input.envCfAigToken?.trim() || undefined;

  if (!aiGatewayUrl || !(cfAigToken || anthropicApiKey)) {
    return {
      error: usedRequest
        ? 'Attribution requires both AI Gateway URL and Anthropic API key. Provide X-AI-Gateway-Url and X-Anthropic-Api-Key headers, or aiGatewayUrl and anthropicApiKey in the request body.'
        : 'Attribution requires an AI Gateway URL and server credentials. Configure AI_GATEWAY_URL plus either CF_AIG_TOKEN (keyless Unified Billing) or ANTHROPIC_API_KEY, or supply credentials with the request (BYOK).',
    };
  }

  const allowedHosts =
    input.allowedGatewayHosts ?? DEFAULT_AI_GATEWAY_ALLOWED_HOSTS;
  const validated = validateAiGatewayUrl(aiGatewayUrl, allowedHosts);
  if ('error' in validated) {
    return { error: validated.error };
  }

  return {
    aiGatewayUrl: validated.url,
    anthropicApiKey,
    cfAigToken,
    source: usedRequest ? 'request' : 'environment',
  };
}

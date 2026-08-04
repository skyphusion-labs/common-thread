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
   * Keyless Unified Billing token (#111). From server env (operator path) or
   * from the request (visitor BYOK with their own AI Gateway Run token). When
   * present it takes precedence over anthropicApiKey at the transport layer.
   * A request never receives the *server's* token -- only a token the caller
   * supplied (or the env token when the call is fully server-sourced).
   */
  cfAigToken?: string;
  source: 'request' | 'environment';
}

export interface ResolveAttributionCredentialsInput {
  envAiGatewayUrl?: string;
  envAnthropicApiKey?: string;
  /** Server keyless Unified Billing token (#111). Not mixed into request-BYOK. */
  envCfAigToken?: string;
  requestHeaders: Headers;
  body?: Record<string, unknown>;
  /** Hostnames permitted for AI Gateway URLs (default: Cloudflare AI Gateway). */
  allowedGatewayHosts?: readonly string[];
  /**
   * When true (PUBLIC_BYOK_ONLY on the public hosted Worker), server-side AI
   * credentials are ignored entirely and visitor BYOK is required. Code-
   * enforced fail-closed so a mistakenly-set server secret cannot be ridden by
   * an anonymous, credential-less caller (#187 non-negotiable).
   */
  publicByokOnly?: boolean;
}

const HEADER_AI_GATEWAY_URL = 'x-ai-gateway-url';
const HEADER_ANTHROPIC_API_KEY = 'x-anthropic-api-key';
/** Visitor-supplied AI Gateway Run token (keyless Unified Billing BYOK). */
const HEADER_CF_AIG_TOKEN = 'x-cf-aig-token';

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
): AttributionCredentials | { error: string; code?: 'byok_required' } {
  const fromHeaderGateway = input.requestHeaders.get(HEADER_AI_GATEWAY_URL)?.trim();
  const fromHeaderKey = input.requestHeaders.get(HEADER_ANTHROPIC_API_KEY)?.trim();
  const fromHeaderCfAig = input.requestHeaders.get(HEADER_CF_AIG_TOKEN)?.trim();
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
  const fromBodyCfAig = readBodyString(input.body, 'cfAigToken', 'cf_aig_token');

  const requestGateway = fromHeaderGateway || fromBodyGateway;
  const requestKey = fromHeaderKey || fromBodyKey;
  const requestCfAig = fromHeaderCfAig || fromBodyCfAig;
  // Any request-supplied auth material puts the call on the request path.
  const usedRequest = Boolean(requestGateway || requestKey || requestCfAig);

  // #187 non-negotiable: when the deployment is BYOK-only (the public hosted
  // Worker sets PUBLIC_BYOK_ONLY), server-side AI credentials are ignored
  // ENTIRELY. A mistakenly-set AI_GATEWAY_URL / ANTHROPIC_API_KEY / CF_AIG_TOKEN
  // therefore cannot be ridden by an anonymous, credential-less caller: fail-
  // closed is enforced in code, not left to operational discipline.
  const byokOnly = input.publicByokOnly === true;
  const envAiGatewayUrl = byokOnly ? '' : input.envAiGatewayUrl?.trim() || '';
  const envAnthropicApiKey = byokOnly ? '' : input.envAnthropicApiKey?.trim() || '';
  const envCfAigToken = byokOnly ? '' : input.envCfAigToken?.trim() || '';

  // Same-source BYOK (confused-deputy hardening, #187): when the caller supplies
  // ANY credential, gateway + auth must come from the request. Server-side
  // credentials are never backfilled into a request-driven call, so a
  // server-held ANTHROPIC_API_KEY / CF_AIG_TOKEN can never be sent to a
  // caller-chosen gateway that the caller controls and can log.
  const aiGatewayUrl = usedRequest ? requestGateway || '' : envAiGatewayUrl;
  const anthropicApiKey = usedRequest ? requestKey || '' : envAnthropicApiKey;
  const cfAigToken = usedRequest
    ? requestCfAig || undefined
    : envCfAigToken || undefined;

  if (!aiGatewayUrl || !(cfAigToken || anthropicApiKey)) {
    // Under BYOK-only, a caller who supplied no credentials at all gets a
    // stable, machine-readable code that clients branch on (mapped to HTTP
    // 400 at the route). Distinct from the generic 503 so 'bring your own
    // key' is never confused with a server misconfiguration.
    if (byokOnly && !usedRequest) {
      return {
        error:
          'This hosted instance runs attribution with your own credentials. Supply an AI Gateway URL plus either an Anthropic API key (X-Anthropic-Api-Key / anthropicApiKey) or an AI Gateway Run token (X-CF-AIG-Token / cfAigToken).',
        code: 'byok_required',
      };
    }
    return {
      error: usedRequest
        ? 'Attribution requires an AI Gateway URL and either an Anthropic API key or an AI Gateway Run token (cfAigToken), all from the same source (request). Provide X-AI-Gateway-Url plus X-Anthropic-Api-Key or X-CF-AIG-Token (or the matching body fields).'
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

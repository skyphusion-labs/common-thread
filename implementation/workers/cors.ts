/**
 * Browser CORS gate for the public HTTP API.
 *
 * Only origins listed in CORS_ALLOWED_ORIGINS may call the API from browser
 * JavaScript. Requests without an Origin header (curl, service bindings, etc.)
 * are unaffected.
 */

import {
  CORS_FORBIDDEN_MESSAGE,
  HOSTED_API_CONTACT_EMAIL,
} from './contact';

export interface CorsEnv {
  CORS_ALLOWED_ORIGINS?: string;
}

const ALLOWED_METHODS = 'GET, HEAD, POST, DELETE, OPTIONS';
const ALLOWED_HEADERS =
  'Authorization, Content-Type, X-Investigation-Token, X-AI-Gateway-Url, X-Anthropic-Api-Key';
const MAX_AGE = '86400';

export function parseAllowedOrigins(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(',')
      .map(o => o.trim())
      .filter(Boolean)
  );
}

export function resolveAllowedOrigin(origin: string, allowed: Set<string>): string | null {
  if (!allowed.has(origin)) return null;
  return origin;
}

export function corsPreflightResponse(request: Request, env: CorsEnv): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const origin = request.headers.get('Origin');
  if (!origin) return null;

  const allowed = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  const match = resolveAllowedOrigin(origin, allowed);
  if (!match) {
    return corsForbiddenResponse();
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(match),
  });
}

export function corsForbiddenResponse(): Response {
  return new Response(
    JSON.stringify(
      {
        error: CORS_FORBIDDEN_MESSAGE,
        code: 'cors_forbidden',
        contact: HOSTED_API_CONTACT_EMAIL,
      },
      null,
      2
    ) + '\n',
    {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/** Reject browser requests from origins not on the allowlist. */
export function assertBrowserOriginAllowed(request: Request, env: CorsEnv): Response | null {
  const origin = request.headers.get('Origin');
  if (!origin) return null;

  const allowed = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  if (resolveAllowedOrigin(origin, allowed)) return null;
  return corsForbiddenResponse();
}

export function withCors(response: Response, request: Request, env: CorsEnv): Response {
  const origin = request.headers.get('Origin');
  if (!origin) return response;

  const allowed = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);
  const match = resolveAllowedOrigin(origin, allowed);
  if (!match) return response;

  const headers = new Headers(response.headers);
  for (const [key, value] of corsHeaders(match)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsHeaders(origin: string): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  headers.set('Access-Control-Max-Age', MAX_AGE);
  headers.set('Vary', 'Origin');
  return headers;
}

import { describe, expect, it } from 'vitest';
import {
  assertBrowserOriginAllowed,
  corsPreflightResponse,
  parseAllowedOrigins,
  withCors,
} from '../../implementation/workers/cors';

const env = { CORS_ALLOWED_ORIGINS: 'https://app.example.com,https://other.example.com' };

describe('CORS allowlist', () => {
  it('parseAllowedOrigins splits comma-separated origins', () => {
    expect([...parseAllowedOrigins('https://a.test, https://b.test')]).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
    expect(parseAllowedOrigins('').size).toBe(0);
    expect(parseAllowedOrigins(undefined).size).toBe(0);
  });

  it('allows requests without an Origin header', () => {
    const req = new Request('http://localhost/investigations', { method: 'GET' });
    expect(assertBrowserOriginAllowed(req, env)).toBeNull();
  });

  it('allows preflight from an allowlisted origin', () => {
    const req = new Request('http://localhost/investigations', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Authorization',
      },
    });
    const res = corsPreflightResponse(req, env);
    expect(res?.status).toBe(204);
    expect(res?.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(res?.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('blocks preflight from unknown origins', () => {
    const req = new Request('http://localhost/investigations', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com' },
    });
    const res = corsPreflightResponse(req, env)!;
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('blocks browser requests from unknown origins', async () => {
    const req = new Request('http://localhost/investigations', {
      method: 'GET',
      headers: { Origin: 'https://evil.example.com' },
    });
    const res = assertBrowserOriginAllowed(req, env)!;
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code?: string; contact?: string };
    expect(body.code).toBe('cors_forbidden');
    expect(body.contact).toBe('common-thread@skyphusion.org');
  });

  it('adds CORS headers to responses for allowlisted origins', () => {
    const req = new Request('http://localhost/', {
      headers: { Origin: 'https://app.example.com' },
    });
    const res = withCors(new Response('ok', { status: 200 }), req, env);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    expect(res.headers.get('Vary')).toBe('Origin');
  });
});

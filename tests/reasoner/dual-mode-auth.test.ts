/**
 * Dual-mode AI Gateway auth (#111).
 *
 * callLLM authenticates one of two ways:
 *   - Keyless Unified Billing: cf-aig-authorization: Bearer <CF_AIG_TOKEN>,
 *     x-api-key omitted (the house standard; the gateway injects the provider
 *     key and bills account credit).
 *   - BYOK / direct: x-api-key: <ANTHROPIC_API_KEY> (byte-identical to the
 *     prior behavior; external AGPL deployers keep this).
 * The token wins when both are supplied. Per-request BYOK is unaffected, and a
 * request can never present the server-only token.
 *
 * Header assertions spy on global fetch to read the outgoing headers.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { callLLM } from '../../implementation/reasoner/ai-gateway';
import { resolveAttributionCredentials } from '../../implementation/reasoner/credentials';

function stubFetchCapturing() {
  let captured = new Headers();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init?: RequestInit) => {
    captured = new Headers(init?.headers as HeadersInit);
    return new Response(
      JSON.stringify({
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: '{"ok":true}' }],
        model: 'claude-x',
        stop_reason: 'end_turn',
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  });
  return () => captured;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('callLLM dual-mode auth (#111)', () => {
  const base = {
    gatewayUrl: 'https://gateway.test/anthropic',
    model: 'm',
    systemPrompt: 's',
    userPrompt: 'u',
    maxTokens: 16,
    maxRetries: 1,
  };

  it('key-only: sends x-api-key, no cf-aig-authorization', async () => {
    const headers = stubFetchCapturing();
    await callLLM({ ...base, apiKey: 'sk-key' });
    expect(headers().get('x-api-key')).toBe('sk-key');
    expect(headers().get('cf-aig-authorization')).toBeNull();
  });

  it('token-only: sends cf-aig-authorization, omits x-api-key', async () => {
    const headers = stubFetchCapturing();
    await callLLM({ ...base, cfAigToken: 'aig-tok' });
    expect(headers().get('cf-aig-authorization')).toBe('Bearer aig-tok');
    expect(headers().get('x-api-key')).toBeNull();
  });

  it('both: token wins (cf-aig-authorization set, x-api-key omitted)', async () => {
    const headers = stubFetchCapturing();
    await callLLM({ ...base, apiKey: 'sk-key', cfAigToken: 'aig-tok' });
    expect(headers().get('cf-aig-authorization')).toBe('Bearer aig-tok');
    expect(headers().get('x-api-key')).toBeNull();
  });
});

describe('resolveAttributionCredentials dual-mode (#111)', () => {
  const noReq = new Headers();
  const allowed = ['gateway.test'];
  const gw = 'https://gateway.test/anthropic';

  it('env CF_AIG_TOKEN -> source environment, cfAigToken set', () => {
    const c = resolveAttributionCredentials({
      envAiGatewayUrl: gw,
      envCfAigToken: 'aig-tok',
      requestHeaders: noReq,
      allowedGatewayHosts: allowed,
    });
    if ('error' in c) throw new Error(c.error);
    expect(c.source).toBe('environment');
    expect(c.cfAigToken).toBe('aig-tok');
  });

  it('server token takes precedence over a server x-api-key when both set', () => {
    const c = resolveAttributionCredentials({
      envAiGatewayUrl: gw,
      envCfAigToken: 'aig-tok',
      envAnthropicApiKey: 'sk-env',
      requestHeaders: noReq,
      allowedGatewayHosts: allowed,
    });
    if ('error' in c) throw new Error(c.error);
    expect(c.cfAigToken).toBe('aig-tok');
    expect(c.source).toBe('environment');
  });

  it('key-only env stays byte-identical: anthropicApiKey set, no token', () => {
    const c = resolveAttributionCredentials({
      envAiGatewayUrl: gw,
      envAnthropicApiKey: 'sk-env',
      requestHeaders: noReq,
      allowedGatewayHosts: allowed,
    });
    if ('error' in c) throw new Error(c.error);
    expect(c.anthropicApiKey).toBe('sk-env');
    expect(c.cfAigToken).toBeUndefined();
    expect(c.source).toBe('environment');
  });

  it('BYOK request stays x-api-key; the server token is never used for a request', () => {
    const req = new Headers({
      'x-anthropic-api-key': 'sk-byok',
      'x-ai-gateway-url': gw,
    });
    const c = resolveAttributionCredentials({
      envCfAigToken: 'aig-tok',
      requestHeaders: req,
      allowedGatewayHosts: allowed,
    });
    if ('error' in c) throw new Error(c.error);
    expect(c.source).toBe('request');
    expect(c.anthropicApiKey).toBe('sk-byok');
    expect(c.cfAigToken).toBeUndefined();
  });

  it('errors when neither a token nor a key is configured', () => {
    const c = resolveAttributionCredentials({
      envAiGatewayUrl: gw,
      requestHeaders: noReq,
      allowedGatewayHosts: allowed,
    });
    expect('error' in c).toBe(true);
  });
});

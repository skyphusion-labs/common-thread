import { describe, expect, it } from 'vitest';
import { resolveAttributionCredentials } from '../../implementation/reasoner/credentials';

describe('resolveAttributionCredentials', () => {
  it('uses environment secrets when request omits credentials', () => {
    const result = resolveAttributionCredentials({
      envAiGatewayUrl: 'https://gateway.example/anthropic',
      envAnthropicApiKey: 'env-key',
      requestHeaders: new Headers(),
    });

    expect(result).toEqual({
      aiGatewayUrl: 'https://gateway.example/anthropic',
      anthropicApiKey: 'env-key',
      source: 'environment',
    });
  });

  it('prefers request headers over environment secrets', () => {
    const headers = new Headers({
      'x-ai-gateway-url': 'https://api.anthropic.com',
      'x-anthropic-api-key': 'user-key',
    });

    const result = resolveAttributionCredentials({
      envAiGatewayUrl: 'https://gateway.example/anthropic',
      envAnthropicApiKey: 'env-key',
      requestHeaders: headers,
    });

    expect(result).toEqual({
      aiGatewayUrl: 'https://api.anthropic.com',
      anthropicApiKey: 'user-key',
      source: 'request',
    });
  });

  it('accepts snake_case body fields', () => {
    const result = resolveAttributionCredentials({
      requestHeaders: new Headers(),
      body: {
        ai_gateway_url: 'https://api.anthropic.com',
        anthropic_api_key: 'body-key',
      },
    });

    expect(result).toEqual({
      aiGatewayUrl: 'https://api.anthropic.com',
      anthropicApiKey: 'body-key',
      source: 'request',
    });
  });

  it('returns an error when credentials are incomplete', () => {
    const result = resolveAttributionCredentials({
      requestHeaders: new Headers({ 'x-anthropic-api-key': 'only-key' }),
    });

    expect(result).toMatchObject({ error: expect.stringContaining('both') });
  });
});

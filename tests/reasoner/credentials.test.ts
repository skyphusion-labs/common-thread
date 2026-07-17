import { describe, expect, it } from 'vitest';
import {
  resolveAttributionCredentials,
  validateAiGatewayUrl,
} from '../../implementation/reasoner/credentials';

const TEST_ALLOWED_HOSTS = ['gateway.example', 'api.anthropic.com'] as const;

const withAllowedHosts = (
  input: Parameters<typeof resolveAttributionCredentials>[0]
) => ({
  ...input,
  allowedGatewayHosts: TEST_ALLOWED_HOSTS,
});

describe('validateAiGatewayUrl', () => {
  it('accepts HTTPS URLs on the allowlist', () => {
    expect(
      validateAiGatewayUrl('https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic')
    ).toEqual({
      url: 'https://gateway.ai.cloudflare.com/v1/acct/gw/anthropic',
    });
  });

  it('rejects non-HTTPS schemes', () => {
    expect(validateAiGatewayUrl('http://gateway.ai.cloudflare.com/anthropic')).toEqual({
      error: 'AI Gateway URL must use HTTPS.',
    });
  });

  it('rejects unparseable URLs', () => {
    expect(validateAiGatewayUrl('not a url')).toEqual({
      error: 'AI Gateway URL is not a valid URL.',
    });
  });

  it('rejects hosts outside the allowlist', () => {
    expect(
      validateAiGatewayUrl('https://evil.example/anthropic', ['gateway.ai.cloudflare.com'])
    ).toEqual({
      error:
        'AI Gateway URL host is not permitted. Allowed hosts: gateway.ai.cloudflare.com.',
    });
  });

  it('rejects loopback hosts', () => {
    expect(validateAiGatewayUrl('https://127.0.0.1/anthropic')).toEqual({
      error:
        'AI Gateway URL must not target private, link-local, or loopback hosts.',
    });
    expect(validateAiGatewayUrl('https://localhost/anthropic')).toEqual({
      error:
        'AI Gateway URL must not target private, link-local, or loopback hosts.',
    });
  });

  it('rejects private and link-local hosts', () => {
    expect(validateAiGatewayUrl('https://192.168.1.1/anthropic')).toEqual({
      error:
        'AI Gateway URL must not target private, link-local, or loopback hosts.',
    });
    expect(validateAiGatewayUrl('https://10.0.0.5/anthropic')).toEqual({
      error:
        'AI Gateway URL must not target private, link-local, or loopback hosts.',
    });
    expect(validateAiGatewayUrl('https://169.254.169.254/anthropic')).toEqual({
      error:
        'AI Gateway URL must not target private, link-local, or loopback hosts.',
    });
  });

  it('rejects embedded credentials', () => {
    expect(
      validateAiGatewayUrl('https://user:pass@gateway.ai.cloudflare.com/anthropic')
    ).toEqual({
      error: 'AI Gateway URL must not include credentials.',
    });
  });
});

describe('resolveAttributionCredentials', () => {
  it('uses environment secrets when request omits credentials', () => {
    const result = resolveAttributionCredentials(
      withAllowedHosts({
        envAiGatewayUrl: 'https://gateway.example/anthropic',
        envAnthropicApiKey: 'env-key',
        requestHeaders: new Headers(),
      })
    );

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

    const result = resolveAttributionCredentials(
      withAllowedHosts({
        envAiGatewayUrl: 'https://gateway.example/anthropic',
        envAnthropicApiKey: 'env-key',
        requestHeaders: headers,
      })
    );

    expect(result).toEqual({
      aiGatewayUrl: 'https://api.anthropic.com',
      anthropicApiKey: 'user-key',
      source: 'request',
    });
  });

  it('accepts snake_case body fields', () => {
    const result = resolveAttributionCredentials(
      withAllowedHosts({
        requestHeaders: new Headers(),
        body: {
          ai_gateway_url: 'https://api.anthropic.com',
          anthropic_api_key: 'body-key',
        },
      })
    );

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

  it('rejects invalid AI Gateway URLs before returning credentials', () => {
    const result = resolveAttributionCredentials(
      withAllowedHosts({
        requestHeaders: new Headers({
          'x-ai-gateway-url': 'http://gateway.example/anthropic',
          'x-anthropic-api-key': 'user-key',
        }),
      })
    );

    expect(result).toEqual({
      error: 'AI Gateway URL must use HTTPS.',
    });
  });

  it('rejects SSRF targets supplied via request body', () => {
    const result = resolveAttributionCredentials(
      withAllowedHosts({
        requestHeaders: new Headers(),
        body: {
          aiGatewayUrl: 'https://127.0.0.1/anthropic',
          anthropicApiKey: 'body-key',
        },
      })
    );

    expect(result).toEqual({
      error:
        'AI Gateway URL must not target private, link-local, or loopback hosts.',
    });
  });

  // #187 non-negotiable: PUBLIC_BYOK_ONLY must code-enforce fail-closed so a
  // mistakenly-set server AI secret cannot be ridden by an anonymous caller.
  describe('PUBLIC_BYOK_ONLY (publicByokOnly)', () => {
    it('does NOT ride the server key: server creds present, no visitor creds -> byok_required', () => {
      const result = resolveAttributionCredentials(
        withAllowedHosts({
          // House credentials ARE set (the misconfiguration we defend against).
          envAiGatewayUrl: 'https://gateway.example/anthropic',
          envAnthropicApiKey: 'house-key',
          envCfAigToken: 'house-cf-aig-token',
          requestHeaders: new Headers(),
          publicByokOnly: true,
        })
      );

      // Fails closed with the stable machine-readable code, NOT a usable
      // credential set. The house key must appear nowhere in the result.
      expect(result).toEqual({
        error: expect.stringContaining('your own credentials'),
        code: 'byok_required',
      });
      expect(JSON.stringify(result)).not.toContain('house-key');
      expect(JSON.stringify(result)).not.toContain('house-cf-aig-token');
      expect('source' in result).toBe(false);
    });

    it('still honors genuine visitor BYOK under the flag', () => {
      const result = resolveAttributionCredentials(
        withAllowedHosts({
          envAiGatewayUrl: 'https://gateway.example/anthropic',
          envAnthropicApiKey: 'house-key',
          requestHeaders: new Headers({
            'x-ai-gateway-url': 'https://api.anthropic.com',
            'x-anthropic-api-key': 'visitor-key',
          }),
          publicByokOnly: true,
        })
      );

      expect(result).toEqual({
        aiGatewayUrl: 'https://api.anthropic.com',
        anthropicApiKey: 'visitor-key',
        source: 'request',
      });
    });

    it('CONTROL: without the flag, server creds are used (env source)', () => {
      const result = resolveAttributionCredentials(
        withAllowedHosts({
          envAiGatewayUrl: 'https://gateway.example/anthropic',
          envAnthropicApiKey: 'house-key',
          requestHeaders: new Headers(),
        })
      );

      expect(result).toEqual({
        aiGatewayUrl: 'https://gateway.example/anthropic',
        anthropicApiKey: 'house-key',
        source: 'environment',
      });
    });
  });
});

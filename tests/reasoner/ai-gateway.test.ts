/**
 * Tests for reasoner/ai-gateway.ts.
 *
 * Two test groups:
 *
 *   1. extractJSONObject: pure-function tests covering the prompt-
 *      conformant path, code-fence stripping, brace-extraction
 *      fallback, and failure modes. These tests run synchronously
 *      and do not touch the Workers runtime; they catch regressions
 *      in the JSON robustness layer fastest.
 *
 *   2. callLLM: one end-to-end HTTP test using fetchMock to confirm
 *      the request shape (URL, headers, body) and response parsing
 *      (text extraction, model field, usage). Also exercises the
 *      non-200 error path.
 */

import { beforeAll, afterEach, describe, it, expect } from 'vitest';
import { fetchMock } from '../helpers/undici-mock';

import { callLLM, extractJSONObject } from '../../implementation/reasoner/ai-gateway';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
});

// ---------------------------------------------------------------------------
// extractJSONObject
// ---------------------------------------------------------------------------

describe('extractJSONObject', () => {
  it('parses a clean JSON object (prompt-conformant path)', () => {
    expect(extractJSONObject('{"verdict": "obviously_not_coordinated"}')).toEqual({
      verdict: 'obviously_not_coordinated',
    });
  });

  it('handles leading and trailing whitespace', () => {
    expect(extractJSONObject('   \n\n{"foo": 1}\n  ')).toEqual({ foo: 1 });
  });

  it('strips fenced code blocks with json language tag', () => {
    const text = '```json\n{"verdict": "warrants_further_analysis"}\n```';
    expect(extractJSONObject(text)).toEqual({
      verdict: 'warrants_further_analysis',
    });
  });

  it('strips fenced code blocks without language tag', () => {
    const text = '```\n{"foo": 1}\n```';
    expect(extractJSONObject(text)).toEqual({ foo: 1 });
  });

  it('extracts JSON when prose surrounds the object (brace fallback)', () => {
    const text = "Here is the verdict you asked for:\n{\"verdict\": \"obviously_not_coordinated\", \"reason\": \"low signal overlap\"}\nLet me know if you need anything else.";
    expect(extractJSONObject(text)).toEqual({
      verdict: 'obviously_not_coordinated',
      reason: 'low signal overlap',
    });
  });

  it('handles nested objects via brace fallback', () => {
    const text = "ok here:\n{\"a\": {\"b\": {\"c\": 3}}, \"d\": [1, 2, 3]}\nthanks";
    expect(extractJSONObject(text)).toEqual({
      a: { b: { c: 3 } },
      d: [1, 2, 3],
    });
  });

  it('throws when no JSON object is present', () => {
    expect(() => extractJSONObject('I cannot help with that')).toThrow(/No JSON object found/);
  });

  it('throws when the extracted slice is still malformed', () => {
    // Has braces, but the content is not valid JSON
    expect(() => extractJSONObject('{ this is not: valid json }')).toThrow();
  });

  it('returns the OUTER object when prose contains a smaller object too', () => {
    // The fallback finds the OUTERMOST {...}, so an embedded {"x":1}
    // prose snippet inside the larger object is not separately extracted.
    const text = 'Note: example like {"x":1} appears here.\n{"real": "object", "list": [1, 2]}';
    expect(extractJSONObject(text)).toEqual({
      real: 'object',
      list: [1, 2],
    });
  });
});

// ---------------------------------------------------------------------------
// callLLM
// ---------------------------------------------------------------------------

describe('callLLM', () => {
  it('posts an Anthropic /v1/messages request and parses the response', async () => {
    fetchMock
      .get('https://gateway.test')
      .intercept({
        path: '/anthropic/v1/messages',
        method: 'POST',
      })
      .reply(
        200,
        {
          id: 'msg_test_001',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'text', text: 'hello world' },
            // Mixed-block defensive: non-text blocks should be ignored.
            { type: 'tool_use', id: 'tu_1', name: 'fake_tool', input: {} },
          ],
          model: 'claude-haiku-4-5-20260101',
          stop_reason: 'end_turn',
          usage: { input_tokens: 42, output_tokens: 7 },
        },
        { headers: { 'content-type': 'application/json' } }
      );

    const result = await callLLM({
      apiKey: 'sk-test',
      gatewayUrl: 'https://gateway.test/anthropic',
      model: 'claude-haiku-4-5',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      maxTokens: 256,
    });

    expect(result.text).toBe('hello world');
    expect(result.modelVersion).toBe('claude-haiku-4-5-20260101');
    expect(result.stopReason).toBe('end_turn');
    expect(result.usage).toEqual({ inputTokens: 42, outputTokens: 7 });
  });

  it('throws on non-200 responses with the status and body excerpt', async () => {
    fetchMock
      .get('https://gateway.test')
      .intercept({
        path: '/anthropic/v1/messages',
        method: 'POST',
      })
      .reply(500, 'gateway is sad today');

    await expect(
      callLLM({
        apiKey: 'sk-test',
        gatewayUrl: 'https://gateway.test/anthropic',
        model: 'claude-haiku-4-5',
        systemPrompt: 'sys',
        userPrompt: 'usr',
        maxTokens: 256,
      })
    ).rejects.toThrow(/HTTP 500/);
  });

  it('appends /v1/messages when the gateway URL already has a trailing slash', async () => {
    // Same path matcher; the joinGatewayPath helper should normalize.
    fetchMock
      .get('https://gateway.test')
      .intercept({
        path: '/anthropic/v1/messages',
        method: 'POST',
      })
      .reply(
        200,
        {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-haiku-4-5-20260101',
          stop_reason: 'end_turn',
          usage: { input_tokens: 1, output_tokens: 1 },
        },
        { headers: { 'content-type': 'application/json' } }
      );

    const result = await callLLM({
      apiKey: 'sk-test',
      gatewayUrl: 'https://gateway.test/anthropic/',
      model: 'claude-haiku-4-5',
      systemPrompt: 'sys',
      userPrompt: 'usr',
      maxTokens: 256,
    });
    expect(result.text).toBe('ok');
  });
});

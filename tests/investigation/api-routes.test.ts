import { describe, expect, it } from 'vitest';
import { collectCitedSignalIds } from '../../implementation/reporting/evidence-packet';
import { packetDocumentTitle, packetMarkdownToHtml, sanitizePacketHtml } from '../../implementation/reporting/packet-html';
import { parseFeaturesQueryParams } from '../../implementation/features/query';
import { canonicalPair } from '../../implementation/schema/db-types';

describe('investigation API helpers', () => {
  it('parseFeaturesQueryParams canonicalizes pair filter', () => {
    const result = parseFeaturesQueryParams('inv-1', new URLSearchParams('pair=bob,alice'));
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.pair).toEqual(canonicalPair('bob', 'alice'));
    expect(result.scope).toBe('all');
  });

  it('parseFeaturesQueryParams rejects malformed pair', () => {
    const result = parseFeaturesQueryParams('inv-1', new URLSearchParams('pair=onlyone'));
    expect(result).toEqual({ error: 'pair must be two comma-separated account identifiers' });
  });

  it('collectCitedSignalIds gathers claim and alternative citations', () => {
    const ids = collectCitedSignalIds({
      claims: [
        {
          citations: [{ signal_id: 'pair:12' }, { signal_id: 'account:3' }],
        },
      ],
      alternative_explanations: [
        {
          citations: [{ signal_id: 'event:9' }],
        },
      ],
    });
    expect([...ids].sort()).toEqual(['account:3', 'event:9', 'pair:12']);
  });

  it('packetMarkdownToHtml wraps markdown in a printable document', async () => {
    const title = packetDocumentTitle('inv-1', 7);
    const html = await packetMarkdownToHtml('# Hello\n\nBody text.', title);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('Body text.');
    expect(html).toContain(escapeForExpect(title));
  });

  it('sanitizePacketHtml strips active content from marked output', () => {
    const dirty = '<script>alert(1)</script><p>ok</p><img src="http://evil.example/x.png">';
    const clean = sanitizePacketHtml(dirty);
    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/http:\/\/evil\.example/);
    expect(clean).toContain('<p>ok</p>');
  });
});

function escapeForExpect(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

  it('packetMarkdownToHtml escapes raw HTML blocks in markdown source', async () => {
    const html = await packetMarkdownToHtml('<script>alert(1)</script>\n\n# Title', 't');
    expect(html).not.toMatch(/<script/i);
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<h1>Title</h1>');
  });

  // Regression (#187 WS2): escapeHtml formerly used a replaceUntilStable
  // fixpoint for entity encoding, so '&' -> '&amp;' -> '&amp;amp;' ... never
  // terminated and pinned the Worker at 100% CPU on any ampersand. Drive an
  // ampersand through both the title and a raw-HTML token; the call must
  // return (a hang fails the suite via timeout) and encode exactly once.
  it('packetMarkdownToHtml terminates and single-encodes ampersands', async () => {
    const html = await packetMarkdownToHtml(
      '<a href="https://x.example/?a=1&b=2">Q&A</a>\n\n# Tom & Jerry',
      'Report &  <run>',
    );
    expect(html).toContain('&amp;');
    expect(html).not.toContain('&amp;amp;');
    expect(html).toContain('<h1>Tom &amp; Jerry</h1>');
    // Raw inline HTML is escaped, not passed through.
    expect(html).not.toMatch(/<a\s/i);
  });
});

function escapeForExpect(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

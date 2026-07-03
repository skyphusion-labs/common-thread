/**
 * Pure-function tests for isInstagramEntry, the shared Instagram entry
 * classifier that replaced the duplicated (and divergently host-parsing)
 * filterEntry copies in stylometric/instagram.ts and temporal/instagram.ts.
 *
 * Host checks route through extractors/platform.ts, so the spoof cases that
 * a substring test would misclassify are the point of these assertions. No
 * database, fetch, or env dependency.
 */

import { describe, expect, it } from 'vitest';

import type { ManifestEntry } from '../../implementation/archive/types';
import { isInstagramEntry } from '../../implementation/ingest/instagram-post-fields';
import { InstagramStylometricExtractor } from '../../implementation/extractors/stylometric/instagram';
import { InstagramTemporalExtractor } from '../../implementation/extractors/temporal/instagram';

function entry(tool: string, source: string): ManifestEntry {
  return {
    hash: '0'.repeat(64),
    source,
    collectedAt: '2026-06-22T01:12:46.453Z',
    collectionMethod: { tool, version: '1.0.0' },
    investigationId: 'isinstagramentry-unit',
    status: 'present',
  };
}

describe('isInstagramEntry', () => {
  it('rejects an explicit instagram-profile artifact', () => {
    expect(
      isInstagramEntry(entry('instagram-profile', 'https://www.instagram.com/u/'))
    ).toBe(false);
  });

  it('accepts post and reel permalinks by path pattern', () => {
    expect(isInstagramEntry(entry('', 'https://www.instagram.com/p/ABC123/'))).toBe(
      true
    );
    expect(isInstagramEntry(entry('', 'https://www.instagram.com/reel/XYZ/'))).toBe(
      true
    );
  });

  it('accepts instagram-* tool labels', () => {
    for (const tool of [
      'instagram-post',
      'instagram-timeline',
      'instagram-media',
      'instagram-scraper',
      'instagram',
    ]) {
      expect(isInstagramEntry(entry(tool, 'https://example.test/whatever'))).toBe(
        true
      );
    }
  });

  it('accepts a parsed instagram.com host and its subdomains', () => {
    expect(isInstagramEntry(entry('', 'https://instagram.com/someuser'))).toBe(true);
    expect(
      isInstagramEntry(entry('', 'https://mobile.instagram.com/someuser'))
    ).toBe(true);
    // Schemeless bare host: parsed-host matching prepends a scheme, so this
    // now classifies as Instagram (the old raw new URL() copies dropped it).
    expect(isInstagramEntry(entry('', 'instagram.com/someuser'))).toBe(true);
  });

  it('does NOT match a subdomain-spoof host (the hardening)', () => {
    expect(
      isInstagramEntry(entry('', 'https://instagram.com.attacker.example/u'))
    ).toBe(false);
    expect(
      isInstagramEntry(entry('', 'https://evil-instagram.com/u'))
    ).toBe(false);
  });

  it('rejects entries that belong to another platform (tool or host)', () => {
    expect(isInstagramEntry(entry('twitter-timeline', 'https://example.test/x'))).toBe(
      false
    );
    expect(isInstagramEntry(entry('', 'https://twitter.com/u'))).toBe(false);
    expect(isInstagramEntry(entry('', 'https://mobile.twitter.com/u'))).toBe(false);
    expect(isInstagramEntry(entry('reddit-scraper', 'https://example.test/x'))).toBe(
      false
    );
    expect(isInstagramEntry(entry('', 'https://reddit.com/r/x'))).toBe(false);
  });

  it('defaults to reject on unrecognized or unparseable sources', () => {
    expect(isInstagramEntry(entry('', 'https://example.test/whatever'))).toBe(false);
    expect(isInstagramEntry(entry('', 'not a url'))).toBe(false);
    expect(isInstagramEntry(entry('', ''))).toBe(false);
  });
});

describe('both Instagram extractors delegate to the shared helper', () => {
  const cases: Array<[string, string]> = [
    ['instagram-post', 'https://www.instagram.com/p/A/'],
    ['', 'https://instagram.com/u'],
    ['', 'https://instagram.com.attacker.example/u'],
    ['', 'https://twitter.com/u'],
    ['', 'https://example.test/x'],
  ];
  const stylometric = new InstagramStylometricExtractor();
  const temporal = new InstagramTemporalExtractor();

  it('stylometric.filterEntry matches isInstagramEntry', () => {
    for (const [tool, source] of cases) {
      const e = entry(tool, source);
      expect(stylometric.filterEntry(e)).toBe(isInstagramEntry(e));
    }
  });

  it('temporal.filterEntry matches isInstagramEntry', () => {
    for (const [tool, source] of cases) {
      const e = entry(tool, source);
      expect(temporal.filterEntry(e)).toBe(isInstagramEntry(e));
    }
  });
});

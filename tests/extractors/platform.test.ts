/**
 * Pure-function tests for extractors/platform.ts, the parsed-host platform
 * matching helpers that replaced substring URL checks (issue #63, clearing
 * the `js/incomplete-url-substring-sanitization` CodeQL alerts).
 *
 * No database, fetch, or env dependency: these construct source strings in
 * JS and assert directly on the return values. The security-relevant cases
 * are the spoofs that a substring check (`source.includes('twitter.com')`)
 * would have misclassified.
 */

import { describe, expect, it } from 'vitest';

import {
  hostOf,
  hostMatches,
  inferPlatform,
  sourceMatchesHost,
} from '../../implementation/extractors/platform';
import type { ManifestEntry } from '../../implementation/archive/types';

describe('hostOf', () => {
  it('extracts the host from a well-formed URL', () => {
    expect(hostOf('https://twitter.com/user/status/123')).toBe('twitter.com');
  });

  it('lowercases the host', () => {
    expect(hostOf('https://TWITTER.com/User')).toBe('twitter.com');
  });

  it('strips a leading www.', () => {
    expect(hostOf('https://www.twitter.com/user')).toBe('twitter.com');
  });

  it('parses a schemeless bare host by prepending a scheme', () => {
    expect(hostOf('twitter.com/user')).toBe('twitter.com');
    expect(hostOf('reddit.com')).toBe('reddit.com');
  });

  it('parses a schemeless host that carries a port', () => {
    expect(hostOf('twitter.com:443/user')).toBe('twitter.com');
  });

  it('keeps a host embedded in the path as the real host', () => {
    // The domain appears in the query, not the authority: host is archive.org.
    expect(hostOf('https://archive.org/save?url=twitter.com/x')).toBe(
      'archive.org'
    );
  });

  it('returns null on unparseable or empty input', () => {
    expect(hostOf('not a url at all')).toBe(null);
    expect(hostOf('')).toBe(null);
    expect(hostOf('   ')).toBe(null);
  });

  it('returns null for a non-string input', () => {
    // Defensive: callers pass entry.source, which is typed string, but a
    // malformed manifest row could carry a non-string.
    expect(hostOf(undefined as unknown as string)).toBe(null);
    expect(hostOf(null as unknown as string)).toBe(null);
  });
});

describe('hostMatches', () => {
  it('matches an exact host', () => {
    expect(hostMatches('twitter.com', 'twitter.com')).toBe(true);
  });

  it('matches a legitimate subdomain', () => {
    expect(hostMatches('mobile.twitter.com', 'twitter.com')).toBe(true);
    expect(hostMatches('api.mobile.twitter.com', 'twitter.com')).toBe(true);
  });

  it('rejects a suffix that is not on a label boundary', () => {
    // The whole point: eviltwitter.com is not a subdomain of twitter.com.
    expect(hostMatches('eviltwitter.com', 'twitter.com')).toBe(false);
  });

  it('rejects a spoof that puts the domain in a lower label', () => {
    expect(hostMatches('twitter.com.attacker.example', 'twitter.com')).toBe(
      false
    );
  });

  it('is case-insensitive', () => {
    expect(hostMatches('Mobile.Twitter.Com', 'twitter.com')).toBe(true);
  });

  it('returns false on empty host or domain', () => {
    expect(hostMatches('', 'twitter.com')).toBe(false);
    expect(hostMatches('twitter.com', '')).toBe(false);
  });
});

describe('sourceMatchesHost', () => {
  it('matches the platform domain of a real source URL', () => {
    expect(sourceMatchesHost('https://twitter.com/u', 'twitter.com', 'x.com')).toBe(
      true
    );
    expect(sourceMatchesHost('https://x.com/u', 'twitter.com', 'x.com')).toBe(true);
  });

  it('matches a legitimate subdomain source', () => {
    expect(sourceMatchesHost('https://mobile.twitter.com/u', 'twitter.com')).toBe(
      true
    );
  });

  it('does NOT match a subdomain-spoof source (the core CVE-class case)', () => {
    expect(
      sourceMatchesHost(
        'https://evil-twitter.com.attacker.example/u',
        'twitter.com',
        'x.com'
      )
    ).toBe(false);
    expect(
      sourceMatchesHost('https://reddit.com.phish.io/r/x', 'reddit.com', 'redd.it')
    ).toBe(false);
  });

  it('does NOT match a benign URL that carries the domain in its path/query', () => {
    expect(
      sourceMatchesHost(
        'https://archive.org/save?url=twitter.com/x',
        'twitter.com',
        'x.com'
      )
    ).toBe(false);
  });

  it('matches a schemeless bare-host source', () => {
    expect(sourceMatchesHost('reddit.com/r/x', 'reddit.com', 'redd.it')).toBe(true);
  });

  it('returns false when the source does not parse', () => {
    expect(sourceMatchesHost('garbage', 'twitter.com')).toBe(false);
    expect(sourceMatchesHost('', 'twitter.com')).toBe(false);
  });
});

describe('inferPlatform', () => {
  function entry(partial: Partial<ManifestEntry> & Pick<ManifestEntry, 'source'>): ManifestEntry {
    return {
      hash: 'abc',
      source: partial.source,
      collectionMethod: partial.collectionMethod ?? { tool: 'manual', version: '1' },
      investigationId: 'inv',
      account: 'user',
      mimeType: 'application/json',
      status: 'present',
      collectedAt: '2026-01-01T00:00:00.000Z',
      ...partial,
    };
  }

  it('resolves twitter from source host even when tool is apify', () => {
    expect(
      inferPlatform(
        entry({
          source: 'https://twitter.com/user/status/1',
          collectionMethod: { tool: 'apify-twitter-timeline', version: '1' },
        })
      )
    ).toBe('twitter');
  });

  it('does not stamp apify artifacts as twitter when source host is unknown', () => {
    expect(
      inferPlatform(
        entry({
          source: 'https://reddit.com/r/test/comments/abc',
          collectionMethod: { tool: 'apify-reddit-scraper', version: '1' },
        })
      )
    ).toBe('reddit');
  });

  it('returns unknown when neither source nor tool resolves', () => {
    expect(
      inferPlatform(
        entry({
          source: 'not-a-url',
          collectionMethod: { tool: 'apify-mystery', version: '1' },
        })
      )
    ).toBe('unknown');
  });
});

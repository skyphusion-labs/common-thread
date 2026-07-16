/**
 * Link shortener fingerprint helpers (§4.7.4).
 *
 * Classifies normalized posted URLs into shortener fingerprints:
 * commercial / platform / self-hosted-candidate. Used by account-level
 * feature emission (alongside posted_urls) and the pair overlap extractor.
 *
 * Shortener redirects are NOT resolved (no network); fingerprints are
 * based on the surface host and path shape of the posted URL itself.
 */

import { hostOf } from '../platform';
import type { ExtractedFeature } from '../types';

/** Well-known commercial shorteners (imply paid/shared infra). */
export const COMMERCIAL_SHORTENER_HOSTS: ReadonlySet<string> = new Set([
  'bit.ly',
  'bitly.com',
  'tinyurl.com',
  'ow.ly',
  'buff.ly',
  'rebrand.ly',
  'cutt.ly',
  'short.io',
  'shorturl.at',
  'is.gd',
  'v.gd',
  't.ly',
  'rb.gy',
  'bl.ink',
  'cli.fo',
  'snip.ly',
  'trib.al',
  'soo.gd',
  'tiny.cc',
  'lc.cx',
]);

/**
 * Platform-native shorteners. Weaker sockpuppet signal (everyone on the
 * platform may use them) but still useful for path-pattern overlap.
 */
export const PLATFORM_SHORTENER_HOSTS: ReadonlySet<string> = new Set([
  't.co',
  'lnkd.in',
  'youtu.be',
  'fb.me',
  'amzn.to',
  'goo.gl',
  'maps.app.goo.gl',
]);

export type ShortenerKind = 'commercial' | 'platform' | 'self_hosted';

export interface ShortenerHit {
  /** Lowercased host (www. stripped). */
  host: string;
  kind: ShortenerKind;
  /**
   * Path fingerprint: first path segment for known shorteners
   * (e.g. `/abc123` → `abc123`), or `host|/seg` for self-hosted.
   */
  path_token: string;
  /** Stable id for set overlap: `kind:host` or `self_hosted:host`. */
  fingerprint: string;
}

/**
 * Heuristic: short host + short single-segment path looks like a
 * self-hosted shortener (e.g. `go.example.com/x7k`).
 */
export function looksLikeSelfHostedShortener(host: string, pathname: string): boolean {
  if (!host || host.includes('localhost')) return false;
  // Skip obvious non-shortener platforms already handled elsewhere.
  if (COMMERCIAL_SHORTENER_HOSTS.has(host) || PLATFORM_SHORTENER_HOSTS.has(host)) {
    return false;
  }
  const labels = host.split('.');
  if (labels.length < 2) return false;
  // Prefer short left-most label (go., link., l., s., to., u.)
  const left = labels[0] ?? '';
  const shortLeft =
    left.length <= 3 ||
    ['go', 'link', 'ln', 'url', 'u', 'to', 's', 'r', 'l', 'cut', 'short'].includes(left);
  // Require a short left label; ordinary content hosts (news.example.com)
  // must not look like shorteners.
  if (!shortLeft) return false;

  const segs = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  if (segs.length !== 1) return false;
  const token = segs[0] ?? '';
  // Typical short codes: 3–12 chars, alnum/_/-
  if (token.length < 3 || token.length > 12) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return false;
  return true;
}

/**
 * Classify a single URL (normalized or raw). Returns null when the URL
 * is not a shortener under the rules above.
 */
export function classifyShortenerUrl(raw: string): ShortenerHit | null {
  let parsed: URL;
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
    parsed = new URL(withScheme);
  } catch {
    // normalizeUrl form is host/path?query without scheme
    const host = hostOf(`https://${raw}`);
    if (!host) return null;
    const slash = raw.indexOf('/');
    const pathPart = slash >= 0 ? raw.slice(slash) : '/';
    try {
      parsed = new URL(`https://${host}${pathPart.startsWith('/') ? pathPart : `/${pathPart}`}`);
    } catch {
      return null;
    }
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!host) return null;
  const path = parsed.pathname || '/';
  const segs = path.replace(/\/+$/, '').split('/').filter(Boolean);
  const pathToken = (segs[0] ?? '').toLowerCase();

  if (COMMERCIAL_SHORTENER_HOSTS.has(host)) {
    return {
      host,
      kind: 'commercial',
      path_token: pathToken,
      fingerprint: `commercial:${host}`,
    };
  }
  if (PLATFORM_SHORTENER_HOSTS.has(host)) {
    return {
      host,
      kind: 'platform',
      path_token: pathToken,
      fingerprint: `platform:${host}`,
    };
  }
  if (looksLikeSelfHostedShortener(host, path)) {
    return {
      host,
      kind: 'self_hosted',
      path_token: pathToken,
      fingerprint: `self_hosted:${host}`,
    };
  }
  return null;
}

export interface ShortenerAccountSummary {
  domain_distribution: Record<string, number>;
  fingerprint_set: string[];
  path_tokens: string[];
  link_count: number;
  commercial_count: number;
  self_hosted_count: number;
}

/** Build account-level shortener summary from a posted URL set. */
export function summarizeShorteners(urls: Iterable<string>): ShortenerAccountSummary {
  const domain_distribution: Record<string, number> = {};
  const fingerprints = new Set<string>();
  const pathTokens = new Set<string>();
  let link_count = 0;
  let commercial_count = 0;
  let self_hosted_count = 0;

  for (const url of urls) {
    const hit = classifyShortenerUrl(url);
    if (!hit) continue;
    link_count += 1;
    domain_distribution[hit.host] = (domain_distribution[hit.host] ?? 0) + 1;
    fingerprints.add(hit.fingerprint);
    if (hit.path_token) pathTokens.add(`${hit.host}|${hit.path_token}`);
    if (hit.kind === 'commercial') commercial_count += 1;
    if (hit.kind === 'self_hosted') self_hosted_count += 1;
  }

  return {
    domain_distribution,
    fingerprint_set: [...fingerprints].sort(),
    path_tokens: [...pathTokens].sort(),
    link_count,
    commercial_count,
    self_hosted_count,
  };
}

/**
 * Account-level metadata_leakage features for §4.7.4.
 * Always emit when called (including zero counts) so pair extractors
 * can fire on every account that has a posted_urls row.
 */
export function shortenerAccountFeatures(urls: Iterable<string>): ExtractedFeature[] {
  const s = summarizeShorteners(urls);
  const cat = 'metadata_leakage' as const;
  return [
    {
      category: cat,
      name: 'shortener_domain_distribution',
      value: { kind: 'json', value: s.domain_distribution },
    },
    {
      category: cat,
      name: 'shortener_fingerprint_set',
      value: { kind: 'json', value: s.fingerprint_set },
    },
    {
      category: cat,
      name: 'shortener_path_tokens',
      value: { kind: 'json', value: s.path_tokens },
    },
    {
      category: cat,
      name: 'shortener_link_count',
      value: { kind: 'numeric', value: s.link_count },
    },
    {
      category: cat,
      name: 'shortener_commercial_count',
      value: { kind: 'numeric', value: s.commercial_count },
    },
    {
      category: cat,
      name: 'shortener_self_hosted_count',
      value: { kind: 'numeric', value: s.self_hosted_count },
    },
  ];
}

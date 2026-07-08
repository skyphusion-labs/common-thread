import type { ManifestEntry } from '../archive/types';

/**
 * Parsed-host platform matching.
 *
 * Classifying a platform by substring (`source.includes('twitter.com')`)
 * is unsafe: it matches spoofed hosts (`evil-twitter.com.attacker.example`),
 * phishing subdomains (`reddit.com.phish.io`), and benign URLs that merely
 * carry the domain in their path or query
 * (`https://archive.org/save?url=twitter.com/x`). Every platform check that
 * looks at a source URL should parse the URL and compare against the host,
 * which is what this module provides.
 *
 * These are host primitives only; they intentionally do not resolve
 * shortener redirects or apply the canonicalization that
 * `stylometric/text-helpers.ts` `normalizeUrl` does for the link-overlap
 * signal (that helper keeps the port and query for equality comparison; a
 * platform check wants the bare registrable host).
 */

/**
 * Extract the lowercased host of a source string, or null when it cannot be
 * parsed as a URL. A leading `www.` is stripped so `www.twitter.com` and
 * `twitter.com` compare equal. Bare hosts without a scheme
 * (`twitter.com/user`) are supported by prepending `https://` before parsing
 * so the value is read as an authority rather than a path.
 */
export function hostOf(source: string): string | null {
  if (typeof source !== 'string') return null;
  const trimmed = source.trim();
  if (trimmed.length === 0) return null;

  // A real scheme in this data is always followed by `://`. Requiring `://`
  // (rather than a bare colon) avoids treating a `host:port` value as a
  // scheme, so `twitter.com:443` is still parsed as a bare host.
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return host.length > 0 ? host : null;
}

/**
 * True when `host` is exactly `domain` or a subdomain of it. Matching is on
 * dot-delimited labels (`host === domain || host.endsWith('.' + domain)`),
 * never a substring, so `mobile.twitter.com` matches `twitter.com` while
 * `eviltwitter.com` and `twitter.com.attacker.example` do not.
 */
export function hostMatches(host: string, domain: string): boolean {
  if (!host || !domain) return false;
  const h = host.toLowerCase();
  const d = domain.toLowerCase();
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Convenience for the common call site: parse `source` to a host and test it
 * against one or more platform domains. Returns false when the source does
 * not parse. `sourceMatchesHost(source, 'twitter.com', 'x.com')` replaces
 * `source.includes('twitter.com') || source.includes('x.com')`.
 */
export function sourceMatchesHost(source: string, ...domains: string[]): boolean {
  const host = hostOf(source);
  if (host === null) return false;
  return domains.some((domain) => hostMatches(host, domain));
}

/** Known platform identifiers inferred from manifest entries. */
export type InferredPlatform =
  | 'twitter'
  | 'reddit'
  | 'bluesky'
  | 'mastodon'
  | 'instagram'
  | 'unknown';

/**
 * Infer the platform for a manifest entry.
 *
 * Source URL host is authoritative when parseable. Collection-tool hints
 * fill gaps when the source does not parse. Apify artifacts resolve from
 * the source host only; the tool name alone never implies twitter.
 *
 * TODO(manifest-schema): add an explicit `platform` field to ManifestEntry
 * and require it at collection time.
 */
export function inferPlatform(entry: ManifestEntry): InferredPlatform {
  const tool = entry.collectionMethod.tool.toLowerCase();
  const source = entry.source;

  const fromSource = platformFromSourceHost(source);
  if (fromSource !== 'unknown') return fromSource;

  if (tool.includes('twitter') || tool.includes('x-com')) return 'twitter';
  if (tool.includes('reddit')) return 'reddit';
  if (tool.includes('bluesky') || tool.includes('atproto')) return 'bluesky';
  if (tool.includes('mastodon')) return 'mastodon';
  if (tool.includes('instagram')) return 'instagram';

  return 'unknown';
}

/** True when {@link inferPlatform} resolves to the given platform. */
export function entryMatchesPlatform(entry: ManifestEntry, platform: InferredPlatform): boolean {
  return inferPlatform(entry) === platform;
}

function platformFromSourceHost(source: string): InferredPlatform {
  if (sourceMatchesHost(source, 'twitter.com', 'x.com')) return 'twitter';
  if (sourceMatchesHost(source, 'reddit.com', 'redd.it')) return 'reddit';
  if (sourceMatchesHost(source, 'bsky.app', 'bsky.social')) return 'bluesky';
  if (sourceMatchesHost(source, 'instagram.com')) return 'instagram';
  // Federated; host match is best-effort until manifest carries platform.
  if (sourceMatchesHost(source, 'mastodon.social')) return 'mastodon';
  return 'unknown';
}

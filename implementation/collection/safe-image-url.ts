/**
 * Fail-closed URL gate for collection-layer image fetches (#279).
 *
 * Twitter ingest used to fetch any http(s) media URL from visitor JSON.
 * The VPC ingest container sits on the fleet VLAN, so that was SSRF.
 */

/** Twitter image CDN. Subdomains (pbs / video / abs / ton) match via suffix. */
export const DEFAULT_IMAGE_FETCH_HOSTS = ['twimg.com'] as const;

export const MAX_IMAGE_FETCH_BYTES = 8 * 1024 * 1024;

function isIpv4Host(hostname: string): boolean {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;
  return match.slice(1).every((octet) => {
    const value = Number(octet);
    return value >= 0 && value <= 255;
  });
}

function isPrivateOrReservedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.local') || host.endsWith('.internal')) return true;

  if (isIpv4Host(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (host.includes(':')) {
    if (host === '::1') return true;
    if (host.startsWith('fe80:')) return true;
    if (host.startsWith('fc') || host.startsWith('fd')) return true;
    if (host.startsWith('::ffff:')) {
      const mapped = host.slice('::ffff:'.length);
      if (isIpv4Host(mapped)) return isPrivateOrReservedHost(mapped);
    }
  }

  return false;
}

function isHostAllowed(hostname: string, allowedHosts: readonly string[]): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((allowed) => {
    const permitted = allowed.toLowerCase();
    return host === permitted || host.endsWith(`.${permitted}`);
  });
}

/**
 * Validate a media URL before any fetch. HTTPS, no credentials, no
 * private/reserved hosts, host must be on the Twitter CDN allowlist.
 */
export function validateImageFetchUrl(
  raw: string,
  allowedHosts: readonly string[] = DEFAULT_IMAGE_FETCH_HOSTS
): { url: string } | { error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: 'Image URL is not a valid URL.' };
  }

  if (parsed.protocol !== 'https:') {
    return { error: 'Image URL must use HTTPS.' };
  }

  if (parsed.username || parsed.password) {
    return { error: 'Image URL must not include credentials.' };
  }

  const hostname = parsed.hostname;
  if (!hostname) {
    return { error: 'Image URL has no host.' };
  }

  if (isPrivateOrReservedHost(hostname)) {
    return { error: 'Image URL must not target private, link-local, or loopback hosts.' };
  }

  const hosts = allowedHosts.length > 0 ? allowedHosts : DEFAULT_IMAGE_FETCH_HOSTS;
  if (!isHostAllowed(hostname, hosts)) {
    return { error: `Image URL host is not permitted. Allowed hosts: ${hosts.join(', ')}.` };
  }

  parsed.hash = '';
  return { url: parsed.toString() };
}

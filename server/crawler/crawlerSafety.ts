import { URL } from 'url';
import dns from 'dns';
import net from 'net';

interface RobotsRule {
  userAgent: string;
  disallows: string[];
  allows: string[];
  crawlDelay?: number;
}

interface RobotsCacheEntry {
  fetchedAt: number;
  rules: RobotsRule[];
  sitemaps: string[];
}

const robotsCache = new Map<string, RobotsCacheEntry>();
const domainLastRequestTime = new Map<string, number>();

// Private IP ranges and blocked hostnames for SSRF protection
const PRIVATE_IP_REGEX = /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.|100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.|198\.(?:1[89])\.|fc00:|fe80:|::1)/i;
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  'metadata.google.internal',
  '169.254.169.254',
  'instance-data',
]);

export const DEFAULT_USER_AGENT = 'LinkedInSkillsStudioBot/2.0 (+https://linkedin-skills-studio.app/trend-bot; research)';

/**
 * Checks if an IP address (v4 or v6) is private, loopback, link-local, or restricted.
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return true;

  let cleanIp = ip.toLowerCase().trim();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.slice(7);
  }

  // IPv4 validation
  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return true;

    // 0.0.0.0/8 (Current network)
    if (parts[0] === 0) return true;
    // 10.0.0.0/8 (Private)
    if (parts[0] === 10) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-local & cloud metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19)) return true;
    // 192.0.0.0/24, 192.0.2.0/24 (Documentation)
    if (parts[0] === 192 && parts[1] === 0 && (parts[2] === 0 || parts[2] === 2)) return true;
    // 198.51.100.0/24, 203.0.113.0/24 (Documentation)
    if (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) return true;
    if (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) return true;
    // 224.0.0.0/4 (Multicast), 240.0.0.0/4 (Reserved)
    if (parts[0] >= 224) return true;

    return false;
  }

  // IPv6 validation
  if (net.isIPv6(cleanIp)) {
    if (cleanIp === '::' || cleanIp === '::1') return true;
    // fe80::/10 (Link-local)
    if (cleanIp.startsWith('fe8') || cleanIp.startsWith('fe9') || cleanIp.startsWith('fea') || cleanIp.startsWith('feb')) return true;
    // fc00::/7 (Unique local)
    if (cleanIp.startsWith('fc') || cleanIp.startsWith('fd')) return true;
    // ff00::/8 (Multicast)
    if (cleanIp.startsWith('ff')) return true;
    return false;
  }

  return true;
}

/**
 * Resolves DNS for hostname and ensures every resolved IP address is public and safe.
 * Protects against DNS rebinding, nip.io, and internal server access.
 */
export async function validateDnsDestination(hostname: string): Promise<{ safe: boolean; reason?: string; ip?: string }> {
  try {
    const addresses = await dns.promises.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      return { safe: false, reason: `Could not resolve DNS for host: ${hostname}` };
    }
    for (const record of addresses) {
      if (isPrivateIp(record.address)) {
        return { safe: false, reason: `Host ${hostname} resolved to restricted/private IP: ${record.address}` };
      }
    }
    return { safe: true, ip: addresses[0].address };
  } catch (err: any) {
    return { safe: false, reason: `DNS resolution failed for ${hostname}: ${err.message}` };
  }
}

/**
 * Validates a URL against SSRF and unsupported protocols.
 * Normalizes query parameters (strips tracking tokens).
 */
export function validateAndNormalizeUrl(rawUrl: string): {
  safe: boolean;
  reason?: string;
  normalizedUrl?: string;
  domain?: string;
} {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, reason: 'Empty or invalid URL' };
  }

  let parsed: URL;
  try {
    const unescaped = rawUrl.trim().replace(/&amp;/g, '&');
    parsed = new URL(unescaped);
  } catch {
    return { safe: false, reason: 'Malformed URL format' };
  }

  // 1. Protocol check: STRICTLY http or https only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Forbidden protocol: ${parsed.protocol}. Only http: and https: are allowed.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Blocked hostnames & private IPs
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.arpa')
  ) {
    return { safe: false, reason: `Restricted internal hostname: ${hostname}` };
  }

  if (PRIVATE_IP_REGEX.test(hostname)) {
    return { safe: false, reason: `Restricted private IP address: ${hostname}` };
  }

  // 3. Normalize: strip tracking parameters
  const trackingParams = [
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
    'fbclid', 'gclid', 'ref', 'source', 'mc_cid', 'mc_eid', '_ga'
  ];
  for (const param of trackingParams) {
    parsed.searchParams.delete(param);
  }

  // Remove trailing hash/fragment
  parsed.hash = '';

  const normalizedUrl = parsed.toString();
  return {
    safe: true,
    normalizedUrl,
    domain: hostname,
  };
}

/**
 * Enforces polite per-domain rate limiting.
 */
export async function enforceRateLimit(domain: string, minIntervalMs: number = 800): Promise<void> {
  const now = Date.now();
  const lastTime = domainLastRequestTime.get(domain) || 0;
  const elapsed = now - lastTime;

  if (elapsed < minIntervalMs) {
    const delay = minIntervalMs - elapsed;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  domainLastRequestTime.set(domain, Date.now());
}

/**
 * Parses robots.txt text into rules.
 */
export function parseRobotsTxt(content: string): { rules: RobotsRule[]; sitemaps: string[] } {
  const lines = content.split('\n');
  const rules: RobotsRule[] = [];
  const sitemaps: string[] = [];

  let currentRule: RobotsRule | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;

    const [key, ...values] = line.split(':');
    if (!key || values.length === 0) continue;

    const directive = key.trim().toLowerCase();
    const value = values.join(':').trim();

    if (directive === 'user-agent') {
      const ua = value.toLowerCase();
      currentRule = { userAgent: ua, disallows: [], allows: [] };
      rules.push(currentRule);
    } else if (directive === 'disallow' && currentRule) {
      if (value) currentRule.disallows.push(value);
    } else if (directive === 'allow' && currentRule) {
      if (value) currentRule.allows.push(value);
    } else if (directive === 'crawl-delay' && currentRule) {
      const delay = parseFloat(value);
      if (!isNaN(delay)) currentRule.crawlDelay = delay;
    } else if (directive === 'sitemap') {
      if (value.startsWith('http')) sitemaps.push(value);
    }
  }

  return { rules, sitemaps };
}

/**
 * Checks if a URL is allowed according to the domain's robots.txt.
 */
export async function isAllowedByRobots(
  targetUrl: string,
  userAgent: string = DEFAULT_USER_AGENT
): Promise<{ allowed: boolean; sitemaps: string[] }> {
  const check = validateAndNormalizeUrl(targetUrl);
  if (!check.safe || !check.domain) return { allowed: false, sitemaps: [] };

  const parsed = new URL(check.normalizedUrl!);
  const domain = parsed.origin;
  const path = parsed.pathname + parsed.search;

  // Check cache (1 hour TTL)
  const cached = robotsCache.get(domain);
  const now = Date.now();
  if (cached && now - cached.fetchedAt < 3600000) {
    return {
      allowed: checkPathAgainstRules(path, cached.rules, userAgent),
      sitemaps: cached.sitemaps,
    };
  }

  // Fetch robots.txt politely
  try {
    const robotsUrl = `${domain}/robots.txt`;
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(4000),
    });

    if (res.status === 404 || res.status === 403) {
      // 404 means no robots restrictions
      const entry = { fetchedAt: now, rules: [], sitemaps: [] };
      robotsCache.set(domain, entry);
      return { allowed: true, sitemaps: [] };
    }

    if (res.ok) {
      const text = await res.text();
      const { rules, sitemaps } = parseRobotsTxt(text);
      robotsCache.set(domain, { fetchedAt: now, rules, sitemaps });
      return {
        allowed: checkPathAgainstRules(path, rules, userAgent),
        sitemaps,
      };
    }
  } catch {
    // If robots.txt fetch fails/times out, default to allowed
  }

  return { allowed: true, sitemaps: [] };
}

function checkPathAgainstRules(path: string, rules: RobotsRule[], userAgent: string): boolean {
  if (rules.length === 0) return true;

  const uaLower = userAgent.toLowerCase();
  // Find specific rule or wildcard
  const matchingRule =
    rules.find((r) => r.userAgent !== '*' && uaLower.includes(r.userAgent)) ||
    rules.find((r) => r.userAgent === '*');

  if (!matchingRule) return true;

  // Check explicit allows first
  for (const allow of matchingRule.allows) {
    if (path.startsWith(allow)) return true;
  }

  // Check disallows
  for (const disallow of matchingRule.disallows) {
    if (disallow === '/' || path.startsWith(disallow)) {
      return false;
    }
  }

  return true;
}

/**
 * Safe fetch execution that inspects all redirect hops for SSRF and private IP destinations.
 * Protects against open-redirect to localhost/metadata or internal service SSRF attacks.
 */
export async function safeFetchWithRedirectValidation(
  initialUrl: string,
  options?: {
    headers?: Record<string, string>;
    method?: string;
    body?: any;
    timeoutMs?: number;
    maxRedirects?: number;
  }
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = initialUrl;
  const maxRedirects = options?.maxRedirects ?? 4;
  let redirectsRemaining = maxRedirects;

  while (true) {
    const check = validateAndNormalizeUrl(currentUrl);
    if (!check.safe || !check.normalizedUrl || !check.domain) {
      throw new Error(`SSRF Blocked: Unsafe destination URL '${currentUrl}' (${check.reason || 'Blocked'})`);
    }

    const dnsCheck = await validateDnsDestination(check.domain);
    if (!dnsCheck.safe) {
      throw new Error(`SSRF Blocked: Host '${check.domain}' resolved to restricted IP (${dnsCheck.reason})`);
    }

    const timeout = options?.timeoutMs || 8000;
    const res = await fetch(check.normalizedUrl, {
      method: options?.method || 'GET',
      headers: options?.headers,
      body: options?.body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeout),
    });

    const isRedirect = [301, 302, 303, 307, 308].includes(res.status);
    if (isRedirect) {
      const location = res.headers.get('location');
      if (!location) {
        return { response: res, finalUrl: check.normalizedUrl };
      }

      if (redirectsRemaining <= 0) {
        throw new Error(`Too many redirects (exceeded limit of ${maxRedirects})`);
      }
      redirectsRemaining--;

      try {
        const resolved = new URL(location, check.normalizedUrl).toString();
        currentUrl = resolved;
        continue;
      } catch (err: any) {
        throw new Error(`Invalid redirect location '${location}': ${err.message}`);
      }
    }

    return { response: res, finalUrl: check.normalizedUrl };
  }
}


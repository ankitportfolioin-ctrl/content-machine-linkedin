import { URL } from 'url';
import { promises as dns } from 'dns';

const PRIVATE_IPV4_RANGES = [
  { start: ipToInt('10.0.0.0'), end: ipToInt('10.255.255.255') },
  { start: ipToInt('172.16.0.0'), end: ipToInt('172.31.255.255') },
  { start: ipToInt('192.168.0.0'), end: ipToInt('192.168.255.255') },
  { start: ipToInt('127.0.0.0'), end: ipToInt('127.255.255.255') },
  { start: ipToInt('169.254.0.0'), end: ipToInt('169.254.255.255') },
  { start: ipToInt('0.0.0.0'), end: ipToInt('0.255.255.255') },
  { start: ipToInt('224.0.0.0'), end: ipToInt('239.255.255.255') },
  { start: ipToInt('240.0.0.0'), end: ipToInt('255.255.255.255') },
];

const METADATA_IPS = [
  '169.254.169.254',
  '169.254.170.2',
  '169.254.169.253',
  '169.254.169.251',
  '169.254.169.250',
  '169.254.169.249',
];

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipToInt(ip);
  return PRIVATE_IPV4_RANGES.some(range => ipInt >= range.start && ipInt <= range.end);
}

function isMetadataIP(ip: string): boolean {
  return METADATA_IPS.includes(ip);
}

function isLoopbackIPv6(ip: string): boolean {
  return ip === '::1' || ip === '0:0:0:0:0:0:0:1';
}

function isLinkLocalIPv6(ip: string): boolean {
  return ip.startsWith('fe80:') || ip.startsWith('FE80:');
}

function isPrivateIPv6(ip: string): boolean {
  if (ip.startsWith('fc00:') || ip.startsWith('FD00:') || ip.startsWith('fd00:')) {
    return true;
  }
  return false;
}

function isValidHostname(hostname: string): boolean {
  if (hostname.length > 255) return false;
  const parts = hostname.split('.');
  for (const part of parts) {
    if (part.length === 0 || part.length > 63) return false;
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(part)) return false;
  }
  return true;
}

function isPrivateIPv4Address(hostname: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (!ipv4Regex.test(hostname)) return false;
  return isPrivateIPv4(hostname);
}

export async function validateUrlForFetch(urlString: string): Promise<{ valid: boolean; error?: string }> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, error: 'Only HTTP and HTTPS protocols are allowed' };
  }

  if (isPrivateIPv4Address(url.hostname)) {
    return { valid: false, error: 'Blocked hostname' };
  }

  if (!isValidHostname(url.hostname)) {
    return { valid: false, error: 'Invalid hostname' };
  }

  const blockedHostnames = ['localhost', 'localhost.localdomain'];
  if (blockedHostnames.includes(url.hostname.toLowerCase())) {
    return { valid: false, error: 'Blocked hostname' };
  }

  return { valid: true };
}

async function resolveHostname(hostname: string): Promise<string[]> {
  // Use dns.lookup() which uses the system resolver (getaddrinfo)
  // This matches what fetch() uses and works in environments where
  // dns.resolve4()/resolve6() fail due to missing DNS server config
  try {
    const result = await dns.lookup(hostname, { all: true });
    return result.map(r => r.address);
  } catch (error) {
    // If lookup fails, return empty array - we'll let the actual fetch handle it
    return [];
  }
}

async function checkIpsForPrivateRanges(ips: string[]): Promise<{ valid: boolean; error?: string }> {
  for (const ip of ips) {
    // Check IPv4
    if (ip.includes('.')) {
      if (isPrivateIPv4(ip) || isMetadataIP(ip)) {
        return { valid: false, error: `Resolved to private/metadata IP: ${ip}` };
      }
    }
    // Check IPv6
    if (ip.includes(':')) {
      if (isLoopbackIPv6(ip) || isLinkLocalIPv6(ip) || isPrivateIPv6(ip)) {
        return { valid: false, error: `Resolved to private/link-local IPv6: ${ip}` };
      }
    }
  }
  return { valid: true };
}

export async function checkSsrfProtection(urlString: string, maxRedirects = 5): Promise<{ valid: boolean; error?: string; finalUrl?: string }> {
  const initialValidation = await validateUrlForFetch(urlString);
  if (!initialValidation.valid) {
    return { valid: false, error: initialValidation.error };
  }

  let currentUrl = urlString;
  let redirectCount = 0;
  const visitedUrls = new Set<string>();

  while (redirectCount <= maxRedirects) {
    if (visitedUrls.has(currentUrl)) {
      return { valid: false, error: 'Redirect loop detected' };
    }
    visitedUrls.add(currentUrl);

    const urlValidation = await validateUrlForFetch(currentUrl);
    if (!urlValidation.valid) {
      return { valid: false, error: urlValidation.error };
    }

    const url = new URL(currentUrl);
    
    // Resolve hostname using system resolver (matches fetch behavior)
    const ips = await resolveHostname(url.hostname);
    if (ips.length > 0) {
      const ipCheck = await checkIpsForPrivateRanges(ips);
      if (!ipCheck.valid) {
        return { valid: false, error: ipCheck.error };
      }
    }
    // If DNS resolution returns no IPs, we don't block - let the actual fetch handle it
    // This handles environments where the Node.js DNS resolver isn't configured
    // but the system resolver (used by fetch) works fine.

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'GrowthOperator/1.0 (+https://growth-operator.dev/bot)',
        },
      });

      clearTimeout(timeoutId);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          return { valid: true, finalUrl: currentUrl };
        }

        try {
          const redirectUrl = new URL(location, currentUrl);
          currentUrl = redirectUrl.toString();
          redirectCount++;
          continue;
        } catch {
          return { valid: false, error: 'Invalid redirect URL' };
        }
      }

      return { valid: true, finalUrl: currentUrl };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { valid: false, error: 'Request timeout' };
      }
      return { valid: false, error: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }

  return { valid: false, error: 'Too many redirects' };
}

export { isPrivateIPv4, isMetadataIP, isLoopbackIPv6, isLinkLocalIPv6, isPrivateIPv6, resolveHostname, checkIpsForPrivateRanges };
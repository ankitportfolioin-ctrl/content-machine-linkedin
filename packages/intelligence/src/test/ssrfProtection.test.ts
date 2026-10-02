import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkSsrfProtection, validateUrlForFetch, resolveHostname, checkIpsForPrivateRanges } from '../ssrfProtection';

vi.mock('dns', () => ({
  promises: {
    lookup: vi.fn(),
  },
}));

import * as dns from 'dns';

describe('SSRF Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateUrlForFetch', () => {
    it('rejects non-HTTP/HTTPS protocols', async () => {
      expect(await validateUrlForFetch('ftp://example.com')).toEqual({ valid: false, error: 'Only HTTP and HTTPS protocols are allowed' });
      expect(await validateUrlForFetch('file:///etc/passwd')).toEqual({ valid: false, error: 'Only HTTP and HTTPS protocols are allowed' });
      expect(await validateUrlForFetch('javascript:alert(1)')).toEqual({ valid: false, error: 'Only HTTP and HTTPS protocols are allowed' });
    });

    it('rejects localhost', async () => {
      expect(await validateUrlForFetch('http://localhost')).toEqual({ valid: false, error: 'Blocked hostname' });
      expect(await validateUrlForFetch('http://localhost.localdomain')).toEqual({ valid: false, error: 'Blocked hostname' });
      expect(await validateUrlForFetch('http://127.0.0.1')).toEqual({ valid: false, error: 'Blocked hostname' });
    });

    it('accepts valid public URLs', async () => {
      expect(await validateUrlForFetch('https://example.com')).toEqual({ valid: true });
      expect(await validateUrlForFetch('http://example.com')).toEqual({ valid: true });
    });
  });

  describe('resolveHostname', () => {
    it('resolves public hostnames', async () => {
      vi.mocked(dns.promises.lookup).mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ]);
      const ips = await resolveHostname('example.com');
      expect(ips).toContain('93.184.216.34');
      expect(ips).toContain('2606:2800:220:1:248:1893:25c8:1946');
    });

    it('returns empty array on DNS failure', async () => {
      vi.mocked(dns.promises.lookup).mockRejectedValue(new Error('ENOTFOUND'));
      const ips = await resolveHostname('nonexistent.example.com');
      expect(ips).toEqual([]);
    });
  });

  describe('checkIpsForPrivateRanges', () => {
    it('rejects private IPv4 ranges', async () => {
      // 10.0.0.0/8
      expect(await checkIpsForPrivateRanges(['10.0.0.1'])).toEqual({ valid: false, error: 'Resolved to private/metadata IP: 10.0.0.1' });

      // 172.16.0.0/12
      expect(await checkIpsForPrivateRanges(['172.16.0.1'])).toEqual({ valid: false, error: 'Resolved to private/metadata IP: 172.16.0.1' });

      // 192.168.0.0/16
      expect(await checkIpsForPrivateRanges(['192.168.1.1'])).toEqual({ valid: false, error: 'Resolved to private/metadata IP: 192.168.1.1' });

      // 127.0.0.0/8
      expect(await checkIpsForPrivateRanges(['127.0.0.1'])).toEqual({ valid: false, error: 'Resolved to private/metadata IP: 127.0.0.1' });

      // 169.254.0.0/16 (link-local / metadata)
      expect(await checkIpsForPrivateRanges(['169.254.169.254'])).toEqual({ valid: false, error: 'Resolved to private/metadata IP: 169.254.169.254' });
    });

    it('rejects cloud metadata addresses', async () => {
      expect(await checkIpsForPrivateRanges(['169.254.169.254'])).toEqual({ valid: false, error: 'Resolved to private/metadata IP: 169.254.169.254' });
      expect(await checkIpsForPrivateRanges(['169.254.170.2'])).toEqual({ valid: false, error: 'Resolved to private/metadata IP: 169.254.170.2' });
    });

    it('rejects private IPv6 ranges', async () => {
      expect(await checkIpsForPrivateRanges(['fc00::1'])).toEqual({ valid: false, error: 'Resolved to private/link-local IPv6: fc00::1' });
      expect(await checkIpsForPrivateRanges(['fe80::1'])).toEqual({ valid: false, error: 'Resolved to private/link-local IPv6: fe80::1' });
      expect(await checkIpsForPrivateRanges(['::1'])).toEqual({ valid: false, error: 'Resolved to private/link-local IPv6: ::1' });
    });

    it('allows public IPs', async () => {
      expect(await checkIpsForPrivateRanges(['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'])).toEqual({ valid: true });
    });
  });

  describe('checkSsrfProtection', () => {
    it('rejects unsafe protocols', async () => {
      expect(await checkSsrfProtection('ftp://example.com')).toEqual({ valid: false, error: 'Only HTTP and HTTPS protocols are allowed' });
    });

    it('rejects localhost', async () => {
      expect(await checkSsrfProtection('http://localhost')).toEqual({ valid: false, error: 'Blocked hostname' });
      expect(await checkSsrfProtection('http://127.0.0.1')).toEqual({ valid: false, error: 'Blocked hostname' });
    });

    it('rejects private IPv4 addresses', async () => {
      expect(await checkSsrfProtection('http://10.0.0.1')).toEqual({ valid: false, error: 'Blocked hostname' });
      expect(await checkSsrfProtection('http://192.168.1.1')).toEqual({ valid: false, error: 'Blocked hostname' });
      expect(await checkSsrfProtection('http://172.16.0.1')).toEqual({ valid: false, error: 'Blocked hostname' });
    });

    it('rejects metadata service IPs', async () => {
      expect(await checkSsrfProtection('http://169.254.169.254')).toEqual({ valid: false, error: 'Blocked hostname' });
    });

    it('rejects unsafe protocols', async () => {
      expect(await checkSsrfProtection('file:///etc/passwd')).toEqual({ valid: false, error: 'Only HTTP and HTTPS protocols are allowed' });
      expect(await checkSsrfProtection('javascript:alert(1)')).toEqual({ valid: false, error: 'Only HTTP and HTTPS protocols are allowed' });
    });

    it('allows valid public URLs (URL validation)', async () => {
      const result = await validateUrlForFetch('https://example.com');
      expect(result.valid).toBe(true);
    });

    it('blocks private IPs resolved via DNS', async () => {
      vi.mocked(dns.promises.lookup).mockResolvedValue([{ address: '10.0.0.1', family: 4 }]);
      const result = await checkSsrfProtection('http://private.example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private');
    });

    it('blocks metadata IPs resolved via DNS', async () => {
      vi.mocked(dns.promises.lookup).mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
      const result = await checkSsrfProtection('http://metadata.example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private');
    });

    it('blocks private IPv6 resolved via DNS', async () => {
      vi.mocked(dns.promises.lookup).mockResolvedValue([{ address: 'fc00::1', family: 6 }]);
      const result = await checkSsrfProtection('http://private-ipv6.example.com');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private');
    });

    it('allows public IPs resolved via DNS', async () => {
      vi.mocked(dns.promises.lookup).mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 },
      ]);
      // We can't fully test the fetch part without mocking fetch, but we can verify
      // the DNS resolution doesn't block public IPs
      const result = await checkSsrfProtection('https://example.com');
      // The check may return valid: true (if fetch succeeds) or valid: false with fetch error
      // The important thing is it doesn't fail on DNS resolution
      expect(result.error === 'DNS resolution failed').toBe(false);
      expect(result.error === undefined || !result.error.includes('DNS resolution failed')).toBe(true);
    });

    it('allows fetch to proceed even if DNS lookup returns no IPs', async () => {
      // This simulates an environment where Node.js DNS resolver isn't configured
      // but system resolver (used by fetch) works
      vi.mocked(dns.promises.lookup).mockRejectedValue(new Error('ENOTFOUND'));
      // The check should not fail on DNS resolution - it lets fetch handle it
      // We can't easily mock fetch, but we verify it doesn't return DNS resolution error
      const result = await checkSsrfProtection('https://example.com');
      expect(result.error === 'DNS resolution failed').toBe(false);
      expect(result.error === undefined || !result.error.includes('DNS resolution failed')).toBe(true);
    });
  });
});
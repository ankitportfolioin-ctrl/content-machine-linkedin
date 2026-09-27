import { describe, it, expect } from 'vitest';
import { canonicalizeUrl, getUrlHash, getContentHash } from '@growth-operator/shared';

describe('URL Canonicalization', () => {
  describe('canonicalizeUrl', () => {
    it('removes fragments', () => {
      expect(canonicalizeUrl('https://example.com/page#section')).toBe('https://example.com/page');
    });

    it('removes tracking parameters', () => {
      const url = 'https://example.com/page?utm_source=google&utm_medium=cpc&utm_campaign=test&fbclid=123&gclid=456';
      expect(canonicalizeUrl(url)).toBe('https://example.com/page');
    });

    it('preserves meaningful query parameters', () => {
      const url = 'https://example.com/search?q=test&page=2&sort=date&order=desc';
      expect(canonicalizeUrl(url)).toBe('https://example.com/search?order=desc&page=2&q=test&sort=date');
    });

    it('normalizes hostname case', () => {
      expect(canonicalizeUrl('https://EXAMPLE.COM/page')).toBe('https://example.com/page');
    });

    it('normalizes protocol case', () => {
      expect(canonicalizeUrl('HTTPS://example.com/page')).toBe('https://example.com/page');
    });

    it('removes default ports', () => {
      expect(canonicalizeUrl('https://example.com:443/page')).toBe('https://example.com/page');
      expect(canonicalizeUrl('http://example.com:80/page')).toBe('http://example.com/page');
    });

    it('removes trailing slash for non-root paths', () => {
      expect(canonicalizeUrl('https://example.com/page/')).toBe('https://example.com/page');
    });

    it('preserves trailing slash for root path', () => {
      expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com/');
    });

    it('normalizes equivalent URLs identically', () => {
      const url1 = 'https://Example.COM/page?utm_source=test&page=1#section';
      const url2 = 'https://example.com/page?page=1';
      expect(canonicalizeUrl(url1)).toBe(canonicalizeUrl(url2));
    });

    it('throws on invalid URL', () => {
      expect(() => canonicalizeUrl('not-a-url')).toThrow('Invalid URL');
    });

    it('preserves meaningful parameters over tracking', () => {
      const url = 'https://example.com/page?utm_campaign=test&q=search&fbclid=123';
      expect(canonicalizeUrl(url)).toBe('https://example.com/page?q=search');
    });

    it('handles query parameter sorting', () => {
      const url = 'https://example.com/page?z=1&a=2&m=3';
      expect(canonicalizeUrl(url)).toBe('https://example.com/page?a=2&m=3&z=1');
    });
  });

  describe('getUrlHash', () => {
    it('produces consistent hash for same URL', () => {
      const url = 'https://example.com/page?param=value';
      expect(getUrlHash(url)).toBe(getUrlHash(url));
    });

    it('produces different hash for different URLs', () => {
      expect(getUrlHash('https://example.com/page1')).not.toBe(getUrlHash('https://example.com/page2'));
    });

    it('produces consistent hash for equivalent URLs', () => {
      expect(getUrlHash('https://example.com/page?utm_source=test')).toBe(getUrlHash('https://example.com/page'));
    });
  });

  describe('getContentHash', () => {
    it('produces consistent hash for same content', () => {
      const content = 'This is test content';
      expect(getContentHash(content)).toBe(getContentHash(content));
    });

    it('produces different hash for different content', () => {
      expect(getContentHash('content 1')).not.toBe(getContentHash('content 2'));
    });

    it('handles empty content', () => {
      expect(getContentHash('')).toBeDefined();
    });
  });
});
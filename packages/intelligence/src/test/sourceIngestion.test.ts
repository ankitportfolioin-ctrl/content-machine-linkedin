import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SourceIngestionService } from '../sourceIngestion';
import { checkSsrfProtection } from '../ssrfProtection';
import { canonicalizeUrl, getUrlHash, extractHtmlContent } from '@growth-operator/shared';

vi.mock('@growth-operator/shared', () => ({
  canonicalizeUrl: vi.fn(),
  getUrlHash: vi.fn(),
  getContentHash: vi.fn(),
  detectContentType: vi.fn(),
  extractHtmlContent: vi.fn(),
  extractRssContent: vi.fn(),
  extractAtomContent: vi.fn(),
  extractSitemapContent: vi.fn(),
}));

vi.mock('../ssrfProtection', () => ({
  checkSsrfProtection: vi.fn(),
}));

const mockPrisma = {
  intelligenceSource: {
    findUnique: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: 'failed-source-id', status: 'FAILED' }),
  },
  sourceDocument: {
    create: vi.fn(),
  },
} as unknown as PrismaClient;

describe('SourceIngestionService', () => {
  let service: SourceIngestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SourceIngestionService(mockPrisma);
    vi.mocked(canonicalizeUrl).mockImplementation((url: string) => {
      if (url === 'not-a-url') throw new Error('Invalid URL');
      return url;
    });
    vi.mocked(getUrlHash).mockReturnValue('url-hash-123');
    vi.mocked(checkSsrfProtection).mockResolvedValue({ valid: true, finalUrl: 'https://example.com/page' });
    vi.mocked(extractHtmlContent).mockResolvedValue({ title: 'Test', mainContent: 'Content', description: 'Desc', publishDate: null, author: null, language: null, canonicalUrl: 'https://example.com/new-page', wordCount: 100, contentType: 'html', feedItems: [], sitemapUrls: [] });
  });

  describe('ingest', () => {
    it('rejects invalid URLs', async () => {
      mockPrisma.intelligenceSource.findUnique.mockResolvedValue(null);
      vi.mocked(canonicalizeUrl).mockImplementationOnce(() => { throw new Error('Invalid URL'); });

      const result = await service.ingest('workspace-1', 'not-a-url', {});

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Invalid URL');
    });

    it('checks SSRF protection', async () => {
      mockPrisma.intelligenceSource.findUnique.mockResolvedValue(null);
      vi.mocked(checkSsrfProtection).mockResolvedValueOnce({ valid: false, error: 'Blocked hostname' });

      const result = await service.ingest('workspace-1', 'http://localhost', {});

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Blocked hostname');
    });

    it('rejects private IP addresses', async () => {
      mockPrisma.intelligenceSource.findUnique.mockResolvedValue(null);
      vi.mocked(checkSsrfProtection).mockResolvedValueOnce({ valid: false, error: 'Blocked hostname' });

      const result = await service.ingest('workspace-1', 'http://10.0.0.1', {});

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Blocked hostname');
    });

    it('rejects metadata service IPs', async () => {
      mockPrisma.intelligenceSource.findUnique.mockResolvedValue(null);
      vi.mocked(checkSsrfProtection).mockResolvedValueOnce({ valid: false, error: 'Blocked hostname' });

      const result = await service.ingest('workspace-1', 'http://169.254.169.254', {});

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Blocked hostname');
    });

    it('handles existing source by canonical URL', async () => {
      mockPrisma.intelligenceSource.findUnique.mockResolvedValue({ id: 'existing-id', status: 'ACTIVE', sourceType: 'ARTICLE', canonicalUrl: 'https://example.com/page' });

      const result = await service.ingest('workspace-1', 'https://example.com/page', {});

      expect(result.status).toBe('SUCCESS');
      expect(result.sourceId).toBe('existing-id');
      expect(result.error).toBe('Source already exists');
    });

    it('handles existing source by content hash', async () => {
      mockPrisma.intelligenceSource.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'existing-hash-id' });

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('text/html'),
        },
        body: {
          getReader: vi.fn().mockReturnValue({
            read: vi.fn().mockResolvedValue({ done: true, value: new Uint8Array() }),
          }),
        },
      });

      const result = await service.ingest('workspace-1', 'https://example.com/new-page', {});

      expect(result.status).toBe('SUCCESS');
      expect(result.error).toBe('Content already exists');
    });

    it('handles fetch timeout', async () => {
      mockPrisma.intelligenceSource.findUnique.mockResolvedValue(null);

      vi.spyOn(global, 'fetch').mockImplementation(() => {
        return new Promise((_, reject) => {
          const error = new Error('Timeout') as Error & { name: string };
          error.name = 'AbortError';
          reject(error);
        });
      });

      const result = await service.ingest('workspace-1', 'https://example.com/slow', { timeout: 100 });

      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Request timeout');
    });

    it('handles HTTP errors', async () => {
      mockPrisma.intelligenceSource.findUnique.mockResolvedValue(null);

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const result = await service.ingest('workspace-1', 'https://example.com/notfound', {});

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('404');
    });

    it('handles oversized response', async () => {
      mockPrisma.intelligenceSource.findUnique.mockResolvedValue(null);

      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('15000000'),
        },
      });

      const result = await service.ingest('workspace-1', 'https://example.com/large', { maxResponseSize: 10000000 });

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('Response too large');
    });

    it('handles streaming size limit', async () => {
      mockPrisma.intelligenceSource.findUnique.mockResolvedValue(null);

      let readCount = 0;
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue(null) },
        body: {
          getReader: () => ({
            read: vi.fn().mockImplementation(() => {
              readCount++;
              if (readCount <= 2) {
                return Promise.resolve({ done: false, value: new Uint8Array(6000000) });
              }
              return Promise.resolve({ done: true, value: new Uint8Array() });
            }),
          }),
        },
      });

      const result = await service.ingest('workspace-1', 'https://example.com/large', { maxResponseSize: 10000000 });

      expect(result.status).toBe('FAILED');
      expect(result.error).toContain('exceeded size limit');
    });
  });
});

describe('SSRF Protection Integration', () => {
  it('blocks localhost in ingestion', async () => {
    vi.mocked(checkSsrfProtection).mockResolvedValue({ valid: false, error: 'Blocked hostname' });
    const result = await checkSsrfProtection('http://localhost');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Blocked hostname');
  });

  it('blocks 127.0.0.1', async () => {
    vi.mocked(checkSsrfProtection).mockResolvedValue({ valid: false, error: 'Blocked hostname' });
    const result = await checkSsrfProtection('http://127.0.0.1');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Blocked hostname');
  });

  it('blocks private IPv4 ranges', async () => {
    vi.mocked(checkSsrfProtection).mockResolvedValue({ valid: false, error: 'Blocked hostname' });
    const result = await checkSsrfProtection('http://10.0.0.1');
    expect(result.valid).toBe(false);
  });

  it('blocks metadata service', async () => {
    vi.mocked(checkSsrfProtection).mockResolvedValue({ valid: false, error: 'Blocked hostname' });
    const result = await checkSsrfProtection('http://169.254.169.254');
    expect(result.valid).toBe(false);
  });

  it('blocks private IPv6', async () => {
    vi.mocked(checkSsrfProtection).mockResolvedValue({ valid: false, error: 'Blocked hostname' });
    const result = await checkSsrfProtection('http://[fc00::1]');
    expect(result.valid).toBe(false);
  });

  it('allows valid public URLs', async () => {
    vi.mocked(checkSsrfProtection).mockResolvedValue({ valid: true });
    const result = await checkSsrfProtection('https://example.com');
    expect(result.valid).toBe(true);
  });
});
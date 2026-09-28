import { PrismaClient } from '@prisma/client';
import { canonicalizeUrl, getUrlHash, getContentHash, detectContentType, extractHtmlContent, extractRssContent, extractAtomContent, extractSitemapContent, ExtractedContent, FeedItem } from '@growth-operator/shared';
import { checkSsrfProtection } from './ssrfProtection';

export interface IngestionResult {
  sourceId: string;
  documentId: string | null;
  status: 'SUCCESS' | 'FAILED' | 'PARTIAL';
  sourceType: 'ARTICLE' | 'RSS' | 'ATOM' | 'SITEMAP' | 'WEBSITE' | 'USER_URL';
  extractedContent: ExtractedContent | null;
  feedItems: FeedItem[];
  sitemapUrls: string[];
  error?: string;
}

export interface IngestionOptions {
  sourceType?: 'ARTICLE' | 'RSS' | 'ATOM' | 'SITEMAP' | 'WEBSITE' | 'USER_URL';
  maxResponseSize?: number;
  timeout?: number;
}

const DEFAULT_MAX_RESPONSE_SIZE = 10 * 1024 * 1024;
const DEFAULT_TIMEOUT = 30000;

export class SourceIngestionService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async ingest(
    workspaceId: string,
    url: string,
    options: IngestionOptions = {}
  ): Promise<IngestionResult> {
    let canonicalUrl: string;
    try {
      canonicalUrl = canonicalizeUrl(url);
    } catch (error) {
      const failedSource = await this.createFailedSource(workspaceId, url, url, options.sourceType || 'USER_URL', `Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        sourceId: failedSource.id,
        documentId: null,
        status: 'FAILED',
        sourceType: options.sourceType || 'USER_URL',
        extractedContent: null,
        feedItems: [],
        sitemapUrls: [],
        error: `Invalid URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
    const urlHash = getUrlHash(canonicalUrl);

    const existingSource = await this.prisma.intelligenceSource.findUnique({
      where: {
        workspaceId_canonicalUrl: {
          workspaceId,
          canonicalUrl,
        },
      },
    });

    if (existingSource) {
      return {
        sourceId: existingSource.id,
        documentId: null,
        status: 'SUCCESS',
        sourceType: existingSource.sourceType as any,
        extractedContent: null,
        feedItems: [],
        sitemapUrls: [],
        error: 'Source already exists',
      };
    }

    const ssrfCheck = await checkSsrfProtection(canonicalUrl);
    if (!ssrfCheck.valid) {
      const failedSource = await this.createFailedSource(workspaceId, canonicalUrl, url, options.sourceType || 'USER_URL', ssrfCheck.error || 'SSRF check failed');
      return {
        sourceId: failedSource.id,
        documentId: null,
        status: 'FAILED',
        sourceType: options.sourceType || 'USER_URL',
        extractedContent: null,
        feedItems: [],
        sitemapUrls: [],
        error: ssrfCheck.error,
      };
    }

    const finalUrl = ssrfCheck.finalUrl || canonicalUrl;

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT);

      response = await fetch(finalUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'GrowthOperator/1.0 (+https://growth-operator.dev/bot)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      clearTimeout(timeoutId);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const failedSource = await this.createFailedSource(workspaceId, canonicalUrl, url, options.sourceType || 'USER_URL', 'Request timeout');
        return {
          sourceId: failedSource.id,
          documentId: null,
          status: 'FAILED',
          sourceType: options.sourceType || 'USER_URL',
          extractedContent: null,
          feedItems: [],
          sitemapUrls: [],
          error: 'Request timeout',
        };
      }
      const failedSource = await this.createFailedSource(workspaceId, canonicalUrl, url, options.sourceType || 'USER_URL', `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        sourceId: failedSource.id,
        documentId: null,
        status: 'FAILED',
        sourceType: options.sourceType || 'USER_URL',
        extractedContent: null,
        feedItems: [],
        sitemapUrls: [],
        error: `Fetch failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    if (!response.ok) {
      const failedSource = await this.createFailedSource(workspaceId, canonicalUrl, url, options.sourceType || 'USER_URL', `HTTP ${response.status}: ${response.statusText}`);
      return {
        sourceId: failedSource.id,
        documentId: null,
        status: 'FAILED',
        sourceType: options.sourceType || 'USER_URL',
        extractedContent: null,
        feedItems: [],
        sitemapUrls: [],
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const contentType = response.headers.get('content-type') || '';
    const contentLength = response.headers.get('content-length');
    const maxSize = options.maxResponseSize || DEFAULT_MAX_RESPONSE_SIZE;

    if (contentLength && parseInt(contentLength, 10) > maxSize) {
      const failedSource = await this.createFailedSource(workspaceId, canonicalUrl, url, options.sourceType || 'USER_URL', `Response too large: ${contentLength} bytes`);
      return {
        sourceId: failedSource.id,
        documentId: null,
        status: 'FAILED',
        sourceType: options.sourceType || 'USER_URL',
        extractedContent: null,
        feedItems: [],
        sitemapUrls: [],
        error: `Response too large: ${contentLength} bytes`,
      };
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const reader = response.body?.getReader();

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        totalSize += value.length;
        if (totalSize > maxSize) {
          const failedSource = await this.createFailedSource(workspaceId, canonicalUrl, url, options.sourceType || 'USER_URL', `Response exceeded size limit during download`);
          return {
            sourceId: failedSource.id,
            documentId: null,
            status: 'FAILED',
            sourceType: options.sourceType || 'USER_URL',
            extractedContent: null,
            feedItems: [],
            sitemapUrls: [],
            error: `Response exceeded size limit during download`,
          };
        }
      }
    }

    const rawContent = new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
    const contentHash = getContentHash(rawContent);

    const existingByHash = await this.prisma.intelligenceSource.findUnique({
      where: {
        workspaceId_contentHash: {
          workspaceId,
          contentHash,
        },
      },
    });

    if (existingByHash) {
      return {
        sourceId: existingByHash.id,
        documentId: null,
        status: 'SUCCESS',
        sourceType: existingByHash.sourceType as any,
        extractedContent: null,
        feedItems: [],
        sitemapUrls: [],
        error: 'Content already exists',
      };
  }

    const detectedType = options.sourceType || this.mapContentTypeToSourceType(detectContentType(contentType, rawContent));

    let extractedContent: ExtractedContent | null = null;
    let feedItems: FeedItem[] = [];
    let sitemapUrls: string[] = [];
    let extractionStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 'SUCCESS';
    let extractionWarnings: string[] = [];

    try {
      switch (detectedType) {
        case 'RSS':
        case 'ATOM':
        case 'SITEMAP':
        case 'WEBSITE': {
          const extracted = await this.extractContent(rawContent, detectedType, finalUrl);
          extractedContent = extracted.content;
          feedItems = extracted.feedItems;
          sitemapUrls = extracted.sitemapUrls;
          break;
        }
        case 'ARTICLE':
        case 'USER_URL': {
          const extracted = extractHtmlContent(rawContent, finalUrl);
          extractedContent = extracted;
          break;
        }
        default: {
          const extracted = extractHtmlContent(rawContent, finalUrl);
          extractedContent = extracted;
          break;
        }
      }
    } catch (error) {
      extractionStatus = 'FAILED';
      extractionWarnings.push(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    const source = await this.prisma.intelligenceSource.create({
      data: {
        workspaceId,
        url: finalUrl,
        canonicalUrl,
        sourceType: detectedType,
        title: extractedContent?.title || null,
        publisher: extractedContent?.publisher || null,
        author: extractedContent?.author || null,
        publishedAt: extractedContent?.publishedAt || null,
        publishedAtConfidence: extractedContent?.publishedAtConfidence || 'UNKNOWN',
        description: extractedContent?.description || null,
        contentHash,
        urlHash,
        status: extractionStatus === 'FAILED' ? 'FAILED' : 'ACTIVE',
        lastFetchedAt: new Date(),
      },
    });

    const document = await this.prisma.sourceDocument.create({
      data: {
        workspaceId,
        sourceId: source.id,
        rawContent,
        cleanContent: extractedContent?.mainContent || '',
        contentType: this.mapSourceTypeToContentType(detectedType),
        wordCount: extractedContent?.wordCount || 0,
        language: extractedContent?.language || null,
        extractionMethod: this.mapSourceTypeToExtractionMethod(detectedType),
        extractionStatus,
        extractionWarnings,
        fetchedAt: new Date(),
      },
    });

    return {
      sourceId: source.id,
      documentId: document.id,
      status: extractionStatus === 'FAILED' ? 'FAILED' : 'SUCCESS',
      sourceType: detectedType,
      extractedContent,
      feedItems,
      sitemapUrls,
      error: extractionWarnings.length > 0 ? extractionWarnings.join('; ') : undefined,
    };
  }

  private async createFailedSource(
    workspaceId: string,
    canonicalUrl: string,
    originalUrl: string,
    sourceType: string,
    error: string
  ) {
    const urlHash = getUrlHash(canonicalUrl);
    // Scope the failure hash to the URL: hashing the error text alone
    // collides on (workspaceId, contentHash) when two different URLs fail
    // with the same message (e.g. identical DNS errors), which threw a
    // unique-constraint violation instead of returning FAILED. Identical
    // re-failures of the same URL still dedupe via the pre-check in ingest.
    const contentHash = getContentHash(`${canonicalUrl}\n${error}`);

    return this.prisma.intelligenceSource.create({
      data: {
        workspaceId,
        url: originalUrl,
        canonicalUrl,
        sourceType: sourceType as any,
        title: null,
        publisher: null,
        author: null,
        publishedAt: null,
        publishedAtConfidence: 'UNKNOWN',
        description: null,
        contentHash,
        urlHash,
        status: 'FAILED',
        lastFetchedAt: new Date(),
      },
    });
  }

  private mapContentTypeToSourceType(detected: string): 'ARTICLE' | 'RSS' | 'ATOM' | 'SITEMAP' | 'WEBSITE' | 'USER_URL' {
    switch (detected) {
      case 'rss': return 'RSS';
      case 'atom': return 'ATOM';
      case 'sitemap': return 'SITEMAP';
      case 'html': return 'ARTICLE';
      default: return 'USER_URL';
    }
  }

  private mapSourceTypeToContentType(sourceType: string): 'HTML' | 'RSS_XML' | 'ATOM_XML' | 'SITEMAP_XML' | 'TEXT' {
    switch (sourceType) {
      case 'RSS': return 'RSS_XML';
      case 'ATOM': return 'ATOM_XML';
      case 'SITEMAP': return 'SITEMAP_XML';
      case 'ARTICLE':
      case 'WEBSITE':
      case 'USER_URL':
      default: return 'HTML';
    }
  }

  private mapSourceTypeToExtractionMethod(sourceType: string): 'HTML' | 'RSS' | 'ATOM' | 'SITEMAP' | 'TEXT' | 'USER_PROVIDED' {
    switch (sourceType) {
      case 'RSS': return 'RSS';
      case 'ATOM': return 'ATOM';
      case 'SITEMAP': return 'SITEMAP';
      case 'ARTICLE':
      case 'WEBSITE':
      case 'USER_URL':
      default: return 'HTML';
    }
  }

  private async extractContent(
    rawContent: string,
    sourceType: string,
    baseUrl: string
  ): Promise<{ content: ExtractedContent | null; feedItems: FeedItem[]; sitemapUrls: string[] }> {
    switch (sourceType) {
      case 'RSS': {
        const result = await extractRssContent(rawContent);
        return {
          content: result.items.length > 0 ? {
            title: result.feed.title,
            description: result.feed.description,
            author: null,
            publisher: null,
            publishedAt: null,
            publishedAtConfidence: 'UNKNOWN',
            mainContent: result.items.map(i => i.description || '').join('\n\n'),
            headings: result.items.map(i => i.title || '').filter(Boolean),
            paragraphs: result.items.map(i => i.description || '').filter(Boolean),
            wordCount: result.items.reduce((acc, i) => acc + (i.description?.split(/\s+/).length || 0), 0),
            language: null,
          } : null,
          feedItems: result.items,
          sitemapUrls: [],
        };
      }
      case 'ATOM': {
        const result = await extractAtomContent(rawContent);
        return {
          content: result.items.length > 0 ? {
            title: result.feed.title,
            description: result.feed.subtitle,
            author: null,
            publisher: null,
            publishedAt: null,
            publishedAtConfidence: 'UNKNOWN',
            mainContent: result.items.map(i => i.description || '').join('\n\n'),
            headings: result.items.map(i => i.title || '').filter(Boolean),
            paragraphs: result.items.map(i => i.description || '').filter(Boolean),
            wordCount: result.items.reduce((acc, i) => acc + (i.description?.split(/\s+/).length || 0), 0),
            language: null,
          } : null,
          feedItems: result.items,
          sitemapUrls: [],
        };
      }
      case 'SITEMAP': {
        const result = await extractSitemapContent(rawContent);
        return {
          content: {
            title: 'Sitemap',
            description: `Sitemap with ${result.urls.length} URLs`,
            author: null,
            publisher: null,
            publishedAt: null,
            publishedAtConfidence: 'UNKNOWN',
            mainContent: result.urls.join('\n'),
            headings: [],
            paragraphs: [],
            wordCount: 0,
            language: null,
          },
          feedItems: [],
          sitemapUrls: result.urls,
        };
      }
      default: {
        const extracted = extractHtmlContent(rawContent, baseUrl);
        return {
          content: extracted,
          feedItems: [],
          sitemapUrls: [],
        };
      }
    }
  }
}
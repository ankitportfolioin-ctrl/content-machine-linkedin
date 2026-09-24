import crypto from 'crypto';
import { validateAndNormalizeUrl, validateDnsDestination, isAllowedByRobots, enforceRateLimit, DEFAULT_USER_AGENT } from './crawlerSafety';
import { extractArticleContent, decodeHtmlEntities, ExtractedArticle } from './htmlExtractor';

export interface ContentDocument {
  id: string;
  sourceId: string;
  sourceName: string;
  sourceType: string;
  url: string;
  canonicalUrl: string;
  title: string;
  author?: string;
  publishedAt?: string;
  updatedAt?: string;
  description?: string;
  body: string;
  headings: string[];
  tags: string[];
  language?: string;
  topics: string[];
  keywords: string[];
  contentHash: string;
  discoveredAt: string;
  quality: 'HIGH' | 'MEDIUM' | 'LOW';
  format?: string;
}

export interface CrawlLogEntry {
  sourceName: string;
  url: string;
  status: 'SUCCESS' | 'BLOCKED' | 'NOT_FOUND' | 'ERROR' | 'CACHED';
  durationMs: number;
  extractedChars: number;
  error?: string;
}

interface PageCacheEntry {
  url: string;
  document: ContentDocument;
  fetchedAt: number;
  expiresAt: number;
}

// In-memory cache for crawled documents with configurable TTL (default 4 hours)
const pageCache = new Map<string, PageCacheEntry>();
const crawlerLogs: CrawlLogEntry[] = [];

/**
 * Extracts key keywords from title and body for indexing and deduplication.
 */
export function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'about', 'above', 'after', 'again', 'against', 'all', 'and', 'any', 'are', 'aren',
    'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
    'could', 'did', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from',
    'further', 'had', 'has', 'have', 'having', 'her', 'here', 'hers', 'herself', 'him',
    'himself', 'his', 'how', 'into', 'its', 'itself', 'just', 'more', 'most', 'not',
    'now', 'off', 'once', 'only', 'other', 'our', 'ours', 'ourselves', 'out', 'over',
    'own', 'same', 'should', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
    'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
    'too', 'under', 'until', 'very', 'was', 'were', 'what', 'when', 'where', 'which',
    'while', 'who', 'whom', 'why', 'with', 'would', 'your', 'yours', 'yourself'
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9+#.-]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  const frequencies = new Map<string, number>();
  for (const word of words) {
    frequencies.set(word, (frequencies.get(word) || 0) + 1);
  }

  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([word]) => word);
}

export class WebCrawler {
  private userAgent: string;
  private maxResponseSize: number;
  private requestTimeoutMs: number;

  constructor(options?: {
    userAgent?: string;
    maxResponseSize?: number;
    requestTimeoutMs?: number;
  }) {
    this.userAgent = options?.userAgent || DEFAULT_USER_AGENT;
    this.maxResponseSize = options?.maxResponseSize || 2.5 * 1024 * 1024; // 2.5MB
    this.requestTimeoutMs = options?.requestTimeoutMs || 8000; // 8s
  }

  /**
   * Fetches and parses an RSS or Atom XML feed.
   */
  async fetchFeed(feedUrl: string, sourceName: string, sourceId: string): Promise<ContentDocument[]> {
    const check = validateAndNormalizeUrl(feedUrl);
    if (!check.safe || !check.normalizedUrl) {
      console.warn(`[TrendCrawler] Rejecting unsafe feed URL: ${feedUrl} (${check.reason})`);
      return [];
    }

    const start = Date.now();
    try {
      // Resolve DNS safely and guarantee target IP is not private/internal
      if (check.domain) {
        const dnsCheck = await validateDnsDestination(check.domain);
        if (!dnsCheck.safe) {
          console.warn(`[TrendCrawler] Blocking SSRF attempt: ${check.normalizedUrl} (${dnsCheck.reason})`);
          crawlerLogs.push({
            sourceName,
            url: check.normalizedUrl,
            status: 'BLOCKED',
            durationMs: Date.now() - start,
            extractedChars: 0,
            error: dnsCheck.reason || 'SSRF DNS protection blocked private IP',
          });
          return [];
        }
        await enforceRateLimit(check.domain, 500);
      }

      const res = await fetch(check.normalizedUrl, {
        headers: { 'User-Agent': this.userAgent, 'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*' },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (!res.ok) {
        crawlerLogs.push({
          sourceName,
          url: check.normalizedUrl,
          status: res.status === 403 || res.status === 401 ? 'BLOCKED' : 'ERROR',
          durationMs: Date.now() - start,
          extractedChars: 0,
          error: `HTTP ${res.status}`,
        });
        return [];
      }

      const xml = await res.text();
      const docs = this.parseFeedXml(xml, check.normalizedUrl, sourceName, sourceId);

      crawlerLogs.push({
        sourceName,
        url: check.normalizedUrl,
        status: 'SUCCESS',
        durationMs: Date.now() - start,
        extractedChars: docs.reduce((acc, d) => acc + d.body.length, 0),
      });

      return docs;
    } catch (err: any) {
      crawlerLogs.push({
        sourceName,
        url: check.normalizedUrl,
        status: 'ERROR',
        durationMs: Date.now() - start,
        extractedChars: 0,
        error: err.message,
      });
      return [];
    }
  }

  /**
   * Discovers RSS/Atom feeds from a domain or homepage HTML.
   */
  async discoverFeeds(domainUrl: string): Promise<string[]> {
    const check = validateAndNormalizeUrl(domainUrl);
    if (!check.safe || !check.normalizedUrl) return [];

    const discovered: string[] = [];
    const base = new URL(check.normalizedUrl).origin;

    // Common standard feed endpoints
    const standardCandidates = [
      `${base}/feed`,
      `${base}/rss`,
      `${base}/rss.xml`,
      `${base}/atom.xml`,
      `${base}/feed/atom`,
      `${base}/index.xml`,
    ];

    try {
      const res = await fetch(check.normalizedUrl, {
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const html = await res.text();
        const feedMatches = [
          ...html.matchAll(/<link[^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["'][^>]*>/gi),
        ];

        for (const m of feedMatches) {
          const href = m[1];
          const resolved = href.startsWith('http') ? href : new URL(href, base).toString();
          discovered.push(resolved);
        }
      }
    } catch {
      // Fall through to probe standard endpoints if homepage scan failed
    }

    if (discovered.length === 0) {
      // Probe first 2 standard candidates
      for (const candidate of standardCandidates.slice(0, 2)) {
        try {
          const res = await fetch(candidate, {
            method: 'HEAD',
            headers: { 'User-Agent': this.userAgent },
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) discovered.push(candidate);
        } catch {}
      }
    }

    return [...new Set(discovered)];
  }

  /**
   * Fetches and parses a public sitemap for recent article URLs.
   */
  async fetchSitemap(sitemapUrl: string, maxUrls: number = 20): Promise<string[]> {
    const check = validateAndNormalizeUrl(sitemapUrl);
    if (!check.safe || !check.normalizedUrl) return [];

    try {
      const res = await fetch(check.normalizedUrl, {
        headers: { 'User-Agent': this.userAgent },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (!res.ok) return [];

      const xml = await res.text();
      const locMatches = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)];
      const urls: string[] = [];

      for (const m of locMatches) {
        const candidate = m[1].trim();
        const v = validateAndNormalizeUrl(candidate);
        if (v.safe && v.normalizedUrl && !v.normalizedUrl.endsWith('.xml') && !v.normalizedUrl.endsWith('.gz')) {
          urls.push(v.normalizedUrl);
          if (urls.length >= maxUrls) break;
        }
      }

      return urls;
    } catch {
      return [];
    }
  }

  /**
   * Crawls a single public HTML page, respecting robots.txt and SSRF limits.
   */
  async crawlPublicPage(
    pageUrl: string,
    sourceName: string,
    sourceId: string,
    quality: 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM'
  ): Promise<ContentDocument | null> {
    const check = validateAndNormalizeUrl(pageUrl);
    if (!check.safe || !check.normalizedUrl || !check.domain) {
      return null;
    }

    // Check cache
    const cached = pageCache.get(check.normalizedUrl);
    const now = Date.now();
    if (cached && now < cached.expiresAt) {
      return cached.document;
    }

    // Check robots.txt
    const robots = await isAllowedByRobots(check.normalizedUrl, this.userAgent);
    if (!robots.allowed) {
      crawlerLogs.push({
        sourceName,
        url: check.normalizedUrl,
        status: 'BLOCKED',
        durationMs: 0,
        extractedChars: 0,
        error: 'Disallowed by robots.txt',
      });
      return null;
    }

    const start = Date.now();
    try {
      // Resolve DNS safely to prevent SSRF against internal/private IPs
      const dnsCheck = await validateDnsDestination(check.domain);
      if (!dnsCheck.safe) {
        console.warn(`[TrendCrawler] Blocking SSRF attempt: ${check.normalizedUrl} (${dnsCheck.reason})`);
        crawlerLogs.push({
          sourceName,
          url: check.normalizedUrl,
          status: 'BLOCKED',
          durationMs: Date.now() - start,
          extractedChars: 0,
          error: dnsCheck.reason || 'SSRF DNS protection blocked private IP',
        });
        return null;
      }

      await enforceRateLimit(check.domain, 800);

      const res = await fetch(check.normalizedUrl, {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });

      if (!res.ok) {
        crawlerLogs.push({
          sourceName,
          url: check.normalizedUrl,
          status: res.status === 403 || res.status === 401 ? 'BLOCKED' : 'ERROR',
          durationMs: Date.now() - start,
          extractedChars: 0,
          error: `HTTP ${res.status}`,
        });
        return null;
      }

      const html = await res.text();
      const extracted = extractArticleContent(html, check.normalizedUrl);

      const keywords = extractKeywords(`${extracted.title} ${extracted.body}`);
      const doc: ContentDocument = {
        id: `doc_${crypto.randomBytes(8).toString('hex')}`,
        sourceId,
        sourceName,
        sourceType: 'HTML_ARTICLE',
        url: check.normalizedUrl,
        canonicalUrl: extracted.canonicalUrl || check.normalizedUrl,
        title: extracted.title,
        author: extracted.author,
        publishedAt: extracted.publishedAt || new Date().toISOString(),
        description: extracted.description,
        body: extracted.body,
        headings: extracted.headings,
        tags: extracted.tags,
        topics: keywords.slice(0, 5),
        keywords,
        contentHash: extracted.contentHash,
        discoveredAt: new Date().toISOString(),
        quality,
        format: extracted.detectedFormat,
      };

      // Cache for 4 hours
      pageCache.set(check.normalizedUrl, {
        url: check.normalizedUrl,
        document: doc,
        fetchedAt: now,
        expiresAt: now + 4 * 3600 * 1000,
      });

      crawlerLogs.push({
        sourceName,
        url: check.normalizedUrl,
        status: 'SUCCESS',
        durationMs: Date.now() - start,
        extractedChars: doc.body.length,
      });

      return doc;
    } catch (err: any) {
      crawlerLogs.push({
        sourceName,
        url: check.normalizedUrl,
        status: 'ERROR',
        durationMs: Date.now() - start,
        extractedChars: 0,
        error: err.message,
      });
      return null;
    }
  }

  /**
   * Internal parser for RSS 2.0 and Atom feeds.
   */
  private parseFeedXml(
    xml: string,
    feedUrl: string,
    sourceName: string,
    sourceId: string
  ): ContentDocument[] {
    const items: ContentDocument[] = [];
    const itemBlocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi)];

    for (const match of itemBlocks) {
      const block = match[2];

      // Extract Title
      const titleRaw = this.extractXmlTag(block, 'title');
      const title = decodeHtmlEntities(titleRaw.replace(/<[^>]+>/g, '').trim());

      // Extract Link
      const linkHrefMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
      const linkTagText = this.extractXmlTag(block, 'link');
      const rawUrl = (linkHrefMatch?.[1] || linkTagText || '').trim();

      const val = validateAndNormalizeUrl(rawUrl);
      if (!val.safe || !val.normalizedUrl || !title) continue;

      // Extract Description / Content
      const descRaw =
        this.extractXmlTag(block, 'content:encoded') ||
        this.extractXmlTag(block, 'description') ||
        this.extractXmlTag(block, 'summary') ||
        this.extractXmlTag(block, 'content');
      const cleanDesc = decodeHtmlEntities(
        descRaw.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      );

      // Published At
      const pubDate =
        this.extractXmlTag(block, 'pubDate') ||
        this.extractXmlTag(block, 'published') ||
        this.extractXmlTag(block, 'updated') ||
        this.extractXmlTag(block, 'dc:date');

      // Author
      const author =
        this.extractXmlTag(block, 'dc:creator') ||
        this.extractXmlTag(block, 'author') ||
        undefined;

      const keywords = extractKeywords(`${title} ${cleanDesc}`);
      const contentHash = crypto.createHash('sha256').update(`${title} ${cleanDesc.slice(0, 500)}`.toLowerCase()).digest('hex');

      items.push({
        id: `doc_${crypto.randomBytes(8).toString('hex')}`,
        sourceId,
        sourceName,
        sourceType: 'RSS_FEED',
        url: val.normalizedUrl,
        canonicalUrl: val.normalizedUrl,
        title,
        author: author ? decodeHtmlEntities(author.replace(/<[^>]+>/g, '').trim()) : undefined,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        description: cleanDesc.slice(0, 300),
        body: cleanDesc.slice(0, 3500),
        headings: [],
        tags: keywords.slice(0, 4),
        topics: keywords.slice(0, 5),
        keywords,
        contentHash,
        discoveredAt: new Date().toISOString(),
        quality: 'HIGH',
      });
    }

    return items;
  }

  private extractXmlTag(xmlBlock: string, tag: string): string {
    const match = xmlBlock.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (!match) return '';
    return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
  }

  static getLogs(): CrawlLogEntry[] {
    return crawlerLogs.slice(-50);
  }
}

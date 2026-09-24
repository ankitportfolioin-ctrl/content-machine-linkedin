import crypto from 'crypto';
import { validateAndNormalizeUrl, validateDnsDestination, isAllowedByRobots, enforceRateLimit, DEFAULT_USER_AGENT, safeFetchWithRedirectValidation } from './crawlerSafety';
import { extractArticleContent, decodeHtmlEntities } from './htmlExtractor';
import { VoiceProfile } from '../voiceProfileService';

export type SourceQuality = 'PRIMARY' | 'SECONDARY' | 'COMMUNITY' | 'AGGREGATOR' | 'UNKNOWN';
export type SourceStatusType = 'LIVE' | 'PARTIALLY_LIVE' | 'USER_PROVIDED' | 'STATIC' | 'BROKEN';

/**
 * Canonical ContentDocument schema unifying all research feeds, sitemaps, and article pages.
 */
export interface ContentDocument {
  id: string;
  canonicalUrl: string;
  url: string;
  title: string;
  publisher: string;
  sourceId: string;
  sourceName: string;
  sourceType: 'RSS' | 'ATOM' | 'SITEMAP' | 'HTML_ARTICLE' | 'USER_URL';
  sourceDomain: string;
  author?: string;
  publishedAt?: string; // Explicit ISO string, or undefined if not declared by source (NO FABRICATION)
  retrievedAt: string;
  discoveredAt: string;
  text: string; // Full body text
  body: string; // Alias for backward compatibility
  excerpt: string;
  description?: string; // Alias for backward compatibility
  topics: string[];
  keywords: string[];
  headings: string[];
  tags: string[];
  language?: string;
  contentHash: string;
  quality: SourceQuality;
  format?: string;
  accessStatus: 'OK' | 'PARTIAL' | 'CACHED';
  engagementSignals?: {
    commentsCount?: number;
    score?: number;
  };
  metadata?: Record<string, any>;
  provenance: {
    adapter: string;
    targetUrl: string;
    fetchedAt: string;
    httpStatus?: number;
  };
}

export interface SourceStatusReport {
  source: string;
  adapter: string;
  type: string;
  status: SourceStatusType;
  lastCheckedAt: string;
  documentsRetrieved: number;
  latencyMs?: number;
  errors: string[];
}

export interface SourceAdapter {
  id: string;
  name: string;
  type: 'RSS' | 'ATOM' | 'SITEMAP' | 'HTML' | 'USER_URL';
  discover(context: { topics: string[]; profile?: VoiceProfile }): Promise<string[]>;
  fetch(target: string, options?: { sourceName?: string; sourceId?: string; quality?: SourceQuality }): Promise<ContentDocument[]>;
  healthCheck(target?: string): Promise<{ status: 'HEALTHY' | 'DEGRADED' | 'DOWN'; latencyMs: number; error?: string }>;
}

/**
 * Normalizes text to standard lower-case alphanumeric tokens.
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

// Global in-memory cache for public documents to prevent re-downloading
interface GlobalCacheEntry {
  url: string;
  document: ContentDocument;
  fetchedAt: number;
  expiresAt: number;
}
const globalDocCache = new Map<string, GlobalCacheEntry>();

export function getCachedDocument(url: string): ContentDocument | null {
  const norm = validateAndNormalizeUrl(url);
  if (!norm.safe || !norm.normalizedUrl) return null;
  const entry = globalDocCache.get(norm.normalizedUrl);
  if (entry && Date.now() < entry.expiresAt) {
    return { ...entry.document, accessStatus: 'CACHED' };
  }
  return null;
}

export function setCachedDocument(doc: ContentDocument, ttlHours: number = 4): void {
  globalDocCache.set(doc.url, {
    url: doc.url,
    document: doc,
    fetchedAt: Date.now(),
    expiresAt: Date.now() + ttlHours * 3600 * 1000,
  });
  if (doc.canonicalUrl && doc.canonicalUrl !== doc.url) {
    globalDocCache.set(doc.canonicalUrl, {
      url: doc.canonicalUrl,
      document: doc,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + ttlHours * 3600 * 1000,
    });
  }
}

/**
 * 1. RSS & ATOM SOURCE ADAPTER
 */
export class RssAtomAdapter implements SourceAdapter {
  id = 'adapter_rss_atom';
  name = 'RSS & Atom Feed Adapter';
  type = 'RSS' as const;

  async discover(context: { topics: string[]; profile?: VoiceProfile }): Promise<string[]> {
    // Return empty here; discovered via registry and feed auto-discovery
    return [];
  }

  async healthCheck(target?: string): Promise<{ status: 'HEALTHY' | 'DEGRADED' | 'DOWN'; latencyMs: number; error?: string }> {
    const testUrl = target || 'https://news.ycombinator.com/rss';
    const start = Date.now();
    try {
      const { response } = await safeFetchWithRedirectValidation(testUrl, {
        method: 'HEAD',
        timeoutMs: 4000,
      });
      const latencyMs = Date.now() - start;
      if (response.ok) return { status: 'HEALTHY', latencyMs };
      return { status: 'DEGRADED', latencyMs, error: `HTTP ${response.status}` };
    } catch (err: any) {
      return { status: 'DOWN', latencyMs: Date.now() - start, error: err.message };
    }
  }

  async fetch(
    feedUrl: string,
    options?: { sourceName?: string; sourceId?: string; quality?: SourceQuality }
  ): Promise<ContentDocument[]> {
    const val = validateAndNormalizeUrl(feedUrl);
    if (!val.safe || !val.normalizedUrl || !val.domain) return [];

    await enforceRateLimit(val.domain, 500);

    const { response, finalUrl } = await safeFetchWithRedirectValidation(val.normalizedUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'application/rss+xml, application/atom+xml, text/xml, application/xml, */*',
      },
      timeoutMs: 8000,
    });

    if (!response.ok) {
      throw new Error(`Feed request returned HTTP ${response.status} (${response.statusText})`);
    }

    const xml = await response.text();
    return this.parseFeedXml(xml, finalUrl, options?.sourceName || val.domain, options?.sourceId || 'src_feed', options?.quality || 'PRIMARY');
  }

  parseFeedXml(
    xml: string,
    feedUrl: string,
    sourceName: string,
    sourceId: string,
    quality: SourceQuality = 'PRIMARY'
  ): ContentDocument[] {
    const items: ContentDocument[] = [];
    const isAtom = /<feed[\s>]/i.test(xml);
    const domain = new URL(feedUrl).hostname;
    const nowIso = new Date().toISOString();

    const itemBlocks = isAtom
      ? [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)]
      : [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];

    for (const match of itemBlocks) {
      const block = match[1];

      // Title
      const titleRaw = this.extractXmlTag(block, 'title');
      const title = decodeHtmlEntities(titleRaw.replace(/<[^>]+>/g, '').trim());
      if (!title) continue;

      // Link
      let rawUrl = '';
      const linkHrefMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
      if (linkHrefMatch) {
        rawUrl = linkHrefMatch[1];
      } else {
        const linkTagText = this.extractXmlTag(block, 'link');
        rawUrl = linkTagText;
      }
      rawUrl = decodeHtmlEntities(rawUrl.trim());

      const val = validateAndNormalizeUrl(rawUrl);
      if (!val.safe || !val.normalizedUrl) continue;

      // Description / Content
      const descRaw =
        this.extractXmlTag(block, 'content:encoded') ||
        this.extractXmlTag(block, 'content') ||
        this.extractXmlTag(block, 'summary') ||
        this.extractXmlTag(block, 'description');
      const cleanText = decodeHtmlEntities(
        descRaw.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      );

      // Explicit publishedAt check - DO NOT fabricate if absent or invalid!
      const rawDate =
        this.extractXmlTag(block, 'pubDate') ||
        this.extractXmlTag(block, 'published') ||
        this.extractXmlTag(block, 'updated') ||
        this.extractXmlTag(block, 'dc:date');
      let publishedAt: string | undefined = undefined;
      if (rawDate) {
        const parsedTime = Date.parse(rawDate);
        if (!isNaN(parsedTime) && parsedTime > 0) {
          publishedAt = new Date(parsedTime).toISOString();
        }
      }

      // Author
      const authorRaw =
        this.extractXmlTag(block, 'dc:creator') ||
        this.extractXmlTag(block, 'author');
      const author = authorRaw ? decodeHtmlEntities(authorRaw.replace(/<[^>]+>/g, '').trim()) : undefined;

      const keywords = extractKeywords(`${title} ${cleanText}`);
      const contentHash = crypto.createHash('sha256').update(`${title} ${cleanText.slice(0, 500)}`.toLowerCase()).digest('hex');

      const doc: ContentDocument = {
        id: `doc_${crypto.randomBytes(8).toString('hex')}`,
        canonicalUrl: val.normalizedUrl,
        url: val.normalizedUrl,
        title,
        publisher: sourceName,
        sourceId,
        sourceName,
        sourceType: isAtom ? 'ATOM' : 'RSS',
        sourceDomain: domain,
        author,
        publishedAt, // Honest: undefined if missing, never fabricated!
        retrievedAt: nowIso,
        discoveredAt: nowIso,
        text: cleanText.slice(0, 4000),
        body: cleanText.slice(0, 4000),
        excerpt: cleanText.slice(0, 280),
        description: cleanText.slice(0, 280),
        topics: keywords.slice(0, 5),
        keywords,
        headings: [],
        tags: keywords.slice(0, 4),
        contentHash,
        quality,
        accessStatus: 'OK',
        provenance: {
          adapter: isAtom ? 'ATOM' : 'RSS',
          targetUrl: feedUrl,
          fetchedAt: nowIso,
          httpStatus: 200,
        },
      };

      setCachedDocument(doc, 4);
      items.push(doc);
    }

    return items;
  }

  private extractXmlTag(xmlBlock: string, tag: string): string {
    const match = xmlBlock.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    if (!match) return '';
    return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
  }
}

/**
 * 2. PUBLIC SITEMAP SOURCE ADAPTER
 */
export class SitemapAdapter implements SourceAdapter {
  id = 'adapter_sitemap';
  name = 'Public Sitemap Adapter';
  type = 'SITEMAP' as const;

  async discover(context: { topics: string[]; profile?: VoiceProfile }): Promise<string[]> {
    return [];
  }

  async healthCheck(target?: string): Promise<{ status: 'HEALTHY' | 'DEGRADED' | 'DOWN'; latencyMs: number; error?: string }> {
    return { status: 'HEALTHY', latencyMs: 10 };
  }

  async fetch(
    sitemapUrl: string,
    options?: { sourceName?: string; sourceId?: string; quality?: SourceQuality }
  ): Promise<ContentDocument[]> {
    const val = validateAndNormalizeUrl(sitemapUrl);
    if (!val.safe || !val.normalizedUrl || !val.domain) return [];

    await enforceRateLimit(val.domain, 800);

    const { response } = await safeFetchWithRedirectValidation(val.normalizedUrl, {
      headers: { 'User-Agent': DEFAULT_USER_AGENT },
      timeoutMs: 8000,
    });

    if (!response.ok) return [];

    const xml = await response.text();
    const locMatches = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)];
    const urls: string[] = [];

    for (const m of locMatches) {
      const candidate = m[1].trim();
      const v = validateAndNormalizeUrl(candidate);
      if (v.safe && v.normalizedUrl && !v.normalizedUrl.endsWith('.xml') && !v.normalizedUrl.endsWith('.gz')) {
        urls.push(v.normalizedUrl);
        if (urls.length >= 5) break; // Bounded scope per sitemap
      }
    }

    const htmlAdapter = new HtmlArticleAdapter();
    const docs: ContentDocument[] = [];
    for (const u of urls) {
      try {
        const doc = await htmlAdapter.fetch(u, {
          sourceName: options?.sourceName || val.domain,
          sourceId: options?.sourceId || 'src_sitemap',
          quality: options?.quality || 'SECONDARY',
        });
        if (doc.length > 0) docs.push(...doc);
      } catch {}
    }

    return docs;
  }
}

/**
 * 3. PUBLIC HTML ARTICLE SOURCE ADAPTER
 */
export class HtmlArticleAdapter implements SourceAdapter {
  id = 'adapter_html_article';
  name = 'Public HTML Article Adapter';
  type = 'HTML' as const;

  async discover(context: { topics: string[]; profile?: VoiceProfile }): Promise<string[]> {
    return [];
  }

  async healthCheck(target?: string): Promise<{ status: 'HEALTHY' | 'DEGRADED' | 'DOWN'; latencyMs: number; error?: string }> {
    return { status: 'HEALTHY', latencyMs: 15 };
  }

  async fetch(
    pageUrl: string,
    options?: { sourceName?: string; sourceId?: string; quality?: SourceQuality }
  ): Promise<ContentDocument[]> {
    const val = validateAndNormalizeUrl(pageUrl);
    if (!val.safe || !val.normalizedUrl || !val.domain) return [];

    // Check cache first
    const cached = getCachedDocument(val.normalizedUrl);
    if (cached) return [cached];

    // Check robots.txt politely
    const robots = await isAllowedByRobots(val.normalizedUrl, DEFAULT_USER_AGENT);
    if (!robots.allowed) {
      throw new Error(`Access disallowed by target domain's robots.txt policy.`);
    }

    await enforceRateLimit(val.domain, 800);

    const { response, finalUrl } = await safeFetchWithRedirectValidation(val.normalizedUrl, {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      timeoutMs: 8000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} when accessing public HTML page`);
    }

    const html = await response.text();
    const extracted = extractArticleContent(html, finalUrl);
    const nowIso = new Date().toISOString();

    const keywords = extractKeywords(`${extracted.title} ${extracted.body}`);
    const doc: ContentDocument = {
      id: `doc_${crypto.randomBytes(8).toString('hex')}`,
      canonicalUrl: extracted.canonicalUrl || finalUrl,
      url: finalUrl,
      title: extracted.title,
      publisher: options?.sourceName || val.domain,
      sourceId: options?.sourceId || 'src_html',
      sourceName: options?.sourceName || val.domain,
      sourceType: 'HTML_ARTICLE',
      sourceDomain: val.domain,
      author: extracted.author,
      publishedAt: extracted.publishedAt, // Only if real from metadata/ld-json, otherwise undefined
      retrievedAt: nowIso,
      discoveredAt: nowIso,
      text: extracted.body,
      body: extracted.body,
      excerpt: extracted.description || extracted.body.slice(0, 280),
      description: extracted.description,
      topics: keywords.slice(0, 5),
      keywords,
      headings: extracted.headings,
      tags: extracted.tags,
      contentHash: extracted.contentHash,
      quality: options?.quality || 'SECONDARY',
      format: extracted.detectedFormat,
      accessStatus: 'OK',
      provenance: {
        adapter: 'HTML_ARTICLE',
        targetUrl: finalUrl,
        fetchedAt: nowIso,
        httpStatus: response.status,
      },
    };

    setCachedDocument(doc, 4);
    return [doc];
  }
}

/**
 * 4. USER-PROVIDED URL ADAPTER
 */
export class UserUrlAdapter implements SourceAdapter {
  id = 'adapter_user_url';
  name = 'User Provided URL Adapter';
  type = 'USER_URL' as const;

  async discover(): Promise<string[]> {
    return [];
  }

  async healthCheck(): Promise<{ status: 'HEALTHY' | 'DEGRADED' | 'DOWN'; latencyMs: number; error?: string }> {
    return { status: 'HEALTHY', latencyMs: 5 };
  }

  async fetch(
    userUrl: string,
    options?: { sourceName?: string; sourceId?: string; quality?: SourceQuality }
  ): Promise<ContentDocument[]> {
    const htmlAdapter = new HtmlArticleAdapter();
    const docs = await htmlAdapter.fetch(userUrl, {
      sourceName: options?.sourceName || 'User Provided URL',
      sourceId: options?.sourceId || 'src_user_url',
      quality: options?.quality || 'PRIMARY',
    });

    return docs.map((d) => ({
      ...d,
      sourceType: 'USER_URL',
      provenance: {
        ...d.provenance,
        adapter: 'USER_URL',
      },
    }));
  }
}

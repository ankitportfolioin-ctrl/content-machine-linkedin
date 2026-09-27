import { JSDOM } from 'jsdom';
import { parseStringPromise } from 'xml2js';

export interface ExtractedContent {
  title: string | null;
  description: string | null;
  author: string | null;
  publisher: string | null;
  publishedAt: Date | null;
  publishedAtConfidence: 'VERIFIED' | 'INFERRED' | 'UNKNOWN';
  mainContent: string;
  headings: string[];
  paragraphs: string[];
  wordCount: number;
  language: string | null;
}

export interface FeedItem {
  url: string;
  title: string | null;
  description: string | null;
  publishedAt: Date | null;
  author: string | null;
}

export interface SitemapUrls {
  urls: string[];
}

function cleanHtmlContent(html: string): string {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const selectorsToRemove = [
    'script',
    'style',
    'noscript',
    'iframe',
    'svg',
    'canvas',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '.navigation',
    '.nav',
    '.sidebar',
    '.footer',
    '.header',
    '.menu',
    '.ads',
    '.advertisement',
    '.social-share',
    '.related-posts',
    '.comments',
    '#comments',
    '.cookie-banner',
    '.newsletter-signup',
    '.popup',
    '.modal',
  ];

  for (const selector of selectorsToRemove) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => el.remove());
  }

  const mainSelectors = [
    'article',
    '[role="main"]',
    '.main-content',
    '.content',
    '.post-content',
    '.entry-content',
    '.article-body',
    '.post-body',
    'main',
  ];

  let mainElement: Element | null = null;
  for (const selector of mainSelectors) {
    mainElement = document.querySelector(selector);
    if (mainElement) break;
  }

  const contentElement = mainElement || document.body;

  const text = contentElement.textContent || '';
  return text.replace(/\s+/g, ' ').trim();
}

function extractHeadings(document: Document): string[] {
  const headings: string[] = [];
  const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  headingElements.forEach(h => {
    const text = h.textContent?.trim();
    if (text && text.length > 0) {
      headings.push(text);
    }
  });
  return headings;
}

function extractParagraphs(document: Document): string[] {
  const paragraphs: string[] = [];
  const pElements = document.querySelectorAll('p');
  pElements.forEach(p => {
    const text = p.textContent?.trim();
    if (text && text.length > 20) {
      paragraphs.push(text);
    }
  });
  return paragraphs;
}

function extractMetaData(document: Document): Partial<ExtractedContent> {
  const result: Partial<ExtractedContent> = {
    title: null,
    description: null,
    author: null,
    publisher: null,
    publishedAt: null,
    publishedAtConfidence: 'UNKNOWN',
    language: null,
  };

  const titleEl = document.querySelector('title');
  if (titleEl) {
    result.title = titleEl.textContent?.trim() || null;
  }

  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle && !result.title) {
    result.title = ogTitle.getAttribute('content');
  }

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription) {
    result.description = metaDescription.getAttribute('content');
  }

  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (ogDescription && !result.description) {
    result.description = ogDescription.getAttribute('content');
  }

  const authorMeta = document.querySelector('meta[name="author"]');
  if (authorMeta) {
    result.author = authorMeta.getAttribute('content');
  }

  const ogAuthor = document.querySelector('meta[property="article:author"]');
  if (ogAuthor && !result.author) {
    result.author = ogAuthor.getAttribute('content');
  }

  const publisherMeta = document.querySelector('meta[property="og:site_name"]');
  if (publisherMeta) {
    result.publisher = publisherMeta.getAttribute('content');
  }

  const publishedTime = document.querySelector('meta[property="article:published_time"]');
  if (publishedTime) {
    const date = new Date(publishedTime.getAttribute('content') || '');
    if (!isNaN(date.getTime())) {
      result.publishedAt = date;
      result.publishedAtConfidence = 'VERIFIED';
    }
  }

  const publishedTimeMeta = document.querySelector('meta[name="date"]');
  if (publishedTimeMeta && !result.publishedAt) {
    const date = new Date(publishedTimeMeta.getAttribute('content') || '');
    if (!isNaN(date.getTime())) {
      result.publishedAt = date;
      result.publishedAtConfidence = 'INFERRED';
    }
  }

  const htmlLang = document.documentElement.getAttribute('lang');
  const langValue: string | null = htmlLang as string | null;
  if (langValue !== null) {
    const parts = langValue.split('-');
    const firstPart = parts[0];
    result.language = firstPart !== undefined ? firstPart.toLowerCase() : '';
  } else {
    result.language = null;
  }

  return result;
}

export function extractHtmlContent(html: string, baseUrl?: string): ExtractedContent {
  const dom = new JSDOM(html, { url: baseUrl });
  const document = dom.window.document;

  const metadata = extractMetaData(document);
  const cleanText = cleanHtmlContent(html);
  const headings = extractHeadings(document);
  const paragraphs = extractParagraphs(document);

  const wordCount = cleanText.split(/\s+/).filter(w => w.length > 0).length;

  return {
    title: metadata.title ?? null,
    description: metadata.description ?? null,
    author: metadata.author ?? null,
    publisher: metadata.publisher ?? null,
    publishedAt: metadata.publishedAt ?? null,
    publishedAtConfidence: metadata.publishedAtConfidence ?? 'UNKNOWN',
    mainContent: cleanText,
    headings,
    paragraphs,
    wordCount,
    language: metadata.language ?? null,
  };
}

export async function extractRssContent(xml: string): Promise<{ feed: { title: string | null; description: string | null; link: string | null }; items: FeedItem[] }> {
  const cleanXml = xml
    .replace(/^\s*<\?xml[^?]*\?>\s*/, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/>\s+</g, '><');
  const result = await parseStringPromise(cleanXml, {
    explicitArray: false,
    mergeAttrs: true,
    trim: true,
  });

  const feedTitle = result.rss?.channel?.title || null;
  const feedDescription = result.rss?.channel?.description || null;
  const feedLink = result.rss?.channel?.link || null;

  const items: FeedItem[] = [];
  const rssItems = result.rss?.channel?.item || [];
  const itemsArray = Array.isArray(rssItems) ? rssItems : [rssItems];

  for (const item of itemsArray) {
    if (!item) continue;

    const link = item.link || item.guid || item['atom:link']?.[0]?.href || null;
    const title = item.title || null;
    const description = item.description || item['content:encoded'] || null;
    const pubDate = item.pubDate ? new Date(item.pubDate) : null;
    const author = item.author || item['dc:creator'] || null;

    items.push({
      url: link,
      title,
      description,
      publishedAt: pubDate && !isNaN(pubDate.getTime()) ? pubDate : null,
      author,
    });
  }

  return {
    feed: { title: feedTitle, description: feedDescription, link: feedLink },
    items,
  };
}

export async function extractAtomContent(xml: string): Promise<{ feed: { title: string | null; subtitle: string | null; link: string | null }; items: FeedItem[] }> {
  const cleanXml = xml
    .replace(/^\s*<\?xml[^?]*\?>\s*/, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/>\s+</g, '><');
  const result = await parseStringPromise(cleanXml, {
    explicitArray: false,
    mergeAttrs: true,
    trim: true,
  });

  const feed = result.feed || result['atom:feed'];
  const feedTitle = feed?.title || null;
  const feedSubtitle = feed?.subtitle || null;
  const feedLink = feed?.link?.[0]?.href || feed?.link?.href || null;

  const items: FeedItem[] = [];
  const entries = feed?.entry || [];
  const entriesArray = Array.isArray(entries) ? entries : [entries];

  for (const entry of entriesArray) {
    if (!entry) continue;

    const link = entry.link?.[0]?.href || entry.link?.href || entry.id || null;
    const title = entry.title || null;
    const description = entry.summary || entry.content || null;
    const pubDate = entry.published ? new Date(entry.published) : (entry.updated ? new Date(entry.updated) : null);
    const author = entry.author?.name || entry.author?.[0]?.name || null;

    items.push({
      url: link,
      title,
      description,
      publishedAt: pubDate && !isNaN(pubDate.getTime()) ? pubDate : null,
      author,
    });
  }

  return {
    feed: { title: feedTitle, subtitle: feedSubtitle, link: feedLink },
    items,
  };
}

export async function extractSitemapContent(xml: string): Promise<SitemapUrls> {
  const cleanXml = xml
    .replace(/^\s*<\?xml[^?]*\?>\s*/, '')
    .replace(/^\s+|\s+$/g, '')
    .replace(/>\s+</g, '><');
  const result = await parseStringPromise(cleanXml, {
    explicitArray: false,
    mergeAttrs: true,
    trim: true,
  });

  const urls: string[] = [];

  const urlset = result.urlset || result['sitemapindex'];
  if (!urlset) return { urls: [] };

  const entries = urlset.url || urlset.sitemap || [];
  const entriesArray = Array.isArray(entries) ? entries : [entries];

  for (const entry of entriesArray) {
    if (!entry) continue;
    const loc = entry.loc || entry.url;
    if (loc) {
      urls.push(loc);
    }
  }

  return { urls };
}

export function detectContentType(contentType: string, content: string): 'html' | 'rss' | 'atom' | 'sitemap' | 'text' | 'unknown' {
  const lowerContentType = contentType.toLowerCase();

  if (lowerContentType.includes('text/html')) return 'html';
  if (lowerContentType.includes('application/rss+xml') || lowerContentType.includes('application/rss')) return 'rss';
  if (lowerContentType.includes('application/atom+xml') || lowerContentType.includes('application/atom')) return 'atom';
  if (lowerContentType.includes('application/xml') || lowerContentType.includes('text/xml')) {
    if (content.includes('<rss') || content.includes('<rdf:RDF')) return 'rss';
    if (content.includes('<feed') && content.includes('xmlns="http://www.w3.org/2005/Atom"')) return 'atom';
    if (content.includes('<urlset') || content.includes('<sitemapindex')) return 'sitemap';
    if (content.trim().startsWith('<!DOCTYPE html') || content.trim().startsWith('<html')) return 'html';
    return 'text';
  }

  if (content.includes('<rss') || content.includes('<rdf:RDF')) return 'rss';
  if (content.includes('<feed') && content.includes('xmlns="http://www.w3.org/2005/Atom"')) return 'atom';
  if (content.includes('<urlset') || content.includes('<sitemapindex')) return 'sitemap';
  if (content.trim().startsWith('<!DOCTYPE html') || content.trim().startsWith('<html')) return 'html';

  return 'unknown';
}
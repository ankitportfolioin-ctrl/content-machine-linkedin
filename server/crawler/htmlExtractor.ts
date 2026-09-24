import crypto from 'crypto';

export interface ExtractedArticle {
  title: string;
  subtitle?: string;
  canonicalUrl?: string;
  author?: string;
  publishedAt?: string;
  updatedAt?: string;
  description?: string;
  headings: string[];
  paragraphs: string[];
  listItems: string[];
  body: string;
  tags: string[];
  contentHash: string;
  detectedFormat: string;
  metadata: {
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
    jsonLdType?: string;
    readingTimeMinutes?: number;
  };
}

/**
 * Decodes standard HTML entities and smart typography symbols.
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '...')
    .replace(/&bull;/g, '•')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&trade;/g, '™')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&#(\d+);/g, (_, num) => {
      try {
        return String.fromCodePoint(Number(num));
      } catch {
        return '';
      }
    });
}

/**
 * Validates whether an extracted string is a clean, semantically complete proposition
 * and rejects polluted fragments, citation brackets, and UI chrome.
 */
export function validateExtractedClaim(claim: string): boolean {
  if (!claim || typeof claim !== 'string') return false;
  const trimmed = claim.trim();

  // Length limits
  if (trimmed.length < 15 || trimmed.length > 350) return false;

  // Reject placeholder tokens & citations like [7], [ 7 ], [...], [X], [?]
  if (/\[\s*(\d+|\.\.\.|x|\?|citation needed)?\s*\]/i.test(trimmed)) return false;

  // Reject unmatched brackets or parens
  const openBrackets = (trimmed.match(/\[/g) || []).length;
  const closeBrackets = (trimmed.match(/\]/g) || []).length;
  if (openBrackets !== closeBrackets) return false;

  const openParens = (trimmed.match(/\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;
  if (openParens !== closeParens) return false;

  // Reject dangling/hanging prepositions and conjunctions
  if (/(?:^|\s)(?:are|is|and|or|in|with|to|from|for|on|at|by|of|the|a|an)\s*$/i.test(trimmed)) {
    return false;
  }
  if (/^(?:are|is|and|or|in|with|to|from|for|on|at|by|of)\s+/i.test(trimmed)) {
    return false;
  }

  // Reject navigation phrases, cookies, ads, and UI labels
  if (/^(?:click here|read more|read next|also read|related articles|share this|sign up|subscribe|table of contents|previous|next|home\s*>|breadcrumb)/i.test(trimmed)) {
    return false;
  }

  // Must have at least 4 substantive words
  const words = trimmed.split(/\s+/).filter((w) => w.length > 1);
  if (words.length < 4) return false;

  // Must contain at least one vowel to avoid symbol/code debris
  if (!/[aeiouy]/i.test(trimmed)) return false;

  return true;
}

/**
 * Strips script, style, SVG, nav, footer, sidebar, ads, cookies, related widgets,
 * breadcrumbs, pagination, and citation bracket noise from HTML.
 */
export function cleanHtmlNoise(html: string): string {
  let clean = html;
  // 1. Remove scripts, styles, comments, svgs, noscript, iframes, forms, buttons
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  clean = clean.replace(/<!--[\s\S]*?-->/g, '');
  clean = clean.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
  clean = clean.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
  clean = clean.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
  clean = clean.replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '');
  clean = clean.replace(/<button\b[^<]*(?:(?!<\/button>)<[^<]*)*<\/button>/gi, '');

  // 2. Remove common non-content structural elements (headers, navs, footers, asides)
  clean = clean.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
  clean = clean.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
  clean = clean.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
  clean = clean.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

  // 3. Remove cookie consent, banners, newsletter signup, modals
  clean = clean.replace(
    /<(?:div|section|aside)[^>]*(?:class|id)=["'][^"']*(?:cookie|gdpr|consent|banner|newsletter|subscribe|signup|lead-magnet|modal|popup)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|aside)>/gi,
    ''
  );

  // 4. Remove related content, recommendation widgets, popular posts, sidebars
  clean = clean.replace(
    /<(?:div|section|aside|ul|ol)[^>]*(?:class|id)=["'][^"']*(?:related|recommend|also-read|popular-posts|trending-posts|recommended|more-stories|sidebar|widget|promo|read-next|suggested)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|aside|ul|ol)>/gi,
    ''
  );

  // 5. Remove breadcrumbs and navigation bars
  clean = clean.replace(
    /<(?:div|nav|ol|ul|p)[^>]*(?:class|id|aria-label)=["'][^"']*(?:breadcrumb|crumbs|breadcrumbs|site-nav|menu|pagination|pager)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|nav|ol|ul|p)>/gi,
    ''
  );

  // 6. Remove social share bars and comments
  clean = clean.replace(
    /<(?:div|section|ul)[^>]*(?:class|id)=["'][^"']*(?:share|social-share|sharing|social-links|share-buttons|comments|comment-section|disqus)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section|ul)>/gi,
    ''
  );

  // 7. Strip citation markers like <sup>[7]</sup>, [1], [ 7 ], [7], &#91;7&#93;, etc.
  clean = clean.replace(/<sup[^>]*>\s*\[?\s*\d+\s*\]?\s*<\/sup>/gi, '');
  clean = clean.replace(/\[\s*\d+\s*\]/g, '');
  clean = clean.replace(/&#91;\s*\d+\s*&#93;/g, '');
  clean = clean.replace(/\[\s*(?:\.\.\.|citation needed|source|ref|x|\?)\s*\]/gi, '');

  return clean;
}

/**
 * Extracts attribute value from an HTML tag string.
 */
function getAttr(tag: string, attr: string): string | undefined {
  const match = tag.match(new RegExp(`${attr}=["']([^"']+)["']`, 'i'));
  return match ? decodeHtmlEntities(match[1]) : undefined;
}

/**
 * Detects the dominant educational/editorial format of the article.
 */
function detectArticleFormat(title: string, body: string, headings: string[]): string {
  const combined = `${title} ${headings.join(' ')} ${body.slice(0, 500)}`.toLowerCase();

  if (/\b(?:how to|step-by-step|guide|tutorial|walkthrough)\b/i.test(combined)) {
    return 'how-to';
  }
  if (/\b(?:mistake|why .* fail|trap|antipattern|myth)\b/i.test(combined)) {
    return 'mistake-breakdown';
  }
  if (/\b(?:framework|checklist|playbook|architecture|mental model)\b/i.test(combined)) {
    return 'framework';
  }
  if (/\b(?:contrarian|unpopular opinion|why .* wrong|stop doing)\b/i.test(combined)) {
    return 'contrarian-observation';
  }
  if (/\b(?:announced|launches|releases|releases version|new update)\b/i.test(combined)) {
    return 'news-analysis';
  }
  if (/\b(?:review|vs|comparison|alternatives|benchmark)\b/i.test(combined)) {
    return 'tool-comparison';
  }
  if (/\b(?:\d+\s+(?:ways|lessons|tools|reasons|rules|skills))\b/i.test(title)) {
    return 'curated-list';
  }

  return 'educational';
}

/**
 * Robustly extracts main article body, metadata, headings, and list items from public HTML.
 */
export function extractArticleContent(html: string, fallbackUrl: string): ExtractedArticle {
  const metaOgTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1];
  const metaTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];

  const titleRaw = metaOgTitle || h1Match || metaTitle || 'Untitled Publication';
  let title = decodeHtmlEntities(titleRaw.replace(/<[^>]+>/g, '').trim());
  // Strip trailing publisher suffix e.g. " | TechCrunch", " - Coursera"
  title = title.replace(/\s+[-|–—:]\s+[A-Za-z0-9\s.]+$/g, '').trim();

  // Canonical URL
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
  const canonicalUrl = canonicalMatch || fallbackUrl;

  // Description / OG Description
  const metaDesc = html.match(/<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]*content=["']([^"']+)["'][^>]*>/i)?.[1];
  const description = metaDesc ? decodeHtmlEntities(metaDesc.trim()) : undefined;

  // Author
  const authorMeta = html.match(/<meta[^>]+name=["']author["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1];
  const authorRel = html.match(/<(?:a|span)[^>]+rel=["']author["'][^>]*>([\s\S]*?)<\/(?:a|span)>/i)?.[1];
  const author = authorMeta || (authorRel ? authorRel.replace(/<[^>]+>/g, '').trim() : undefined);

  // Published Date
  const pubDateMatch =
    html.match(/<meta[^>]+property=["']article:published_time["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] ||
    html.match(/<meta[^>]+name=["'](?:publishdate|date)["'][^>]*content=["']([^"']+)["'][^>]*>/i)?.[1] ||
    html.match(/<time[^>]+datetime=["']([^"']+)["'][^>]*>/i)?.[1];
  let publishedAt: string | undefined = undefined;
  if (pubDateMatch) {
    const parsedTime = Date.parse(pubDateMatch.trim());
    if (!isNaN(parsedTime) && parsedTime > 0) {
      publishedAt = new Date(parsedTime).toISOString();
    }
  }

  // JSON-LD Extraction
  let jsonLdType: string | undefined;
  const jsonLdMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of jsonLdMatches) {
    try {
      const parsed = JSON.parse(m[1]);
      const obj = Array.isArray(parsed) ? parsed[0] : parsed;
      if (obj && obj['@type']) {
        jsonLdType = String(obj['@type']);
      }
    } catch {
      // Ignore JSON parse errors in malformed inline scripts
    }
  }

  // Clean noise for body extraction
  const cleaned = cleanHtmlNoise(html);

  // Helper to test if a string is essentially the title or a title fragment
  const titleLower = title.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  const isTitleDuplicate = (candidate: string): boolean => {
    const candLower = candidate.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    if (candLower === titleLower) return true;
    if (candLower.length > 15 && titleLower.includes(candLower)) return true;
    if (titleLower.length > 15 && candLower.includes(titleLower)) return true;
    return false;
  };

  // Prioritize primary content container: <article>, <main>, or .entry-content / .post-content / .article-body
  const mainContainerMatch =
    cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ||
    cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ||
    cleaned.match(/<div[^>]*class=["'][^"']*(?:entry-content|post-content|article-body|story-body|main-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
    cleaned;

  // Extract structured elements sequentially
  const headings: string[] = [];
  const paragraphs: string[] = [];
  const listItems: string[] = [];
  const bodySections: string[] = [];

  // Match headings, paragraphs, and list items sequentially
  const tagRegex = /<(h[2-4]|p|li|ol|ul)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(mainContainerMatch)) !== null) {
    const tagName = match[1].toLowerCase();
    const innerHtml = match[2];
    let text = decodeHtmlEntities(innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

    // Clean remaining bracket noise like [7] or [ 7 ]
    text = text.replace(/\[\s*\d+\s*\]/g, '').replace(/\[\s*(?:\.\.\.|x|\?)\s*\]/gi, '').trim();

    if (!text || text.length < 3) continue;

    // Filter out UI boilerplate, navigation, ads, cookies
    if (/^(share this|sign up|follow us|cookie policy|read next|subscribe now|click here|all rights reserved|related articles|also read|recommended stories|breadcrumb)/i.test(text)) {
      continue;
    }

    // Filter out strings with dangling prepositions or malformed brackets
    if (/(?:^|\s)(?:are|is|and|or|in|with|to|from|for|on|at|by|of)\s*$/i.test(text) && text.length < 50) {
      continue;
    }

    if (tagName.startsWith('h')) {
      if (text.length >= 4 && text.length <= 140 && !headings.includes(text) && !isTitleDuplicate(text)) {
        headings.push(text);
        bodySections.push(`## ${text}`);
      }
    } else if (tagName === 'li') {
      // Reject malformed list items, fragments, and duplicate titles
      if (
        text.length >= 4 &&
        text.length <= 300 &&
        !isTitleDuplicate(text) &&
        !listItems.includes(text) &&
        !/^(?:paying,\s*)?in-demand skills in [A-Za-z\s]+ are/i.test(text) &&
        !/^\d+[\.\)]?\s*$/i.test(text)
      ) {
        listItems.push(text);
        bodySections.push(`- ${text}`);
      }
    } else if (tagName === 'p') {
      if (text.length >= 20 && !isTitleDuplicate(text)) {
        paragraphs.push(text);
        bodySections.push(text);
      }
    }
  }

  // If bodySections is empty (e.g., flat text or non-standard tags), fallback to paragraphs
  let body = bodySections.join('\n\n').trim();
  if (!body) {
    const rawParagraphMatches = [...mainContainerMatch.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
    for (const p of rawParagraphMatches) {
      const cleanP = decodeHtmlEntities(p[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
      if (cleanP.length > 25 && !/^(share this|sign up|follow us|cookie policy|read next)/i.test(cleanP)) {
        paragraphs.push(cleanP);
      }
    }
    body = paragraphs.join('\n\n') || description || title;
  }

  // Deduplicate consecutive identical lines
  body = body.split('\n\n').filter((line, i, arr) => i === 0 || line !== arr[i - 1]).join('\n\n');

  // Tags extraction
  const tags: string[] = [];
  const tagMatches = [...html.matchAll(/<meta[^>]+property=["']article:tag["'][^>]*content=["']([^"']+)["'][^>]*>/gi)];
  for (const tm of tagMatches) {
    if (tm[1]) tags.push(decodeHtmlEntities(tm[1].trim()));
  }

  // Content Hash (SHA-256 of normalized body + title)
  const normalizedForHash = `${title} ${body.slice(0, 1500)}`.toLowerCase().replace(/\s+/g, ' ').trim();
  const contentHash = crypto.createHash('sha256').update(normalizedForHash).digest('hex');

  // Format detection
  const detectedFormat = detectArticleFormat(title, body, headings);

  return {
    title,
    subtitle: description,
    canonicalUrl,
    author,
    publishedAt,
    description,
    headings: headings.slice(0, 12),
    paragraphs: paragraphs.slice(0, 25),
    listItems: listItems.slice(0, 20),
    body: body.slice(0, 8000), // Up to 8,000 chars for comprehensive context
    tags,
    contentHash,
    detectedFormat,
    metadata: {
      ogTitle: metaOgTitle,
      ogDescription: metaDesc,
      jsonLdType,
      readingTimeMinutes: Math.max(1, Math.round(body.split(/\s+/).length / 200)),
    },
  };
}

import { describe, it, expect } from 'vitest';
import { extractHtmlContent, extractRssContent, extractAtomContent, extractSitemapContent, detectContentType, normalizeXmlText } from '@growth-operator/shared';

describe('Source Extraction', () => {
  describe('detectContentType', () => {
    it('detects HTML from content-type', () => {
      expect(detectContentType('text/html', '<html><body>test</body></html>')).toBe('html');
    });

    it('detects RSS from content-type', () => {
      expect(detectContentType('application/rss+xml', '<rss></rss>')).toBe('rss');
    });

    it('detects Atom from content-type', () => {
      expect(detectContentType('application/atom+xml', '<feed></feed>')).toBe('atom');
    });

    it('detects Sitemap from content-type', () => {
      expect(detectContentType('application/xml', '<urlset></urlset>')).toBe('sitemap');
    });

    it('detects RSS from content when content-type is generic', () => {
      expect(detectContentType('application/xml', '<rss version="2.0"></rss>')).toBe('rss');
    });

    it('detects Atom from content when content-type is generic', () => {
      expect(detectContentType('application/xml', '<feed xmlns="http://www.w3.org/2005/Atom"></feed>')).toBe('atom');
    });

    it('detects Sitemap from content when content-type is generic', () => {
      expect(detectContentType('application/xml', '<urlset></urlset>')).toBe('sitemap');
    });

    it('detects HTML from content when content-type is generic', () => {
      expect(detectContentType('application/xml', '<!DOCTYPE html><html><body>test</body></html>')).toBe('html');
    });

    it('returns unknown for unrecognized content', () => {
      expect(detectContentType('text/plain', 'plain text')).toBe('unknown');
    });
  });

  describe('extractHtmlContent', () => {
    const sampleHtml = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Test Article Title</title>
        <meta name="description" content="Test description">
        <meta name="author" content="John Doe">
        <meta property="og:title" content="OG Title">
        <meta property="og:description" content="OG Description">
        <meta property="og:site_name" content="Test Site">
        <meta property="article:published_time" content="2024-01-15T10:00:00Z">
        <meta property="article:author" content="Jane Smith">
      </head>
      <body>
        <nav>Navigation</nav>
        <header>Header</header>
        <article>
          <h1>Main Heading</h1>
          <p>First paragraph with content.</p>
          <h2>Sub Heading</h2>
          <p>Second paragraph with more content.</p>
        </article>
        <aside>Sidebar</aside>
        <footer>Footer</footer>
        <script>alert('test');</script>
        <style>body { color: red; }</style>
      </body>
      </html>
    `;

    it('extracts title from title tag', () => {
      const result = extractHtmlContent(sampleHtml, 'https://example.com/article');
      expect(result.title).toBe('Test Article Title');
    });

    it('extracts description from meta description', () => {
      const result = extractHtmlContent(sampleHtml, 'https://example.com/article');
      expect(result.description).toBe('Test description');
    });

    it('extracts author from meta tags', () => {
      const result = extractHtmlContent(sampleHtml, 'https://example.com/article');
      expect(result.author).toBe('John Doe');
    });

    it('extracts publisher from og:site_name', () => {
      const result = extractHtmlContent(sampleHtml, 'https://example.com/article');
      expect(result.publisher).toBe('Test Site');
    });

    it('extracts published date from article:published_time', () => {
      const result = extractHtmlContent(sampleHtml, 'https://example.com/article');
      expect(result.publishedAt).toEqual(new Date('2024-01-15T10:00:00Z'));
      expect(result.publishedAtConfidence).toBe('VERIFIED');
    });

    it('extracts headings', () => {
      const result = extractHtmlContent(sampleHtml, 'https://example.com/article');
      expect(result.headings).toContain('Main Heading');
      expect(result.headings).toContain('Sub Heading');
    });

    it('extracts paragraphs', () => {
      const result = extractHtmlContent(sampleHtml, 'https://example.com/article');
      expect(result.paragraphs).toContain('First paragraph with content.');
      expect(result.paragraphs).toContain('Second paragraph with more content.');
    });

    it('removes scripts and styles', () => {
      const result = extractHtmlContent(sampleHtml, 'https://example.com/article');
      expect(result.mainContent).not.toContain('alert');
      expect(result.mainContent).not.toContain('color: red');
    });

    it('removes navigation, header, footer, aside', () => {
      const result = extractHtmlContent(sampleHtml, 'https://example.com/article');
      expect(result.mainContent).not.toContain('Navigation');
      expect(result.mainContent).not.toContain('Header');
      expect(result.mainContent).not.toContain('Footer');
      expect(result.mainContent).not.toContain('Sidebar');
    });

    it('extracts word count', () => {
      const result = extractHtmlContent(sampleHtml, 'https://example.com/article');
      expect(result.wordCount).toBeGreaterThan(0);
    });

    it('extracts language', () => {
      const result = extractHtmlContent(sampleHtml, 'https://example.com/article');
      expect(result.language).toBe('en');
    });

    it('handles missing optional fields', () => {
      const minimalHtml = '<html><body><p>Minimal content</p></body></html>';
      const result = extractHtmlContent(minimalHtml);
      expect(result.title).toBeNull();
      expect(result.description).toBeNull();
      expect(result.author).toBeNull();
      expect(result.publisher).toBeNull();
      expect(result.publishedAt).toBeNull();
      expect(result.publishedAtConfidence).toBe('UNKNOWN');
    });
  });

  describe('extractRssContent', () => {
    const sampleRss = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Test RSS Feed</title>
          <description>Test RSS Description</description>
          <link>https://example.com/feed</link>
          <item>
            <title>Item 1</title>
            <description>Description 1</description>
            <link>https://example.com/item1</link>
            <pubDate>Mon, 15 Jan 2024 10:00:00 GMT</pubDate>
            <author>author1@example.com</author>
          </item>
          <item>
            <title>Item 2</title>
            <description>Description 2</description>
            <link>https://example.com/item2</link>
            <pubDate>Tue, 16 Jan 2024 10:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>
    `;

    it('extracts feed metadata', async () => {
      const result = await extractRssContent(sampleRss);
      expect(result.feed.title).toBe('Test RSS Feed');
      expect(result.feed.description).toBe('Test RSS Description');
      expect(result.feed.link).toBe('https://example.com/feed');
    });

    it('extracts items', async () => {
      const result = await extractRssContent(sampleRss);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].title).toBe('Item 1');
      expect(result.items[0].url).toBe('https://example.com/item1');
      expect(result.items[0].description).toBe('Description 1');
      expect(result.items[0].author).toBe('author1@example.com');
      expect(result.items[0].publishedAt).toEqual(new Date('Mon, 15 Jan 2024 10:00:00 GMT'));
    });

    it('handles items without optional fields', async () => {
      const minimalRss = `
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>Minimal Feed</title>
            <item>
              <title>Minimal Item</title>
            </item>
          </channel>
        </rss>
      `;
      const result = await extractRssContent(minimalRss);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Minimal Item');
      expect(result.items[0].url).toBeNull();
      expect(result.items[0].description).toBeNull();
      expect(result.items[0].publishedAt).toBeNull();
      expect(result.items[0].author).toBeNull();
    });
  });

  describe('extractAtomContent', () => {
    const sampleAtom = `
      <?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Test Atom Feed</title>
        <subtitle>Test Atom Subtitle</subtitle>
        <link href="https://example.com/feed"/>
        <entry>
          <title>Entry 1</title>
          <summary>Summary 1</summary>
          <link href="https://example.com/entry1"/>
          <published>2024-01-15T10:00:00Z</published>
          <author><name>Author One</name></author>
        </entry>
        <entry>
          <title>Entry 2</title>
          <content>Content 2</content>
          <link href="https://example.com/entry2"/>
          <updated>2024-01-16T10:00:00Z</updated>
        </entry>
      </feed>
    `;

    it('extracts feed metadata', async () => {
      const result = await extractAtomContent(sampleAtom);
      expect(result.feed.title).toBe('Test Atom Feed');
      expect(result.feed.subtitle).toBe('Test Atom Subtitle');
      expect(result.feed.link).toBe('https://example.com/feed');
    });

    it('extracts entries', async () => {
      const result = await extractAtomContent(sampleAtom);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].title).toBe('Entry 1');
      expect(result.items[0].url).toBe('https://example.com/entry1');
      expect(result.items[0].description).toBe('Summary 1');
      expect(result.items[0].author).toBe('Author One');
      expect(result.items[0].publishedAt).toEqual(new Date('2024-01-15T10:00:00Z'));
    });

    it('handles entries without optional fields', async () => {
      const minimalAtom = `
        <?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Minimal Feed</title>
          <entry>
            <title>Minimal Entry</title>
          </entry>
        </feed>
      `;
      const result = await extractAtomContent(minimalAtom);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe('Minimal Entry');
      expect(result.items[0].url).toBeNull();
      expect(result.items[0].description).toBeNull();
      expect(result.items[0].publishedAt).toBeNull();
      expect(result.items[0].author).toBeNull();
    });
  });

  describe('normalizeXmlText', () => {
    it('passes strings through untouched', () => {
      expect(normalizeXmlText('Just text')).toBe('Just text');
      expect(normalizeXmlText('<p>Kept markup</p>')).toBe('<p>Kept markup</p>');
    });

    it('maps missing values to empty string', () => {
      expect(normalizeXmlText(null)).toBe('');
      expect(normalizeXmlText(undefined)).toBe('');
    });

    it('joins arrays of values', () => {
      expect(normalizeXmlText(['Para one', 'Para two'])).toBe('Para one\nPara two');
      expect(normalizeXmlText(['', null, 'Kept'])).toBe('Kept');
    });

    it('extracts the text body of typed value nodes, ignoring attributes', () => {
      expect(normalizeXmlText({ _: 'Plain release text', type: 'text' })).toBe('Plain release text');
    });

    it('never emits bare attribute metadata as content', () => {
      expect(normalizeXmlText({ type: 'html' })).toBe('');
    });

    it('recurses into nested markup without crashing', () => {
      expect(normalizeXmlText({ type: 'html', p: { _: 'Bundles .', tt: 'x' } })).toContain('Bundles .');
      expect(normalizeXmlText({ a: { b: { c: 1 } } })).toBe('1');
    });
  });

  describe('Gate 4: typed feed content (Atom/RSS object nodes)', () => {
    // Shape fixtures modeled on the real microsoft/TypeScript releases.atom
    // bytes captured 2026-10-02 (HTTP 200, 10 entries). Entry content below
    // is verbatim provider HTML; the surrounding feed is a minimal harness.
    // These are shape-regression fixtures, not full captured responses.
    const githubShapedAtom = `
      <?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Release notes from TypeScript</title>
        <link href="https://github.com/microsoft/TypeScript/releases"/>
        <entry>
          <title>vscode-typescript/v1.0.1</title>
          <content type="html"><![CDATA[<p>Bundles TypeScript 7.0.2 from commit <a class="commit-link" href="https://github.com/microsoft/TypeScript/commit/b6eaace9d7cfd63c018ab25340ba463baae07fb5"><tt>b6eaace</tt></a>.</p>]]></content>
          <link href="https://github.com/microsoft/TypeScript/releases/tag/vscode-typescript%2Fv1.0.1"/>
          <published>2026-09-30T19:10:17.000Z</published>
          <author><name>typescript-automation[bot]</name></author>
        </entry>
      </feed>
    `;

    it('A. Atom content type=html normalizes to text instead of crashing', async () => {
      const result = await extractAtomContent(githubShapedAtom);
      expect(result.items).toHaveLength(1);
      expect(typeof result.items[0].description).toBe('string');
      expect(result.items[0].description).toContain('Bundles TypeScript 7.0.2');
      expect(result.items[0].description).not.toContain('[object Object]');
      expect(result.items[0].publishedAt).toEqual(new Date('2026-09-30T19:10:17.000Z'));
      expect(result.items[0].author).toBe('typescript-automation[bot]');
    });

    it('B. Atom content type=text normalizes to text', async () => {
      const xml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>T</title>
          <entry>
            <title>E</title>
            <content type="text">Plain release text</content>
            <link href="https://example.com/e"/>
          </entry>
        </feed>
      `;
      const result = await extractAtomContent(xml);
      expect(result.items[0].description).toBe('Plain release text');
    });

    it('C. RSS content:encoded (CDATA and typed) normalizes to text', async () => {
      const xml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
          <channel>
            <title>T</title>
            <item>
              <title>CData item</title>
              <link>https://example.com/cdata</link>
              <content:encoded><![CDATA[<p>Real body</p>]]></content:encoded>
            </item>
            <item>
              <title>Typed item</title>
              <link>https://example.com/typed</link>
              <content:encoded type="html"><p>Typed</p></content:encoded>
            </item>
          </channel>
        </rss>
      `;
      const result = await extractRssContent(xml);
      expect(result.items[0].description).toBe('<p>Real body</p>');
      expect(result.items[1].description).toBe('Typed');
    });

    it('E. attribute-only and nested-markup shapes never crash nor leak metadata', async () => {
      const xml = `
        <?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>T</title>
          <entry>
            <title>Empty typed</title>
            <content type="html"/>
            <link href="https://example.com/empty"/>
          </entry>
          <entry>
            <title>Nested markup</title>
            <content type="html"><p>Para one</p><p>Para two</p></content>
            <link href="https://example.com/nested"/>
          </entry>
        </feed>
      `;
      const result = await extractAtomContent(xml);
      expect(result.items).toHaveLength(2);
      // Pure metadata node → null, and the bare word "html" must never
      // appear as if it were content.
      expect(result.items[0].description).toBeNull();
      // Nested markup → real text preserved.
      expect(result.items[1].description).toContain('Para one');
      expect(result.items[1].description).toContain('Para two');
    });

    it('F. normalized descriptions feed wordCount as text, never as objects', async () => {
      const result = await extractAtomContent(githubShapedAtom);
      for (const item of result.items) {
        expect(item.description === null || typeof item.description === 'string').toBe(true);
      }
      // The exact aggregation the ingestion layer performs: must not throw
      // and must yield a finite number.
      const wordCount = result.items.reduce((acc, i) => acc + (i.description?.split(/\s+/).length || 0), 0);
      expect(Number.isFinite(wordCount)).toBe(true);
      expect(wordCount).toBeGreaterThan(0);
    });
  });

  describe('extractSitemapContent', () => {
    const sampleSitemap = `
      <?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
          <loc>https://example.com/page1</loc>
          <lastmod>2024-01-15</lastmod>
        </url>
        <url>
          <loc>https://example.com/page2</loc>
          <lastmod>2024-01-16</lastmod>
        </url>
      </urlset>
    `;

    it('extracts URLs from urlset', async () => {
      const result = await extractSitemapContent(sampleSitemap);
      expect(result.urls).toHaveLength(2);
      expect(result.urls).toContain('https://example.com/page1');
      expect(result.urls).toContain('https://example.com/page2');
    });

    it('extracts URLs from sitemapindex', async () => {
      const sitemapIndex = `
        <?xml version="1.0" encoding="UTF-8"?>
        <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap>
            <loc>https://example.com/sitemap1.xml</loc>
          </sitemap>
          <sitemap>
            <loc>https://example.com/sitemap2.xml</loc>
          </sitemap>
        </sitemapindex>
      `;
      const result = await extractSitemapContent(sitemapIndex);
      expect(result.urls).toHaveLength(2);
      expect(result.urls).toContain('https://example.com/sitemap1.xml');
      expect(result.urls).toContain('https://example.com/sitemap2.xml');
    });
  });
});
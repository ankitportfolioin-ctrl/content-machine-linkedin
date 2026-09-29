import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expandHackerNewsFeed, isFeedUrl, resolveReleaseFeedUrl } from '../feedAdapters';

describe('resolveReleaseFeedUrl', () => {
  it('resolves a repo URL to its official releases Atom feed', () => {
    expect(resolveReleaseFeedUrl('https://github.com/microsoft/TypeScript')).toBe(
      'https://github.com/microsoft/TypeScript/releases.atom'
    );
  });

  it('strips .git suffixes and trailing paths', () => {
    expect(resolveReleaseFeedUrl('https://github.com/vercel/next.js.git')).toBe(
      'https://github.com/vercel/next.js/releases.atom'
    );
    expect(resolveReleaseFeedUrl('https://github.com/vercel/next.js/tree/canary')).toBe(
      'https://github.com/vercel/next.js/releases.atom'
    );
  });

  it('leaves feed URLs and non-GitHub URLs untouched', () => {
    expect(resolveReleaseFeedUrl('https://github.com/vercel/next.js/releases.atom')).toBe(
      'https://github.com/vercel/next.js/releases.atom'
    );
    expect(resolveReleaseFeedUrl('https://example.com/blog/rss.xml')).toBe('https://example.com/blog/rss.xml');
    expect(resolveReleaseFeedUrl('not-a-url')).toBe('not-a-url');
  });
});

describe('isFeedUrl', () => {
  it('detects feed-shaped URLs', () => {
    expect(isFeedUrl('https://news.ycombinator.com/rss')).toBe(true);
    expect(isFeedUrl('https://example.com/feed.xml')).toBe(true);
    expect(isFeedUrl('https://example.com/blog.atom?x=1')).toBe(true);
  });

  it('rejects frontpage URLs', () => {
    expect(isFeedUrl('https://news.ycombinator.com/')).toBe(false);
    expect(isFeedUrl('https://github.com/microsoft/TypeScript')).toBe(false);
  });
});

describe('expandHackerNewsFeed', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockFetch(handler: (url: string) => unknown) {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      const body = handler(url);
      if (body instanceof Error) throw body;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
  }

  it('returns null for non-HN hosts and for HN feed URLs (generic path owns them)', async () => {
    expect(await expandHackerNewsFeed('https://example.com/rss.xml')).toBeNull();
    expect(await expandHackerNewsFeed('https://news.ycombinator.com/rss')).toBeNull();
    expect(await expandHackerNewsFeed('not-a-url')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('expands the frontpage through the official API with real timestamps', async () => {
    mockFetch((url) => {
      if (url.endsWith('/topstories.json')) return [111, 222, 333];
      if (url.endsWith('/item/111.json')) {
        return { id: 111, title: 'Story one', url: 'https://example.com/story-1', time: 1759000000 };
      }
      if (url.endsWith('/item/222.json')) {
        return { id: 222, title: 'Ask HN: testing', time: 1759000100 };
      }
      if (url.endsWith('/item/333.json')) throw new Error('flaky item');
      throw new Error(`unexpected ${url}`);
    });

    const items = await expandHackerNewsFeed('https://news.ycombinator.com/', { maxItems: 10 });
    expect(items).not.toBeNull();
    expect(items!).toHaveLength(2);
    expect(items![0]).toEqual({
      url: 'https://example.com/story-1',
      title: 'Story one',
      publishedAt: new Date(1759000000 * 1000),
    });
    // Ask-HN style item without external URL keeps the discussion canonical.
    expect(items![1]!.url).toBe('https://news.ycombinator.com/item?id=222');
    // Per-story failure (333) is isolated, not fatal.
  });

  it('reads no engagement values from the API', async () => {
    mockFetch((url) => {
      if (url.endsWith('/topstories.json')) return [444];
      if (url.endsWith('/item/444.json')) {
        return { id: 444, title: 'Popular story', url: 'https://example.com/pop', time: 1759000200, score: 512, descendants: 300 };
      }
      throw new Error(`unexpected ${url}`);
    });

    const items = await expandHackerNewsFeed('https://news.ycombinator.com/');
    expect(items).toHaveLength(1);
    expect(items![0]).toEqual({
      url: 'https://example.com/pop',
      title: 'Popular story',
      publishedAt: new Date(1759000200 * 1000),
    });
    expect(items![0]).not.toHaveProperty('score');
    expect(items![0]).not.toHaveProperty('descendants');
  });

  it('throws honestly when the API is unavailable (caller failure-isolates)', async () => {
    mockFetch(() => {
      throw new Error('network down');
    });
    await expect(expandHackerNewsFeed('https://news.ycombinator.com/')).rejects.toThrow();
  });
});

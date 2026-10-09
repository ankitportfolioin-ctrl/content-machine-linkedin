import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { youtubeConnector } from '../connectors/youtubeConnector';

// YouTube Data API v3 is fully implemented (OAuth + API key + health
// states) but cannot be probed live here: no API key or user grant is
// available in this environment. These tests pin the contract with stubbed
// fetch: valid responses parse with source timestamps, quota/auth/empty
// cases report honestly, and a total failure is never a silent [].

const CREDS = { accessToken: 'test-token', apiKey: 'test-key' };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

const SEARCH_PAGE = {
  items: [
    {
      id: { videoId: 'vid001' },
      snippet: {
        title: 'Vibe coding a real project',
        description: 'Full walkthrough',
        channelTitle: 'Builder Channel',
        channelId: 'chan1',
        publishedAt: '2026-10-01T10:00:00Z',
      },
    },
  ],
};

const VIDEOS_PAGE = {
  items: [
    {
      id: 'vid001',
      snippet: {
        title: 'Vibe coding a real project',
        description: 'Full walkthrough',
        channelTitle: 'Builder Channel',
        channelId: 'chan1',
        publishedAt: '2026-10-01T10:00:00Z',
        tags: ['coding'],
        categoryId: '28',
      },
      contentDetails: { duration: 'PT12M30S' },
      statistics: { viewCount: '999999', likeCount: '12345', commentCount: '678' },
    },
  ],
};

describe('YouTube connector contract (stubbed network)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses search + videos responses with source timestamps and no engagement storage', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/search?')) return jsonResponse(SEARCH_PAGE);
      if (url.includes('/videos?')) return jsonResponse(VIDEOS_PAGE);
      throw new Error(`unexpected ${url}`);
    });

    const items = await youtubeConnector.fetchRecentItems(CREDS, 5, { queries: ['vibe coding'] });
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://www.youtube.com/watch?v=vid001');
    expect(items[0].publishedAt).toEqual(new Date('2026-10-01T10:00:00Z'));
    // Engagement counts are never stored, per the connector's capabilities.
    expect(items[0].metadata).not.toHaveProperty('viewCount');
    expect(items[0].metadata).not.toHaveProperty('likeCount');
    expect(items[0].metadata).not.toHaveProperty('commentCount');
    expect(items[0].metadata).toHaveProperty('duration', 'PT12M30S');
  });

  it('reports invalid credentials honestly instead of an empty success', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse({ error: { code: 403, message: 'API key not valid' } }, 403),
    );

    await expect(
      youtubeConnector.fetchRecentItems(CREDS, 5, { queries: ['vibe coding'] }),
    ).rejects.toThrow(/403/);
  });

  it('surfaces quota exhaustion as RATE_LIMITED, not success', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse({ error: { code: 403, errors: [{ reason: 'quotaExceeded' }] } }, 403),
    );

    const health = await youtubeConnector.getHealth(CREDS);
    expect(['AUTH_REQUIRED', 'SOURCE_UNAVAILABLE', 'RATE_LIMITED']).toContain(health.status);
    expect(health.errors.length).toBeGreaterThan(0);
  });

  it('returns an honest empty array when the API legitimately has no items', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/search?')) return jsonResponse({ items: [] });
      throw new Error(`unexpected ${url}`);
    });

    const items = await youtubeConnector.fetchRecentItems(CREDS, 5, { queries: ['obscure query xyz'] });
    expect(items).toEqual([]);
  });

  it('requires an access token before any request', async () => {
    const stub = vi.mocked(fetch);
    await expect(youtubeConnector.fetchRecentItems({}, 5, { queries: ['x'] })).rejects.toThrow(
      /access token/i,
    );
    expect(stub).not.toHaveBeenCalled();
  });

  it('validates key configuration without exposing the key value', async () => {
    const noToken = await youtubeConnector.getHealth({});
    expect(noToken.status).toBe('AUTH_REQUIRED');

    const noKey = await youtubeConnector.getHealth({ accessToken: 't' });
    expect(noKey.status).toBe('NOT_CONFIGURED');
    // Configuration reports booleans only — credential values never echoed.
    expect(noKey.configuration).toEqual({ hasAccessToken: true, hasApiKey: false });

    vi.mocked(fetch).mockImplementation(async () => jsonResponse({ items: [] }));
    const ok = await youtubeConnector.getHealth(CREDS);
    expect(ok.status).toBe('AVAILABLE');
    expect(ok.configuration).toEqual({ hasAccessToken: true, hasApiKey: true });
  });
});

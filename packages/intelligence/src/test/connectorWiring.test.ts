import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ConnectorRegistry,
  primeConnectorRegistry,
  normalizeSignal,
  generateDedupeHash,
  RawSignal,
  ResearchConnector,
} from '../researchConnectors';
import { redditConnector } from '../connectors/redditConnector';
import { quoraConnector } from '../connectors/quoraConnector';

afterEach(() => {
  vi.unstubAllGlobals();
});

function countingConnector(sourceType: string, signals: RawSignal[]): ResearchConnector & { calls: number } {
  const connector = {
    calls: 0,
    sourceType,
    displayName: `${sourceType} stub`,
    capabilities: { provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 },
    isConfigured: () => true,
    getAuthorizationUrl: () => '',
    exchangeCode: vi.fn(),
    refreshAccessToken: vi.fn(),
    async fetchRecentItems(): Promise<RawSignal[]> {
      connector.calls += 1;
      return signals;
    },
    getHealth: vi.fn(),
    getCapabilities() {
      return connector.capabilities;
    },
  } as unknown as ResearchConnector & { calls: number };
  return connector;
}

function redditListingResponse() {
  return {
    data: {
      children: [
        {
          data: {
            id: 'wiring123',
            title: 'Wiring test post',
            selftext: 'Body about founder checklists and onboarding workflows.',
            author: 'wiring-tester',
            created_utc: 1759000000,
            permalink: '/r/testsub/comments/wiring123/wiring_test_post/',
            subreddit: 'testsub',
            score: 42,
            num_comments: 7,
            upvote_ratio: 0.95,
            is_self: true,
            link_flair_text: null,
          },
        },
        {
          // Link-only posts carry no selftext and are skipped by design.
          data: {
            id: 'linkonly',
            title: 'Link post',
            selftext: '',
            author: 'linker',
            created_utc: 1759000100,
            permalink: '/r/testsub/comments/linkonly/link_post/',
            subreddit: 'testsub',
            score: 3,
            num_comments: 0,
            upvote_ratio: 0.5,
            is_self: false,
            link_flair_text: null,
          },
        },
      ],
    },
  };
}

describe('Gate 1: connector credential priming', () => {
  it('primes no-auth connectors with valid empty credentials and leaves OAuth ones unset', () => {
    const registry = new ConnectorRegistry();
    const result = primeConnectorRegistry(registry, {});

    expect(result.primed).toEqual(['REDDIT', 'GOOGLE_TRENDS', 'QUORA']);
    expect(result.skippedAuthRequired).toEqual(['YOUTUBE', 'LINKEDIN', 'X', 'INSTAGRAM', 'TIKTOK', 'FACEBOOK']);

    for (const sourceType of ['REDDIT', 'GOOGLE_TRENDS', 'QUORA']) {
      const creds = registry.getCredentials(sourceType);
      expect(creds?.valid).toBe(true);
      expect(creds?.credentials).toEqual({});
    }
    expect(registry.getCredentials('YOUTUBE')).toBeUndefined();
    expect(registry.getCredentials('LINKEDIN')).toBeUndefined();
  });

  it('primes YouTube only when the server actually holds credentials', () => {
    const withKey = new ConnectorRegistry();
    const primed = primeConnectorRegistry(withKey, { YOUTUBE_API_KEY: 'server-key' });
    expect(primed.primed).toContain('YOUTUBE');
    expect(withKey.getCredentials('YOUTUBE')).toEqual({
      credentials: { apiKey: 'server-key' },
      valid: true,
    });

    const withoutKey = new ConnectorRegistry();
    const skipped = primeConnectorRegistry(withoutKey, {});
    expect(skipped.skippedAuthRequired).toContain('YOUTUBE');
    expect(withoutKey.getCredentials('YOUTUBE')).toBeUndefined();

    // Blank strings are not credentials.
    const blank = new ConnectorRegistry();
    primeConnectorRegistry(blank, { YOUTUBE_API_KEY: '   ', YOUTUBE_ACCESS_TOKEN: '' });
    expect(blank.getCredentials('YOUTUBE')).toBeUndefined();
  });

  it('never exposes secrets in the prime result', () => {
    const registry = new ConnectorRegistry();
    const result = primeConnectorRegistry(registry, {
      YOUTUBE_API_KEY: 'super-secret-key',
      YOUTUBE_ACCESS_TOKEN: 'super-secret-token',
    });
    expect(JSON.stringify(result)).not.toContain('super-secret-key');
    expect(JSON.stringify(result)).not.toContain('super-secret-token');
  });

  it('Quora stays honestly UNAVAILABLE even after priming', async () => {
    const registry = new ConnectorRegistry();
    registry.register(quoraConnector);
    primeConnectorRegistry(registry, {});
    await expect(quoraConnector.fetchRecentItems({}, 5, {})).rejects.toThrow(/UNAVAILABLE/);
    const health = await quoraConnector.getHealth({});
    expect(health.status).toBe('UNAVAILABLE');
  });
});

describe('Gate 1: registry executes each enabled connector exactly once per cycle', () => {
  it('calls every enabled connector once and keeps going after failures', async () => {
    const signal: RawSignal = {
      externalId: '1',
      url: 'https://example.com/once',
      title: 'Once',
      content: 'Content',
      author: 'Author',
      publishedAt: new Date(),
      metadata: {},
      sourceType: 'A',
      fetchedAt: new Date(),
    };
    const a = countingConnector('A', [signal]);
    const b = countingConnector('B', []);
    b.fetchRecentItems = (async () => {
      b.calls += 1;
      throw new Error('provider exploded');
    }) as unknown as typeof b.fetchRecentItems;

    const registry = new ConnectorRegistry();
    registry.register(a);
    registry.register(b);
    registry.setCredentials('A', { credentials: {}, valid: true });
    registry.setCredentials('B', { credentials: {}, valid: true });

    const result = await registry.fetchFromAllSources('ws-1', 10, {
      A: { enabled: true, config: {} },
      B: { enabled: true, config: {} },
    });

    expect(a.calls).toBe(1);
    expect(b.calls).toBe(1);
    expect(result.signals).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('B stub');
  });

  it('treats enabled-but-unprimed connectors as honestly not configured (no fetch attempted)', async () => {
    const connector = countingConnector('C', []);
    const registry = new ConnectorRegistry();
    registry.register(connector);
    // Deliberately no setCredentials: production must not invent access.

    const result = await registry.fetchFromAllSources('ws-1', 10, {
      C: { enabled: true, config: {} },
    });

    expect(connector.calls).toBe(0);
    expect(result.signals).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/not configured/);
  });
});

describe('Gate 1: Reddit wiring (real connector, stubbed network only)', () => {
  it('real RedditConnector parses listings into RawSignals and normalizes deterministically', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () =>
        new Response(JSON.stringify(redditListingResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const items = await redditConnector.fetchRecentItems({}, 10, { subreddits: ['testsub'] });
    // Link-only post is skipped by the connector's own problem-discovery rule.
    expect(items).toHaveLength(1);
    expect(items[0].externalId).toBe('wiring123');
    expect(items[0].url).toBe('https://reddit.com/r/testsub/comments/wiring123/wiring_test_post/');
    expect(items[0].sourceType).toBe('REDDIT');

    const first = normalizeSignal({ workspaceId: 'ws-1', signal: items[0] as RawSignal });
    const second = normalizeSignal({ workspaceId: 'ws-1', signal: items[0] as RawSignal });
    expect(first.dedupeHash).toBe(second.dedupeHash);
    expect(first.freshness).toBeDefined();
    expect(first.workspaceId).toBe('ws-1');
  });

  it('identical connector items deduplicate to the same hash (existing mechanism reused)', () => {
    const base: RawSignal = {
      externalId: 'x1',
      url: 'https://reddit.com/r/testsub/comments/x1/dup/?utm_source=share',
      title: 'Duplicate',
      content: 'Same body',
      author: 'a',
      publishedAt: new Date(),
      metadata: {},
      sourceType: 'REDDIT',
      fetchedAt: new Date(),
    };
    const tracked: RawSignal = { ...base, url: 'https://reddit.com/r/testsub/comments/x1/dup/' };
    // Tracking params are stripped: same canonical item, same hash.
    expect(generateDedupeHash(base)).toBe(generateDedupeHash(tracked));
  });
});

describe('Gate 1: Google Trends failure isolation (stubbed network)', () => {
  it('a 429 from Trends is recorded while other connectors still deliver', async () => {
    const { googleTrendsConnector } = await import('../connectors/googleTrendsConnector');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('rate limited', { status: 429 })),
    );

    const registry = new ConnectorRegistry();
    const good = countingConnector('GOOD', [
      {
        externalId: 'g1',
        url: 'https://example.com/good',
        title: 'Good',
        content: 'Body',
        author: null,
        publishedAt: new Date(),
        metadata: {},
        sourceType: 'GOOD',
        fetchedAt: new Date(),
      },
    ]);
    registry.register(good);
    registry.register(googleTrendsConnector);
    registry.setCredentials('GOOD', { credentials: {}, valid: true });
    registry.setCredentials('GOOGLE_TRENDS', { credentials: {}, valid: true });

    const result = await registry.fetchFromAllSources('ws-1', 10, {
      GOOD: { enabled: true, config: {} },
      GOOGLE_TRENDS: { enabled: true, config: { topics: ['AI'] } },
    });

    expect(result.signals.map((s) => s.sourceType)).toEqual(['GOOD']);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.join(' ')).toMatch(/Google Trends/);
  });
});

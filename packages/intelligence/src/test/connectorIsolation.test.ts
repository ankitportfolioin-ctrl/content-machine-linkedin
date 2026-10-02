import { describe, it, expect, vi, beforeEach } from 'vitest';
import { connectorRegistry } from '../researchConnectors';
import { redditConnector } from '../connectors/redditConnector';
import { youtubeConnector } from '../connectors/youtubeConnector';
import { googleTrendsConnector } from '../connectors/googleTrendsConnector';
import { linkedinConnector } from '../connectors/linkedinConnector';
import { xConnector } from '../connectors/xConnector';
import { instagramConnector } from '../connectors/instagramConnector';
import { tiktokConnector } from '../connectors/tiktokConnector';
import { ResearchConnector, ConnectorCredentials, RawSignal } from '../researchConnectors';

describe('Connector Isolation', () => {
  const mockCredentials: ConnectorCredentials = {
    credentials: { accessToken: 'test-token' },
    valid: true,
  };

  const mockConfig = { enabled: true, config: {} };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches from available connectors even when one fails', async () => {
    const workingConnector: ResearchConnector = {
      sourceType: 'WORKING',
      displayName: 'Working Connector',
      capabilities: {
        provides: ['test'],
        limitations: [],
        scopes: [],
        requiresAuth: false,
        tier: 1,
      },
      isConfigured: () => true,
      getAuthorizationUrl: () => '',
      exchangeCode: vi.fn(),
      refreshAccessToken: vi.fn(),
      fetchRecentItems: vi.fn().mockResolvedValue([
        { externalId: '1', url: 'https://example.com/1', title: 'Test 1', content: 'Content 1', author: 'Author', publishedAt: new Date(), metadata: {}, sourceType: 'WORKING', fetchedAt: new Date() },
      ]),
      getHealth: vi.fn().mockResolvedValue({ status: 'AVAILABLE', lastSuccessfulSync: new Date(), lastAttemptedSync: new Date(), recordsDiscovered: 1, recordsProcessed: 1, errors: [], rateLimitState: { remaining: 100, resetAt: null }, configuration: {} }),
      getCapabilities: () => ({ provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 }),
    };

    const failingConnector: ResearchConnector = {
      sourceType: 'FAILING',
      displayName: 'Failing Connector',
      capabilities: {
        provides: ['test'],
        limitations: [],
        scopes: [],
        requiresAuth: false,
        tier: 1,
      },
      isConfigured: () => true,
      getAuthorizationUrl: () => '',
      exchangeCode: vi.fn(),
      refreshAccessToken: vi.fn(),
      fetchRecentItems: vi.fn().mockRejectedValue(new Error('Network error')),
      getHealth: vi.fn().mockResolvedValue({ status: 'SOURCE_UNAVAILABLE', lastSuccessfulSync: null, lastAttemptedSync: new Date(), recordsDiscovered: 0, recordsProcessed: 0, errors: ['Network error'], rateLimitState: { remaining: 0, resetAt: null }, configuration: {} }),
      getCapabilities: () => ({ provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 }),
    };

    const testRegistry = new (Object.getPrototypeOf(connectorRegistry).constructor)();
    testRegistry.register(workingConnector);
    testRegistry.register(failingConnector);
    testRegistry.setCredentials('WORKING', mockCredentials);
    testRegistry.setCredentials('FAILING', mockCredentials);
    testRegistry.setConfig('WORKING', mockConfig);
    testRegistry.setConfig('FAILING', mockConfig);

    const result = await testRegistry.fetchFromAllSources('test-workspace', 10, {
      WORKING: mockConfig,
      FAILING: mockConfig,
    });

    expect(result.signals.length).toBe(1);
    expect(result.signals[0].sourceType).toBe('WORKING');
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Failing Connector');
  });

  it('continues when one connector returns AUTH_REQUIRED', async () => {
    const authRequiredConnector: ResearchConnector = {
      sourceType: 'AUTH_REQUIRED',
      displayName: 'Auth Required Connector',
      capabilities: { provides: ['test'], limitations: [], scopes: [], requiresAuth: true, tier: 1 },
      isConfigured: () => false,
      getAuthorizationUrl: () => '',
      exchangeCode: vi.fn(),
      refreshAccessToken: vi.fn(),
      fetchRecentItems: vi.fn(),
      getHealth: vi.fn().mockResolvedValue({ status: 'AUTH_REQUIRED', lastSuccessfulSync: null, lastAttemptedSync: new Date(), recordsDiscovered: 0, recordsProcessed: 0, errors: ['No token'], rateLimitState: { remaining: 0, resetAt: null }, configuration: {} }),
      getCapabilities: () => ({ provides: ['test'], limitations: [], scopes: [], requiresAuth: true, tier: 1 }),
    };

    const workingConnector: ResearchConnector = {
      sourceType: 'WORKING2',
      displayName: 'Working Connector 2',
      capabilities: { provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 },
      isConfigured: () => true,
      getAuthorizationUrl: () => '',
      exchangeCode: vi.fn(),
      refreshAccessToken: vi.fn(),
      fetchRecentItems: vi.fn().mockResolvedValue([
        { externalId: '2', url: 'https://example.com/2', title: 'Test 2', content: 'Content 2', author: 'Author', publishedAt: new Date(), metadata: {}, sourceType: 'WORKING2', fetchedAt: new Date() },
      ]),
      getHealth: vi.fn().mockResolvedValue({ status: 'AVAILABLE', lastSuccessfulSync: new Date(), lastAttemptedSync: new Date(), recordsDiscovered: 1, recordsProcessed: 1, errors: [], rateLimitState: { remaining: 100, resetAt: null }, configuration: {} }),
      getCapabilities: () => ({ provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 }),
    };

    const testRegistry = new (Object.getPrototypeOf(connectorRegistry).constructor)();
    testRegistry.register(authRequiredConnector);
    testRegistry.register(workingConnector);
    testRegistry.setCredentials('AUTH_REQUIRED', { credentials: {}, valid: false });
    testRegistry.setCredentials('WORKING2', mockCredentials);
    testRegistry.setConfig('AUTH_REQUIRED', mockConfig);
    testRegistry.setConfig('WORKING2', mockConfig);

    const result = await testRegistry.fetchFromAllSources('test-workspace', 10, {
      AUTH_REQUIRED: mockConfig,
      WORKING2: mockConfig,
    });

    expect(result.signals.length).toBe(1);
    expect(result.signals[0].sourceType).toBe('WORKING2');
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('not configured');
  });

  it('continues when one connector returns RATE_LIMITED', async () => {
    const rateLimitedConnector: ResearchConnector = {
      sourceType: 'RATE_LIMITED',
      displayName: 'Rate Limited Connector',
      capabilities: { provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 },
      isConfigured: () => true,
      getAuthorizationUrl: () => '',
      exchangeCode: vi.fn(),
      refreshAccessToken: vi.fn(),
      fetchRecentItems: vi.fn().mockRejectedValue(new Error('RATE_LIMITED')),
      getHealth: vi.fn().mockResolvedValue({ status: 'RATE_LIMITED', lastSuccessfulSync: null, lastAttemptedSync: new Date(), recordsDiscovered: 0, recordsProcessed: 0, errors: ['Rate limited'], rateLimitState: { remaining: 0, resetAt: null }, configuration: {} }),
      getCapabilities: () => ({ provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 }),
    };

    const workingConnector: ResearchConnector = {
      sourceType: 'WORKING3',
      displayName: 'Working Connector 3',
      capabilities: { provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 },
      isConfigured: () => true,
      getAuthorizationUrl: () => '',
      exchangeCode: vi.fn(),
      refreshAccessToken: vi.fn(),
      fetchRecentItems: vi.fn().mockResolvedValue([
        { externalId: '3', url: 'https://example.com/3', title: 'Test 3', content: 'Content 3', author: 'Author', publishedAt: new Date(), metadata: {}, sourceType: 'WORKING3', fetchedAt: new Date() },
      ]),
      getHealth: vi.fn().mockResolvedValue({ status: 'AVAILABLE', lastSuccessfulSync: new Date(), lastAttemptedSync: new Date(), recordsDiscovered: 1, recordsProcessed: 1, errors: [], rateLimitState: { remaining: 100, resetAt: null }, configuration: {} }),
      getCapabilities: () => ({ provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 }),
    };

    const testRegistry = new (Object.getPrototypeOf(connectorRegistry).constructor)();
    testRegistry.register(rateLimitedConnector);
    testRegistry.register(workingConnector);
    testRegistry.setCredentials('RATE_LIMITED', mockCredentials);
    testRegistry.setCredentials('WORKING3', mockCredentials);
    testRegistry.setConfig('RATE_LIMITED', mockConfig);
    testRegistry.setConfig('WORKING3', mockConfig);

    const result = await testRegistry.fetchFromAllSources('test-workspace', 10, {
      RATE_LIMITED: mockConfig,
      WORKING3: mockConfig,
    });

    expect(result.signals.length).toBe(1);
    expect(result.signals[0].sourceType).toBe('WORKING3');
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('Rate Limited Connector: RATE_LIMITED');
  });

  it('handles multiple failing connectors gracefully', async () => {
    const failing1: ResearchConnector = {
      sourceType: 'FAIL1',
      displayName: 'Fail 1',
      capabilities: { provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 },
      isConfigured: () => true,
      getAuthorizationUrl: () => '',
      exchangeCode: vi.fn(),
      refreshAccessToken: vi.fn(),
      fetchRecentItems: vi.fn().mockRejectedValue(new Error('Error 1')),
      getHealth: vi.fn(),
      getCapabilities: () => ({ provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 }),
    };

    const failing2: ResearchConnector = {
      sourceType: 'FAIL2',
      displayName: 'Fail 2',
      capabilities: { provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 },
      isConfigured: () => true,
      getAuthorizationUrl: () => '',
      exchangeCode: vi.fn(),
      refreshAccessToken: vi.fn(),
      fetchRecentItems: vi.fn().mockRejectedValue(new Error('Error 2')),
      getHealth: vi.fn(),
      getCapabilities: () => ({ provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 }),
    };

    const working: ResearchConnector = {
      sourceType: 'WORK4',
      displayName: 'Working 4',
      capabilities: { provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 },
      isConfigured: () => true,
      getAuthorizationUrl: () => '',
      exchangeCode: vi.fn(),
      refreshAccessToken: vi.fn(),
      fetchRecentItems: vi.fn().mockResolvedValue([
        { externalId: '4', url: 'https://example.com/4', title: 'Test 4', content: 'Content 4', author: 'Author', publishedAt: new Date(), metadata: {}, sourceType: 'WORK4', fetchedAt: new Date() },
      ]),
      getHealth: vi.fn(),
      getCapabilities: () => ({ provides: ['test'], limitations: [], scopes: [], requiresAuth: false, tier: 1 }),
    };

    const testRegistry = new (Object.getPrototypeOf(connectorRegistry).constructor)();
    testRegistry.register(failing1);
    testRegistry.register(failing2);
    testRegistry.register(working);
    testRegistry.setCredentials('FAIL1', mockCredentials);
    testRegistry.setCredentials('FAIL2', mockCredentials);
    testRegistry.setCredentials('WORK4', mockCredentials);
    testRegistry.setConfig('FAIL1', mockConfig);
    testRegistry.setConfig('FAIL2', mockConfig);
    testRegistry.setConfig('WORK4', mockConfig);

    const result = await testRegistry.fetchFromAllSources('test-workspace', 10, {
      FAIL1: mockConfig,
      FAIL2: mockConfig,
      WORK4: mockConfig,
    });

    expect(result.signals.length).toBe(1);
    expect(result.signals[0].sourceType).toBe('WORK4');
    expect(result.errors.length).toBe(2);
  });

  it('normalizes signals from different sources to comparable structure', async () => {
    const { normalizeSignal, RawSignal, NormalizedSignal } = await import('../researchConnectors');
    
    const redditSignal: RawSignal = {
      externalId: 'reddit123',
      url: 'https://reddit.com/r/programming/comments/abc123/test_post/?utm_source=share',
      title: 'How to learn AI coding?',
      content: 'I want to learn AI coding but dont know where to start',
      author: 'user123',
      publishedAt: new Date('2024-01-15T10:00:00Z'),
      metadata: { subreddit: 'programming', score: 42, numComments: 15 },
      sourceType: 'REDDIT',
      fetchedAt: new Date(),
    };

    const youtubeSignal: RawSignal = {
      externalId: 'youtube456',
      url: 'https://www.youtube.com/watch?v=xyz789&ref=share',
      title: 'AI Coding Tutorial for Beginners',
      content: 'In this video we cover the basics of AI coding...',
      author: 'CodeChannel',
      publishedAt: new Date('2024-01-15T12:00:00Z'),
      metadata: { channelId: 'UC123', viewCount: 10000, likeCount: 500 },
      sourceType: 'YOUTUBE',
      fetchedAt: new Date(),
    };

    const normalizedReddit = normalizeSignal({ workspaceId: 'ws1', signal: redditSignal });
    const normalizedYoutube = normalizeSignal({ workspaceId: 'ws1', signal: youtubeSignal });

    // Both should have the same structure
    expect(normalizedReddit).toHaveProperty('id');
    expect(normalizedReddit).toHaveProperty('workspaceId', 'ws1');
    expect(normalizedReddit).toHaveProperty('sourceType', 'REDDIT');
    expect(normalizedReddit).toHaveProperty('raw');
    expect(normalizedReddit).toHaveProperty('freshness');
    expect(normalizedReddit).toHaveProperty('dedupeHash');
    expect(normalizedReddit).toHaveProperty('processedAt');

    expect(normalizedYoutube).toHaveProperty('id');
    expect(normalizedYoutube).toHaveProperty('workspaceId', 'ws1');
    expect(normalizedYoutube).toHaveProperty('sourceType', 'YOUTUBE');
    expect(normalizedYoutube).toHaveProperty('raw');
    expect(normalizedYoutube).toHaveProperty('freshness');
    expect(normalizedYoutube).toHaveProperty('dedupeHash');
    expect(normalizedYoutube).toHaveProperty('processedAt');

    // Source-specific metrics should be preserved in raw.metadata
    expect(normalizedReddit.raw.metadata).toHaveProperty('score');
    expect(normalizedReddit.raw.metadata).toHaveProperty('numComments');
    expect(normalizedYoutube.raw.metadata).toHaveProperty('viewCount');
    expect(normalizedYoutube.raw.metadata).toHaveProperty('likeCount');

    // Different URLs should have different hashes
    expect(normalizedReddit.dedupeHash).not.toBe(normalizedYoutube.dedupeHash);
    
    // But same URL with different tracking params should have same hash
    const redditSignal2: RawSignal = {
      ...redditSignal,
      url: 'https://reddit.com/r/programming/comments/abc123/test_post/?utm_medium=social&fbclid=123',
    };
    const normalizedReddit2 = normalizeSignal({ workspaceId: 'ws1', signal: redditSignal2 });
    expect(normalizedReddit.dedupeHash).toBe(normalizedReddit2.dedupeHash);
  });

  it('extracts typed engagement metrics per source', async () => {
    const { extractEngagementMetric } = await import('../researchConnectors');
    
    const redditSignal = {
      externalId: '1', url: 'https://reddit.com/1', title: 'Test', content: 'Test',
      author: 'user', publishedAt: new Date(), metadata: { score: 100, numComments: 50, upvoteRatio: 0.95 },
      sourceType: 'REDDIT', fetchedAt: new Date(),
    };

    const youtubeSignal = {
      externalId: '1', url: 'https://youtube.com/1', title: 'Test', content: 'Test',
      author: 'channel', publishedAt: new Date(), metadata: { viewCount: 10000, likeCount: 500, commentCount: 100 },
      sourceType: 'YOUTUBE', fetchedAt: new Date(),
    };

    const redditMetric = extractEngagementMetric(redditSignal);
    expect(redditMetric.type).toBe('REDDIT_SCORE');
    expect(redditMetric).toHaveProperty('score', 100);
    expect(redditMetric).toHaveProperty('comments', 50);
    expect(redditMetric).toHaveProperty('upvoteRatio', 0.95);

    const youtubeMetric = extractEngagementMetric(youtubeSignal);
    expect(youtubeMetric.type).toBe('YOUTUBE_STATS');
    expect(youtubeMetric).toHaveProperty('viewCount', 10000);
    expect(youtubeMetric).toHaveProperty('likeCount', 500);
    expect(youtubeMetric).toHaveProperty('commentCount', 100);
  });

  it('classifies freshness correctly including UNKNOWN for missing timestamps', async () => {
    const { classifyFreshnessStatic } = await import('../researchConnectors');
    
    const now = new Date();
    expect(classifyFreshnessStatic(new Date(now.getTime() - 30 * 60 * 1000))).toBe('BREAKING');
    expect(classifyFreshnessStatic(new Date(now.getTime() - 12 * 60 * 60 * 1000))).toBe('FRESH');
    expect(classifyFreshnessStatic(new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000))).toBe('RECENT');
    expect(classifyFreshnessStatic(new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000))).toBe('AGING');
    expect(classifyFreshnessStatic(new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000))).toBe('STALE');
    expect(classifyFreshnessStatic(null)).toBe('UNKNOWN');
  });
});
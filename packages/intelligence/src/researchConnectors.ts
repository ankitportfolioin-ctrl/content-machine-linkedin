/**
 * Unified Research Connector Architecture
 * 
 * All external research sources must implement this interface.
 * The Content Brain uses these connectors to fetch, normalize, and understand signals.
 */

export type SourceType = 
  | 'REDDIT'
  | 'YOUTUBE'
  | 'GOOGLE_TRENDS'
  | 'LINKEDIN'
  | 'X'
  | 'INSTAGRAM'
  | 'TIKTOK'
  | 'RSS'
  | 'ATOM'
  | 'HACKERNEWS'
  | 'GITHUB_RELEASES'
  | 'BLOG'
  | 'SITE'
  | 'USER_URL';

export type ConnectorStatus = 
  | 'AVAILABLE'
  | 'DEGRADED'
  | 'SOURCE_UNAVAILABLE'
  | 'AUTH_REQUIRED'
  | 'RATE_LIMITED'
  | 'NOT_CONFIGURED'
  | 'INSUFFICIENT_DATA';

export interface ConnectorConfig {
  /** Whether the connector is enabled for this workspace */
  enabled: boolean;
  /** Workspace-specific configuration (subreddits, queries, channels, etc.) */
  config: Record<string, unknown>;
  /** Rate limit configuration */
  rateLimit?: {
    requestsPerMinute: number;
    requestsPerHour: number;
  };
}

export interface ConnectorCredentials {
  /** Platform-specific credentials (OAuth tokens, API keys, etc.) */
  credentials: Record<string, string>;
  /** Whether credentials are valid and not expired */
  valid: boolean;
  /** Error message if credentials are invalid */
  error?: string;
}

export interface RawSignal {
  /** Unique identifier from the source platform */
  externalId: string;
  /** Canonical URL for the signal */
  url: string;
  /** Title or headline */
  title: string | null;
  /** Full text content */
  content: string | null;
  /** Author/creator */
  author: string | null;
  /** Publication timestamp */
  publishedAt: Date | null;
  /** Platform-specific metadata */
  metadata: Record<string, unknown>;
  /** Source platform */
  sourceType: string;
  /** When this signal was fetched */
  fetchedAt: Date;
}

export interface NormalizedSignal {
  /** Unique ID for this signal */
  id: string;
  /** Workspace ID */
  workspaceId: string;
  /** Source platform */
  sourceType: string;
  /** Raw signal data */
  raw: RawSignal;
  /** AI understanding (populated after understanding step) */
  understanding?: SignalUnderstanding;
  /** Freshness classification */
  freshness: 'BREAKING' | 'FRESH' | 'RECENT' | 'AGING' | 'STALE' | 'UNKNOWN';
  /** Deduplication hash */
  dedupeHash: string;
  /** When this signal was processed */
  processedAt: Date;
}

export interface SignalUnderstanding {
  /** Main topic */
  topic: string;
  /** Subtopics */
  subtopics: string[];
  /** Target audience */
  audience: string | null;
  /** Problem/pain point identified */
  problem: string | null;
  /** Question being asked */
  question: string | null;
  /** User intent */
  intent: string | null;
  /** Content format suggested */
  contentFormat: string | null;
  /** Hook pattern */
  hookPattern: string | null;
  /** Angle/approach */
  angle: string | null;
  /** Novelty score 0-1 */
  novelty: number;
  /** Trend relevance 0-1 */
  trendRelevance: number;
  /** Business relevance 0-1 */
  businessRelevance: number;
  /** Content relevance 0-1 */
  contentRelevance: number;
  /** Evidence quality 0-1 */
  evidenceQuality: number;
  /** Confidence in understanding 0-1 */
  confidence: number;
  /** Raw AI response for debugging */
  rawResponse: unknown;
}

export interface ConnectorCapabilities {
  /** What this connector can provide */
  provides: string[];
  /** What this connector cannot do */
  limitations: string[];
  /** Required OAuth scopes */
  scopes: string[];
  /** Whether this connector requires authentication */
  requiresAuth: boolean;
  /** Whether this is a Tier 1 (core) or Tier 2 (optional) source */
  tier: 1 | 2;
}

export interface ConnectorHealth {
  status: ConnectorStatus;
  lastSuccessfulSync: Date | null;
  lastAttemptedSync: Date | null;
  recordsDiscovered: number;
  recordsProcessed: number;
  errors: string[];
  rateLimitState: {
    remaining: number;
    resetAt: Date | null;
  };
  configuration: Record<string, unknown>;
}

export interface ResearchConnector {
  /** Unique identifier for this connector */
  readonly sourceType: string;
  /** Human-readable display name */
  readonly displayName: string;
  /** Connector capabilities and limitations */
  readonly capabilities: ConnectorCapabilities;
  /** Check if connector is configured and ready */
  isConfigured(credentials: ConnectorCredentials): boolean;
  /** Get authorization URL for OAuth flow */
  getAuthorizationUrl(credentials: Record<string, string>, state: string): string;
  /** Exchange OAuth code for tokens */
  exchangeCode(credentials: Record<string, string>, code: string): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }>;
  /** Refresh access token */
  refreshAccessToken(credentials: Record<string, string>, refreshToken: string): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }>;
  /** Fetch recent items from the source */
  fetchRecentItems(credentials: Record<string, string>, limit: number, config: Record<string, unknown>): Promise<RawSignal[]>;
  /** Get connector health/status */
  getHealth(credentials: Record<string, string>): Promise<ConnectorHealth>;
  /** Get capabilities */
  getCapabilities(): ConnectorCapabilities;
}

/**
 * Base class for all research connectors
 * Provides common functionality and enforces the interface
 */
export abstract class BaseResearchConnector implements ResearchConnector {
  abstract readonly sourceType: string;
  abstract readonly displayName: string;
  abstract readonly capabilities: ConnectorCapabilities;

  isConfigured(credentials: ConnectorCredentials): boolean {
    return credentials.valid && Object.keys(credentials.credentials).length > 0;
  }

  abstract getAuthorizationUrl(credentials: Record<string, string>, state: string): string;
  abstract exchangeCode(credentials: Record<string, string>, code: string): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }>;
  abstract refreshAccessToken(credentials: Record<string, string>, refreshToken: string): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }>;
  abstract fetchRecentItems(credentials: Record<string, string>, limit: number, config: Record<string, unknown>): Promise<any[]>;
  abstract getHealth(credentials: Record<string, string>): Promise<any>;

  getCapabilities(): ConnectorCapabilities {
    return this.capabilities;
  }

  protected generateDedupeHash(signal: any): string {
    // Default deduplication: hash URL + title
    const str = `${signal.url}|${signal.title}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  protected classifyFreshness(publishedAt: Date | null): 'BREAKING' | 'FRESH' | 'RECENT' | 'AGING' | 'STALE' | 'UNKNOWN' {
    if (!publishedAt) return 'UNKNOWN';
    const now = new Date();
    const ageHours = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
    if (ageHours < 1) return 'BREAKING';
    if (ageHours < 24) return 'FRESH';
    if (ageHours < 168) return 'RECENT'; // 1 week
    if (ageHours < 720) return 'AGING'; // 30 days
    return 'STALE';
  }
}

/**
 * Unified normalization function - converts RawSignal to NormalizedSignal
 * Used by all connectors to ensure consistent signal structure
 */
export interface NormalizationOptions {
  workspaceId: string;
  signal: RawSignal;
  understanding?: SignalUnderstanding;
}

/**
 * Generate a deduplication hash from canonical URL and title
 * Strips tracking parameters for cross-source dedup
 */
export function generateDedupeHash(raw: RawSignal): string {
  const canonicalUrl = stripTrackingParams(raw.url);
  const str = `${canonicalUrl}|${raw.title || ''}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Strip common tracking parameters from URLs for deduplication
 */
export function stripTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'ref', 'source', 'medium', 'campaign',
      'mc_cid', 'mc_eid', 'r', 'share', 'via',
    ];
    for (const param of trackingParams) {
      urlObj.searchParams.delete(param);
    }
    // Remove fragment
    urlObj.hash = '';
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Extract keywords from text for topic detection
 */
export function extractKeywords(text: string, maxKeywords: number = 10): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
    .filter(w => !['this', 'that', 'with', 'from', 'have', 'been', 'were', 'will', 'would', 'could', 'should', 'there', 'their', 'about', 'which', 'when', 'where', 'what', 'who', 'how', 'why', 'because', 'then', 'than', 'into', 'over', 'under', 'after', 'before', 'during', 'while', 'since', 'until', 'unless', 'although', 'through', 'between', 'among', 'within', 'without', 'under', 'above', 'below', 'behind', 'beneath', 'beside', 'beyond', 'around', 'across', 'against', 'along', 'among', 'apart', 'aside', 'away', 'back', 'down', 'even', 'ever', 'far', 'fast', 'first', 'few', 'find', 'found', 'gets', 'give', 'given', 'goes', 'going', 'good', 'great', 'had', 'has', 'have', 'having', 'here', 'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just', 'know', 'known', 'last', 'least', 'let', 'like', 'long', 'made', 'make', 'many', 'may', 'me', 'might', 'more', 'most', 'much', 'must', 'my', 'never', 'new', 'next', 'no', 'not', 'now', 'of', 'off', 'often', 'on', 'once', 'only', 'or', 'other', 'our', 'out', 'over', 'own', 'part', 'people', 'place', 'put', 'said', 'same', 'see', 'seem', 'seen', 'set', 'should', 'show', 'showed', 'shown', 'shows', 'side', 'since', 'so', 'some', 'still', 'such', 'take', 'taken', 'tell', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'think', 'this', 'those', 'through', 'time', 'to', 'too', 'two', 'under', 'up', 'use', 'used', 'uses', 'using', 'very', 'want', 'was', 'way', 'we', 'well', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'why', 'will', 'with', 'without', 'won', 'work', 'world', 'would', 'year', 'you', 'your'].includes(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxKeywords)
    .map(([w]) => w);
}

/**
 * Normalize a raw signal to the standard NormalizedSignal shape
 */
export function normalizeSignal({
  workspaceId,
  signal,
  understanding,
}: NormalizationOptions): NormalizedSignal {
  const dedupeHash = generateDedupeHash(signal);
  const freshness = classifyFreshnessStatic(signal.publishedAt);
  const id = `${signal.sourceType.toLowerCase()}:${signal.externalId}`;
  
  return {
    id,
    workspaceId,
    sourceType: signal.sourceType,
    raw: signal,
    understanding,
    freshness,
    dedupeHash,
    processedAt: new Date(),
  };
}

/**
 * Static version of classifyFreshness for use in normalization
 */
export function classifyFreshnessStatic(publishedAt: Date | null): 'BREAKING' | 'FRESH' | 'RECENT' | 'AGING' | 'STALE' | 'UNKNOWN' {
  if (!publishedAt) return 'UNKNOWN';
  const now = new Date();
  const ageHours = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60);
  if (ageHours < 1) return 'BREAKING';
  if (ageHours < 24) return 'FRESH';
  if (ageHours < 168) return 'RECENT'; // 1 week
  if (ageHours < 720) return 'AGING'; // 30 days
  return 'STALE';
}

/**
 * Source-specific engagement types - each source keeps its own metric type
 */
export type EngagementMetric =
  | { type: 'REDDIT_SCORE'; score: number; comments: number; upvoteRatio: number }
  | { type: 'YOUTUBE_STATS'; viewCount: number | null; likeCount: number | null; commentCount: number | null }
  | { type: 'X_METRICS'; retweets: number; likes: number; replies: number; quotes: number }
  | { type: 'LINKEDIN_IMPRESSIONS'; impressions: number | null }
  | { type: 'INSTAGRAM_ENGAGEMENT'; likes: number | null; comments: number | null }
  | { type: 'TIKTOK_STATS'; views: number | null; likes: number | null; shares: number | null; comments: number | null }
  | { type: 'GOOGLE_TRENDS_INTEREST'; relativeInterest: number; queryType: 'RISING' | 'TOP' }
  | { type: 'UNKNOWN'; raw: Record<string, unknown> };

/**
 * Extract typed engagement metric from raw signal metadata
 */
export function extractEngagementMetric(raw: RawSignal): EngagementMetric {
  const meta = raw.metadata;
  
  switch (raw.sourceType) {
    case 'REDDIT': {
      return {
        type: 'REDDIT_SCORE',
        score: typeof meta.score === 'number' ? meta.score : 0,
        comments: typeof meta.numComments === 'number' ? meta.numComments : 0,
        upvoteRatio: typeof meta.upvoteRatio === 'number' ? meta.upvoteRatio : 0,
      };
    }
    case 'YOUTUBE': {
      return {
        type: 'YOUTUBE_STATS',
        viewCount: typeof meta.viewCount === 'number' ? meta.viewCount : null,
        likeCount: typeof meta.likeCount === 'number' ? meta.likeCount : null,
        commentCount: typeof meta.commentCount === 'number' ? meta.commentCount : null,
      };
    }
    case 'X': {
      const metrics = meta.publicMetrics as Record<string, unknown> || {};
      return {
        type: 'X_METRICS',
        retweets: typeof metrics.retweet_count === 'number' ? metrics.retweet_count : 0,
        likes: typeof metrics.like_count === 'number' ? metrics.like_count : 0,
        replies: typeof metrics.reply_count === 'number' ? metrics.reply_count : 0,
        quotes: typeof metrics.quote_count === 'number' ? metrics.quote_count : 0,
      };
    }
    case 'LINKEDIN': {
      return {
        type: 'LINKEDIN_IMPRESSIONS',
        impressions: null, // Not available via API
      };
    }
    case 'INSTAGRAM': {
      return {
        type: 'INSTAGRAM_ENGAGEMENT',
        likes: null,
        comments: null,
      };
    }
    case 'TIKTOK': {
      return {
        type: 'TIKTOK_STATS',
        views: null,
        likes: null,
        shares: null,
        comments: null,
      };
    }
    case 'GOOGLE_TRENDS': {
      return {
        type: 'GOOGLE_TRENDS_INTEREST',
        relativeInterest: typeof meta.value === 'number' ? meta.value : 
          typeof meta.value === 'string' ? parseInt(meta.value) || 0 : 0,
        queryType: meta.queryType === 'Rising' ? 'RISING' : 'TOP',
      };
    }
    default: {
      return {
        type: 'UNKNOWN',
        raw: meta,
      };
    }
  }
}

export class ConnectorRegistry {
  private connectors: Map<string, ResearchConnector> = new Map();
  private credentials: Map<string, ConnectorCredentials> = new Map();
  private configs: Map<string, ConnectorConfig> = new Map();

  register(connector: ResearchConnector): void {
    this.connectors.set(connector.sourceType, connector);
  }

  getConnector(sourceType: string): ResearchConnector | undefined {
    return this.connectors.get(sourceType);
  }

  getAllConnectors(): ResearchConnector[] {
    return Array.from(this.connectors.values());
  }

  getTier1Connectors(): ResearchConnector[] {
    return this.getAllConnectors().filter(c => c.capabilities.tier === 1);
  }

  getTier2Connectors(): ResearchConnector[] {
    return this.getAllConnectors().filter(c => c.capabilities.tier === 2);
  }

  setCredentials(sourceType: string, credentials: ConnectorCredentials): void {
    this.credentials.set(sourceType, credentials);
  }

  getCredentials(sourceType: string): ConnectorCredentials | undefined {
    return this.credentials.get(sourceType);
  }

  setConfig(sourceType: string, config: ConnectorConfig): void {
    this.configs.set(sourceType, config);
  }

  getConfig(sourceType: string): ConnectorConfig | undefined {
    return this.configs.get(sourceType);
  }

  async fetchFromAllSources(
    workspaceId: string,
    limit: number,
    configs: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>
  ): Promise<{ signals: RawSignal[]; errors: string[] }> {
    // Gate 1: connectors run CONCURRENTLY (Promise.allSettled), never
    // sequentially. A slow/refusing provider must not starve the others or
    // inflate every intelligence run by the sum of provider latencies.
    // Order of signals/errors still follows registration order, and one
    // connector's rejection can never touch another's result.
    const enabled = this.getAllConnectors().filter((c) => configs[c.sourceType]?.enabled);
    const settled = await Promise.allSettled(
      enabled.map(async (connector) => {
        const entry = configs[connector.sourceType];
        const credentials = this.getCredentials(connector.sourceType);
        if (!credentials || !credentials.valid) {
          throw new Error(`${connector.displayName}: not configured`);
        }
        try {
          const items = await connector.fetchRecentItems(credentials.credentials, limit, entry?.config ?? {});
          return items.map((item) => ({
            ...item,
            sourceType: connector.sourceType,
            fetchedAt: new Date(),
          }));
        } catch (error) {
          throw new Error(`${connector.displayName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }),
    );

    const signals: RawSignal[] = [];
    const errors: string[] = [];
    settled.forEach((outcome, index) => {
      const displayName = enabled[index]?.displayName ?? 'Connector';
      if (outcome.status === 'fulfilled') {
        signals.push(...outcome.value);
      } else {
        const reason = outcome.reason;
        errors.push(reason instanceof Error ? reason.message : `${displayName}: Unknown error`);
      }
    });
    return { signals, errors };
  }

  /**
   * Fetch and normalize signals from all configured sources
   */
  async fetchAndNormalizeFromAllSources(
    workspaceId: string,
    limit: number,
    configs: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>
  ): Promise<{ signals: NormalizedSignal[]; errors: string[] }> {
    const { signals: rawSignals, errors } = await this.fetchFromAllSources(workspaceId, limit, configs);
    const normalizedSignals = rawSignals.map(raw => normalizeSignal({ workspaceId, signal: raw }));
    return { signals: normalizedSignals, errors };
  }
}

export const connectorRegistry = new ConnectorRegistry();

/**
 * Production credential priming (Gate 1).
 *
 * The registry holds connector classes but no credentials by itself.
 * Every production caller MUST prime it before fetchFromAllSources(),
 * otherwise every enabled connector is honestly skipped as "not configured".
 *
 * Rules (never violated here):
 * - No-auth public connectors (Reddit, Google Trends, Quora) receive an
 *   explicitly valid EMPTY credential object. Nothing is fabricated: the
 *   providers need no secrets, and Quora still reports UNAVAILABLE from its
 *   own fetchRecentItems().
 * - Authenticated connectors are marked configured ONLY when the server
 *   actually holds credentials (today: YouTube via env). Everything else
 *   stays unset so the registry reports "not configured" honestly.
 * - Only source-type names are ever returned. Secrets are never logged,
 *   never listed, never echoed.
 */
export interface PublicConnectorEnv {
  YOUTUBE_API_KEY?: string | undefined;
  YOUTUBE_ACCESS_TOKEN?: string | undefined;
}

export interface PrimeResult {
  primed: string[];
  skippedAuthRequired: string[];
}

const NO_AUTH_CONNECTORS = ['REDDIT', 'GOOGLE_TRENDS', 'QUORA'] as const;
const OAUTH_CONNECTORS = ['LINKEDIN', 'X', 'INSTAGRAM', 'TIKTOK', 'FACEBOOK'] as const;

export function primeConnectorRegistry(
  registry: ConnectorRegistry,
  env: PublicConnectorEnv = {},
): PrimeResult {
  const primed: string[] = [];
  const skippedAuthRequired: string[] = [];

  for (const sourceType of NO_AUTH_CONNECTORS) {
    registry.setCredentials(sourceType, { credentials: {}, valid: true });
    primed.push(sourceType);
  }

  const apiKey = env.YOUTUBE_API_KEY?.trim() || '';
  const accessToken = env.YOUTUBE_ACCESS_TOKEN?.trim() || '';
  if (apiKey || accessToken) {
    const credentials: Record<string, string> = {};
    if (apiKey) credentials.apiKey = apiKey;
    if (accessToken) credentials.accessToken = accessToken;
    registry.setCredentials('YOUTUBE', { credentials, valid: true });
    primed.push('YOUTUBE');
  } else {
    skippedAuthRequired.push('YOUTUBE');
  }

  for (const sourceType of OAUTH_CONNECTORS) {
    skippedAuthRequired.push(sourceType);
  }

  return { primed, skippedAuthRequired };
}
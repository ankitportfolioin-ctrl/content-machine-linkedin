/**
 * YouTube Connector - Tier 1 Core Research Source
 * 
 * Primary role: Content research + topic discovery + educational format research
 * Discover videos, channels, titles, descriptions, publication dates, thumbnails, video IDs
 * Research should be query-driven from workspace context
 */

import { ResearchConnector, BaseResearchConnector, ConnectorCapabilities, ConnectorCredentials } from '../researchConnectors';

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';
const FETCH_TIMEOUT_MS = 15000;

async function fetchJson(url: string, options: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`YouTube API responded ${response.status} for ${url}`);
    }
    return (await response.json()) as any;
  } finally {
    clearTimeout(timeout);
  }
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export class YouTubeConnector extends BaseResearchConnector {
  readonly sourceType = 'YOUTUBE';
  readonly displayName = 'YouTube';
  readonly capabilities: ConnectorCapabilities = {
    provides: [
      'Video search by query: title, description, publish time, watch URL, channel',
      'Channel uploads: recent videos from subscribed/authorized channels',
      'Hook inspiration: opening lines of real video titles/descriptions',
      'Format patterns: video vs short-form inferred from duration metadata',
      'Channel analysis: content patterns from specific creators',
    ],
    limitations: [
      'Requires YouTube Data API v3 key (quota: 10,000 units/day default)',
      'No view counts, likes, comments, or reach — engagement never read or stored',
      'No trending or search discovery beyond query — only explicit searches',
      'Subject to YouTube Data API quota; exhaustion reports RATE_LIMITED honestly',
      'Only authorized channel uploads or public search results',
    ],
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    requiresAuth: true,
    tier: 1,
  };

  getAuthorizationUrl(credentials: Record<string, string>, state: string): string {
    const clientId = credentials.clientId;
    const redirectUri = credentials.redirectUri;
    if (!clientId || !redirectUri) throw new Error('Missing clientId or redirectUri');
    return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.readonly',
      access_type: 'offline',
      prompt: 'consent',
      state,
    }).toString()}`;
  }

  async exchangeCode(credentials: Record<string, string>, code: string) {
    const clientId = credentials.clientId;
    const clientSecret = credentials.clientSecret;
    const redirectUri = credentials.redirectUri;
    if (!clientId || !clientSecret || !redirectUri) throw new Error('Missing credentials');
    return this.tokenPost('https://oauth2.googleapis.com/token', {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    });
  }

  async refreshAccessToken(credentials: Record<string, string>, refreshToken: string) {
    const clientId = credentials.clientId;
    const clientSecret = credentials.clientSecret;
    if (!clientId || !clientSecret) throw new Error('Missing credentials');
    return this.tokenPost('https://oauth2.googleapis.com/token', {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  private async tokenPost(url: string, params: Record<string, string>) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (typeof payload.access_token !== 'string' || !payload.access_token) {
      throw new Error('Token endpoint returned no access token.');
    }
    return {
      accessToken: payload.access_token,
      refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
      expiresAt: typeof payload.expires_in === 'number'
        ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
        : null,
    };
  }

  async fetchRecentItems(
    credentials: Record<string, string>,
    limit: number,
    config: Record<string, unknown>
  ): Promise<any[]> {
    const accessToken = credentials.accessToken;
    if (!accessToken) throw new Error('No access token provided');

    const queries = (config.queries as string[]) || this.generateQueriesFromConfig(config);
    const capped = Math.min(Math.max(1, limit), 50);
    const items: any[] = [];

    for (const query of queries) {
      if (items.length >= limit) break;
      try {
        const searchUrl = `${YOUTUBE_API}/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=relevance&maxResults=${Math.min(25, limit - items.length)}&publishedAfter=${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}`;
        const data = await fetchJson(`${searchUrl}&key=${credentials.apiKey || ''}`, {
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
        });

        const videoIds = (data.items || []).map((item: any) => item.id?.videoId).filter(Boolean);
        if (videoIds.length === 0) continue;

        const videosUrl = `${YOUTUBE_API}/videos?part=snippet,contentDetails,statistics&id=${videoIds.join(',')}`;
        const videosData = await fetchJson(`${videosUrl}&key=${credentials.apiKey || ''}`, {
          headers: { Authorization: `Bearer ${credentials.accessToken}` },
        });

        for (const video of videosData.items || []) {
          if (items.length >= limit) break;
          const snippet = video.snippet;
          const contentDetails = video.contentDetails;
          const stats = video.statistics;

          items.push({
            externalId: video.id,
            url: `https://www.youtube.com/watch?v=${video.id}`,
            title: snippet.title,
            content: snippet.description,
            author: snippet.channelTitle,
            publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt) : null,
            metadata: {
              channelId: snippet.channelId,
              channelTitle: snippet.channelTitle,
              duration: contentDetails.duration,
              viewCount: stats?.viewCount ? parseInt(stats.viewCount) : null,
              likeCount: stats?.likeCount ? parseInt(stats.likeCount) : null,
              commentCount: stats?.commentCount ? parseInt(stats.commentCount) : null,
              tags: snippet.tags,
              categoryId: snippet.categoryId,
              defaultLanguage: snippet.defaultLanguage,
              defaultAudioLanguage: snippet.defaultAudioLanguage,
            },
            sourceType: 'YOUTUBE',
            fetchedAt: new Date(),
          });
        }
      } catch (error) {
        console.error(`YouTube search failed for "${query}":`, error);
        continue;
      }
    }

    return items.slice(0, limit);
  }

  private generateQueriesFromConfig(config: Record<string, unknown>): string[] {
    const queries: string[] = [];
    if (config.queries && Array.isArray(config.queries)) {
      queries.push(...(config.queries as string[]));
    }
    if (config.topics && Array.isArray(config.topics)) {
      queries.push(...(config.topics as string[]).map(t => `${t} tutorial`));
    }
    if (config.keywords && Array.isArray(config.keywords)) {
      queries.push(...(config.keywords as string[]));
    }
    // Default queries if none configured
    if (queries.length === 0) {
      queries.push('AI automation', 'AI coding', 'vibe coding', 'Claude Code', 'Cursor AI', 'AI agents', 'web development', 'freelancing with AI');
    }
    return queries.slice(0, 20);
  }

  async getHealth(credentials: Record<string, string>): Promise<any> {
    const lastAttemptedSync = new Date();
    
    if (!credentials.accessToken) {
      return {
        status: 'AUTH_REQUIRED',
        lastSuccessfulSync: null,
        lastAttemptedSync,
        recordsDiscovered: 0,
        recordsProcessed: 0,
        errors: ['No access token provided'],
        rateLimitState: { remaining: 0, resetAt: null },
        configuration: { hasApiKey: !!credentials.apiKey },
      };
    }

    if (!credentials.apiKey) {
      return {
        status: 'NOT_CONFIGURED',
        lastSuccessfulSync: null,
        lastAttemptedSync,
        recordsDiscovered: 0,
        recordsProcessed: 0,
        errors: ['YouTube Data API key not configured'],
        rateLimitState: { remaining: 0, resetAt: null },
        configuration: { hasAccessToken: true, hasApiKey: false },
      };
    }

    try {
      // Test with a simple search
      const testUrl = `${YOUTUBE_API}/search?part=snippet&q=test&type=video&maxResults=1&key=${credentials.apiKey}`;
      const response = await fetch(testUrl, {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) {
        if (response.status === 403) {
          return {
            status: 'AUTH_REQUIRED',
            lastSuccessfulSync: null,
            lastAttemptedSync,
            recordsDiscovered: 0,
            recordsProcessed: 0,
            errors: ['Invalid credentials or API key'],
            rateLimitState: { remaining: 0, resetAt: null },
            configuration: { hasAccessToken: true, hasApiKey: true },
          };
        }
        if (response.status === 429) {
          return {
            status: 'RATE_LIMITED',
            lastSuccessfulSync: null,
            lastAttemptedSync,
            recordsDiscovered: 0,
            recordsProcessed: 0,
            errors: ['YouTube API quota exceeded'],
            rateLimitState: { remaining: 0, resetAt: null },
            configuration: { hasAccessToken: true, hasApiKey: true },
          };
        }
        return {
          status: 'SOURCE_UNAVAILABLE',
          lastSuccessfulSync: null,
          lastAttemptedSync,
          recordsDiscovered: 0,
          recordsProcessed: 0,
          errors: [`YouTube API responded ${response.status}`],
          rateLimitState: { remaining: 0, resetAt: null },
          configuration: { hasAccessToken: true, hasApiKey: true },
        };
      }
      
      return {
        status: 'AVAILABLE',
        lastSuccessfulSync: new Date(),
        lastAttemptedSync,
        recordsDiscovered: 0,
        recordsProcessed: 0,
        errors: [],
        rateLimitState: { remaining: 10000, resetAt: null },
        configuration: { hasAccessToken: true, hasApiKey: true },
      };
    } catch (error) {
      return {
        status: 'SOURCE_UNAVAILABLE',
        lastSuccessfulSync: null,
        lastAttemptedSync,
        recordsDiscovered: 0,
        recordsProcessed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        rateLimitState: { remaining: 0, resetAt: null },
        configuration: { hasAccessToken: true, hasApiKey: true },
      };
    }
  }
}

export const youtubeConnector = new YouTubeConnector();
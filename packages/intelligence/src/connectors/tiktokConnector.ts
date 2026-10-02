/**
 * TikTok Connector - Tier 2 Optional Source
 * 
 * Primary role: Short-form trend and format research
 * Research: topic, hook, short-form format, hashtags, available engagement
 */

import { ResearchConnector, BaseResearchConnector, ConnectorCapabilities, ConnectorCredentials } from '../researchConnectors';

const TIKTOK_API = 'https://open.tiktokapis.com/v2';
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
      if (response.status === 429) {
        throw new Error('RATE_LIMITED');
      }
      throw new Error(`TikTok API responded ${response.status} for ${url}`);
    }
    return (await response.json()) as any;
  } finally {
    clearTimeout(timeout);
  }
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export class TikTokConnector extends BaseResearchConnector {
  readonly sourceType = 'TIKTOK';
  readonly displayName = 'TikTok';
  readonly capabilities: ConnectorCapabilities = {
    provides: [
      'Own videos: title, description, creation time, video URL',
      'Hook inspiration: opening seconds text/visual hooks',
      'Format patterns: video structure, effects, sounds',
      'Hashtag analysis: trending hashtags in niche',
      'Sound trends: popular audio for content inspiration',
    ],
    limitations: [
      'Requires TikTok developer app with approved product',
      'Research API access is limited and requires eligibility review',
      'No public trending/search API — only own authorized content',
      'No likes, comments, shares, or view counts stored',
      'Subject to TikTok API rate limits and eligibility requirements',
    ],
    scopes: ['video.list', 'user.info.basic'],
    requiresAuth: true,
    tier: 2,
  };

  getAuthorizationUrl(credentials: Record<string, string>, state: string): string {
    if (!credentials.clientId || !credentials.redirectUri) {
      throw new Error('Missing clientId or redirectUri');
    }
    return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({
      client_key: credentials.clientId,
      redirect_uri: credentials.redirectUri,
      response_type: 'code',
      scope: 'video.list,user.info.basic',
      state,
    }).toString()}`;
  }

  async exchangeCode(credentials: Record<string, string>, code: string) {
    const clientKey = credentials.clientId;
    const clientSecret = credentials.clientSecret;
    const redirectUri = credentials.redirectUri;
    if (!clientKey || !clientSecret || !redirectUri) throw new Error('Missing clientId or redirectUri');
    return this.tokenPost('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: clientKey,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    });
  }

  async refreshAccessToken(credentials: Record<string, string>, refreshToken: string) {
    const clientKey = credentials.clientId;
    const clientSecret = credentials.clientSecret;
    if (!clientKey || !clientSecret) throw new Error('Missing clientId or redirectUri');
    return this.tokenPost('https://open.tiktokapis.com/v2/oauth/token/', {
      client_key: clientKey,
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

    const capped = Math.min(Math.max(1, limit), 25);
    const items: any[] = [];

    try {
      // Get user info
      const userInfo = await fetchJson(
        `${TIKTOK_API}/user/info/?fields=open_id,union_id,avatar_url,display_name`,
        { headers: bearer(accessToken) }
      ) as { data?: { user?: { open_id?: string; display_name?: string } } };

      const openId = userInfo.data?.user?.open_id;
      const displayName = userInfo.data?.user?.display_name;

      if (!openId) {
        throw new Error('TikTok returned no user identity for this token.');
      }

      const cappedResults = Math.min(Math.max(1, limit), 25);

      // Get own videos
      const videos = await fetchJson(
        `${TIKTOK_API}/video/list/?fields=id,title,description,create_time,cover_image_url,share_url,embed_link,hashtag_names&max_count=${Math.min(cappedResults, 20)}`,
        { headers: bearer(accessToken) }
      ) as { data?: { videos?: Array<{
        id?: string;
        title?: string;
        description?: string;
        create_time?: number;
        cover_image_url?: string;
        share_url?: string;
        embed_link?: string;
        hashtag_names?: string[];
      }> } };

      for (const video of (videos.data?.videos || []).slice(0, limit)) {
        items.push({
          externalId: video.id,
          url: video.share_url,
          title: video.title,
          text: video.description,
          author: displayName || null,
          publishedAt: video.create_time ? new Date(video.create_time * 1000) : null,
          metadata: {
            videoId: video.id,
            hashtags: video.hashtag_names,
            coverImage: video.cover_image_url,
            embedLink: video.embed_link,
          },
          sourceType: 'TIKTOK',
          fetchedAt: new Date(),
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMITED') {
        throw new Error('RATE_LIMITED');
      }
      console.error('TikTok fetch failed:', error);
      throw error;
    }

    return items.slice(0, limit);
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
        configuration: { role: 'research-only', tier: 2 },
      };
    }

    try {
      // Test with user info endpoint
      const userInfo = await fetchJson(
        `${TIKTOK_API}/user/info/?fields=open_id,union_id,avatar_url,display_name`,
        { headers: bearer(credentials.accessToken) }
      ) as { data?: { user?: { open_id?: string; display_name?: string } } };

      const openId = userInfo.data?.user?.open_id;
      
      if (!openId) {
        return {
          status: 'AUTH_REQUIRED',
          lastSuccessfulSync: null,
          lastAttemptedSync,
          recordsDiscovered: 0,
          recordsProcessed: 0,
          errors: ['Invalid access token - no user identity'],
          rateLimitState: { remaining: 0, resetAt: null },
          configuration: { role: 'research-only', tier: 2 },
        };
      }
      
      return {
        status: 'AVAILABLE',
        lastSuccessfulSync: new Date(),
        lastAttemptedSync,
        recordsDiscovered: 0,
        recordsProcessed: 0,
        errors: ['Tier 2 optional source - requires TikTok developer app with approved product, only own authorized content'],
        rateLimitState: { remaining: 100, resetAt: null },
        configuration: { 
          role: 'research-only', 
          tier: 2,
          openId,
          displayName: userInfo.data?.user?.display_name,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMITED') {
        return {
          status: 'RATE_LIMITED',
          lastSuccessfulSync: null,
          lastAttemptedSync,
          recordsDiscovered: 0,
          recordsProcessed: 0,
          errors: ['Rate limited by TikTok API'],
          rateLimitState: { remaining: 0, resetAt: null },
          configuration: { role: 'research-only', tier: 2 },
        };
      }
      return {
        status: 'SOURCE_UNAVAILABLE',
        lastSuccessfulSync: null,
        lastAttemptedSync,
        recordsDiscovered: 0,
        recordsProcessed: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        rateLimitState: { remaining: 0, resetAt: null },
        configuration: { role: 'research-only', tier: 2 },
      };
    }
  }
}

export const tiktokConnector = new TikTokConnector();
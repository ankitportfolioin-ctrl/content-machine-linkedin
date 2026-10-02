/**
 * Instagram Connector - Tier 2 Optional Source
 * 
 * Primary role: Visual/content-format research and secondary distribution
 * Research: visual patterns, carousel structures, Reel formats, educational graphics
 */

import { ResearchConnector, BaseResearchConnector, ConnectorCapabilities, ConnectorCredentials } from '../researchConnectors';

const FB_GRAPH = 'https://graph.facebook.com/v19.0';

export class InstagramConnector extends BaseResearchConnector {
  readonly sourceType = 'INSTAGRAM';
  readonly displayName = 'Instagram';
  readonly capabilities: ConnectorCapabilities = {
    provides: [
      'Business/creator media: caption, media type, permalink, timestamp',
      'Hook inspiration: opening lines of real captions',
      'Format patterns: image / video / carousel / reels from media_type',
      'Visual pattern analysis: aesthetic patterns, color schemes',
    ],
    limitations: [
      'Business or creator accounts only — personal accounts not readable via API',
      'No likes, comments, reach, or insights — engagement never read or stored',
      'No hashtag search or public trends — only your own authorized media',
      'Requires Instagram business/creator account linked to Facebook Page',
    ],
    scopes: ['instagram_basic', 'pages_show_list'],
    requiresAuth: true,
    tier: 2,
  };

  getAuthorizationUrl(credentials: Record<string, string>, state: string): string {
    const clientId = credentials.clientId;
    const redirectUri = credentials.redirectUri;
    if (!clientId || !redirectUri) {
      throw new Error('Missing clientId or redirectUri');
    }
    return `https://www.facebook.com/v19.0/dialog/oauth?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'instagram_basic,pages_show_list',
      state,
    }).toString()}`;
  }

  async exchangeCode(credentials: Record<string, string>, code: string) {
    const clientId = credentials.clientId;
    const clientSecret = credentials.clientSecret;
    const redirectUri = credentials.redirectUri;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing credentials');
    }
    return this.tokenPost(`${FB_GRAPH}/oauth/access_token`, {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    });
  }

  async refreshAccessToken(): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
    throw new Error('Instagram long-lived tokens are exchanged once; re-run Connect if this token expired.');
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
      // Get Instagram business account ID
      const accounts = await fetch(
        `${FB_GRAPH}/me/accounts?fields=id,name,instagram_business_account&limit=25`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then(r => r.json()) as { data?: Array<{ instagram_business_account?: { id?: string } }> };

      const igId = accounts.data
        ?.map((a) => a.instagram_business_account?.id)
        .find((id): id is string => typeof id === 'string' && id.length > 0);

      if (!igId) {
        throw new Error('No Instagram business or creator account is linked to this Facebook login.');
      }

      const media = await fetch(
        `${FB_GRAPH}/${igId}/media?fields=id,caption,media_type,permalink,timestamp,username&limit=${capped}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ).then(r => r.json()) as {
        data?: Array<{
          id?: string;
          caption?: string;
          media_type?: string;
          permalink?: string;
          timestamp?: string;
          username?: string;
        }>;
      };

      return (media.data || []).slice(0, limit).map((m): any => ({
        externalId: m.id || `${igId}:${m.timestamp || 'unknown'}`,
        url: m.permalink || null,
        title: null,
        text: m.caption || null,
        author: m.username || null,
        publishedAt: m.timestamp ? new Date(m.timestamp) : null,
        metadata: {
          mediaId: m.id,
          mediaType: m.media_type,
          permalink: m.permalink,
          username: m.username,
        },
        sourceType: 'INSTAGRAM',
        fetchedAt: new Date(),
      }));
    } catch (error) {
      console.error('Instagram fetch failed:', error);
      throw error;
    }
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
      // Test with accounts endpoint to find Instagram business account
      const accounts = await fetch(
        `${FB_GRAPH}/me/accounts?fields=id,name,instagram_business_account&limit=1`,
        { headers: { Authorization: `Bearer ${credentials.accessToken}` } }
      ).then(r => r.json()) as { data?: Array<{ instagram_business_account?: { id?: string } }> };

      const igId = accounts.data
        ?.map((a) => a.instagram_business_account?.id)
        .find((id): id is string => typeof id === 'string' && id.length > 0);
      
      if (!igId) {
        return {
          status: 'NOT_CONFIGURED',
          lastSuccessfulSync: null,
          lastAttemptedSync,
          recordsDiscovered: 0,
          recordsProcessed: 0,
          errors: ['No Instagram business/creator account linked to this Facebook login'],
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
        errors: ['Tier 2 optional source - only own authorized media, no public search/trends'],
        rateLimitState: { remaining: 100, resetAt: null },
        configuration: { 
          role: 'research-only', 
          tier: 2,
          igAccountId: igId,
        },
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
        configuration: { role: 'research-only', tier: 2 },
      };
    }
  }
}

export const instagramConnector = new InstagramConnector();
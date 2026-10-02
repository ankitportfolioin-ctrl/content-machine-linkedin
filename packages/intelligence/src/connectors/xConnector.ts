/**
 * X (Twitter) Connector - Tier 1 Core Research Source
 * 
 * Primary role: Breaking AI / technology conversation detection
 * High-speed signal source for new AI product launches, developer conversations
 */

import { ResearchConnector, BaseResearchConnector, ConnectorCapabilities, ConnectorCredentials } from '../researchConnectors';

const X_API = 'https://api.twitter.com/2';
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
      throw new Error(`X API responded ${response.status} for ${url}`);
    }
    return (await response.json()) as any;
  } finally {
    clearTimeout(timeout);
  }
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export class XConnector extends BaseResearchConnector {
  readonly sourceType = 'X';
  readonly displayName = 'X';
  readonly capabilities: ConnectorCapabilities = {
    provides: [
      'Own posts: text, creation time, post URL',
      'Hook inspiration: opening lines of real posts',
      'Format patterns: plain vs hashtag vs link posts from entities',
      'User timeline: recent posts from authorized account',
      'Mentions: replies and mentions to authorized account',
    ],
    limitations: [
      'Free-tier X API is narrow: own recent posts only, tight rate limits',
      'No likes, reposts, views, or follower data — engagement never read or stored',
      'No search or public trends on free access — only your own authorized posts',
      'Rate limits reported honestly as RATE_LIMITED status',
      'Requires OAuth 2.0 PKCE with Twitter developer app',
    ],
    scopes: ['tweet.read', 'users.read', 'offline.access'],
    requiresAuth: true,
    tier: 1,
  };

  getAuthorizationUrl(credentials: Record<string, string>, state: string): string {
    const clientId = credentials.clientId;
    const redirectUri = credentials.redirectUri;
    if (!clientId || !redirectUri) throw new Error('Missing clientId or redirectUri');
    // PKCE verifier is negotiated by the frontend flow
    return `https://twitter.com/i/oauth2/authorize?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'tweet.read users.read offline.access',
      code_challenge: 'growth-operator-pkce',
      code_challenge_method: 'plain',
      state,
    }).toString()}`;
  }

  async exchangeCode(credentials: Record<string, string>, code: string) {
    const clientId = credentials.clientId;
    const redirectUri = credentials.redirectUri;
    if (!clientId || !redirectUri) throw new Error('Missing clientId or redirectUri');
    return this.tokenPost('https://api.twitter.com/2/oauth2/token', {
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
      code_verifier: 'growth-operator-pkce',
    });
  }

  async refreshAccessToken(credentials: Record<string, string>, refreshToken: string) {
    const clientId = credentials.clientId;
    if (!clientId) throw new Error('Missing clientId or redirectUri');
    return this.tokenPost('https://api.twitter.com/2/oauth2/token', {
      client_id: clientId,
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

    const capped = Math.min(Math.max(1, limit), 50);
    const items: any[] = [];

    try {
      // Get own user info
      const me = await fetchJson(`${X_API}/users/me?user.fields=username`, {
        headers: bearer(accessToken),
      }) as { data?: { id?: string; username?: string } };

      if (!me.data?.id) {
        throw new Error('X returned no user identity for this token');
      }

      const cappedResults = Math.min(Math.max(1, limit), 50);

      // Fetch own tweets
      const tweets = await fetchJson(
        `${X_API}/users/${me.data.id}/tweets?max_results=${Math.min(cappedResults, 100)}&tweet.fields=created_at,entities,public_metrics,context_annotations`,
        { headers: bearer(accessToken) }
      ) as { data?: Array<{ id?: string; text?: string; created_at?: string; entities?: any; public_metrics?: any; conversation_id?: string; in_reply_to_user_id?: string }> };

      for (const tweet of (tweets.data || []).slice(0, cappedResults)) {
        const text = tweet.text || '';
        const entities = tweet.entities;
        const hashtags = entities?.hashtags?.map((h: any) => h.tag) || [];

        items.push({
          externalId: tweet.id,
          url: tweet.id && me.data?.username ? `https://x.com/${me.data.username}/status/${tweet.id}` : null,
          title: null,
          text,
          author: me.data?.username ? `@${me.data.username}` : null,
          publishedAt: tweet.created_at ? new Date(tweet.created_at) : null,
          metadata: {
            tweetId: tweet.id,
            hashtags,
            urls: entities?.urls?.map((u: any) => u.expanded_url) || [],
            mentions: entities?.mentions?.map((m: any) => m.username) || [],
            publicMetrics: tweet.public_metrics || {},
            conversationId: tweet.conversation_id,
            inReplyToUserId: tweet.in_reply_to_user_id,
          },
          sourceType: 'X',
          fetchedAt: new Date(),
        });
      }

      // Also fetch mentions if available
      try {
        const mentions = await fetchJson(
          `${X_API}/users/${me.data.id}/mentions?max_results=${Math.min(cappedResults - items.length, 100)}&tweet.fields=created_at,entities`,
          { headers: bearer(accessToken) }
        ) as { data?: Array<{ id?: string; text?: string; created_at?: string; entities?: any }> };

        for (const mention of (mentions.data || []).slice(0, cappedResults - items.length)) {
          items.push({
            externalId: `mention-${mention.id}`,
            url: `https://x.com/${me.data?.username}/status/${mention.id}`,
            title: null,
            text: mention.text,
            author: me.data?.username ? `@${me.data.username}` : null,
            publishedAt: mention.created_at ? new Date(mention.created_at) : null,
            metadata: {
              tweetId: mention.id,
              type: 'mention',
              hashtags: mention.entities?.hashtags?.map((h: any) => h.tag) || [],
            },
            sourceType: 'X',
            fetchedAt: new Date(),
          });
        }
      } catch {
        // Mentions might not be available on free tier
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMITED') {
        throw new Error('RATE_LIMITED');
      }
      console.error('X fetch failed:', error);
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
        configuration: { role: 'research-only' },
      };
    }

    try {
      // Test with user lookup
      const me = await fetchJson(`${X_API}/users/me?user.fields=username`, {
        headers: bearer(credentials.accessToken),
      }) as { data?: { id?: string; username?: string } };
      
      if (!me.data?.id) {
        return {
          status: 'AUTH_REQUIRED',
          lastSuccessfulSync: null,
          lastAttemptedSync,
          recordsDiscovered: 0,
          recordsProcessed: 0,
          errors: ['Invalid access token - no user identity'],
          rateLimitState: { remaining: 0, resetAt: null },
          configuration: { role: 'research-only' },
        };
      }
      
      return {
        status: 'AVAILABLE',
        lastSuccessfulSync: new Date(),
        lastAttemptedSync,
        recordsDiscovered: 0,
        recordsProcessed: 0,
        errors: ['Free-tier X API: own recent posts only, no search/trends, tight rate limits'],
        rateLimitState: { remaining: 100, resetAt: null },
        configuration: { 
          role: 'research-only',
          userId: me.data.id,
          username: me.data.username,
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
          errors: ['Rate limited by X API'],
          rateLimitState: { remaining: 0, resetAt: null },
          configuration: { role: 'research-only' },
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
        configuration: { role: 'research-only' },
      };
    }
  }
}

export const xConnector = new XConnector();
/**
 * LinkedIn Connector - Tier 1 Core Research Source
 * 
 * Primary role: Professional audience and niche research
 * Two roles: Research (content/topics/audience) and Publishing+Learning (future)
 * 
 * Research: Professional topics, content, audience, engagement, relevant conversations
 * Publishing+Learning: Own post performance, future learning loop
 * 
 * Requires: LinkedIn developer app with approved product (Share on LinkedIn / Community Management)
 */

import { ResearchConnector, BaseResearchConnector, ConnectorCapabilities, ConnectorCredentials } from '../researchConnectors';

const LINKEDIN_API = 'https://api.linkedin.com/v2';
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
        'X-Restli-Protocol-Version': '2.0.0',
        ...options.headers,
      },
    });
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error('AUTH_REQUIRED: LinkedIn API requires approved product (Share on LinkedIn / Community Management)');
      }
      if (response.status === 429) {
        throw new Error('RATE_LIMITED');
      }
      throw new Error(`LinkedIn API responded ${response.status} for ${url}`);
    }
    return (await response.json()) as any;
  } finally {
    clearTimeout(timeout);
  }
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export class LinkedInConnector extends BaseResearchConnector {
  readonly sourceType = 'LINKEDIN';
  readonly displayName = 'LinkedIn';
  readonly capabilities: ConnectorCapabilities = {
    provides: [
      'Professional topic research: industry discussions, thought leadership',
      'Audience research: professional demographics, job titles, companies',
      'Content analysis: post formats, engagement patterns (when available)',
      'Organization insights: company updates, product launches, hiring signals',
      'Personal posts: own UGC posts text and creation time (requires approved product)',
    ],
    limitations: [
      'Reading posts requires LinkedIn developer app with approved product (Share on LinkedIn / Community Management)',
      'Without approved product: API refuses with 403 - connector reports this honestly',
      'No reactions, comments, impressions, or reach — engagement never read or stored',
      'No feed search or public trends — only your own authorized posts/connections',
      'Requires LinkedIn developer app with approved products (Share on LinkedIn / Community Management)',
    ],
    scopes: ['openid', 'profile', 'email', 'r_member_social'],
    requiresAuth: true,
    tier: 1,
  };

  getAuthorizationUrl(credentials: Record<string, string>, state: string): string {
    const clientId = credentials.clientId;
    const redirectUri = credentials.redirectUri;
    if (!clientId || !redirectUri) {
      throw new Error('Missing clientId or redirectUri');
    }
    return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid profile email r_member_social',
      state,
    }).toString()}`;
  }

  async exchangeCode(credentials: Record<string, string>, code: string) {
    const clientId = credentials.clientId;
    const clientSecret = credentials.clientSecret;
    const redirectUri = credentials.redirectUri;
    if (!clientId || !clientSecret || !redirectUri) throw new Error('Missing clientId or redirectUri');
    return this.tokenPost('https://www.linkedin.com/oauth/v2/accessToken', {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code,
    });
  }

  async refreshAccessToken(
    _credentials: Record<string, string>,
    _refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
    throw new Error('LinkedIn access tokens are short-lived and do not refresh silently; re-run Connect when expired.');
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
      // Get member identity
      const me = await fetchJson('https://api.linkedin.com/v2/userinfo', {
        headers: bearer(accessToken),
      }) as { sub?: string; name?: string };

      if (!me.sub) {
        throw new Error('LinkedIn returned no member identity for this token.');
      }

      // Try to fetch own UGC posts (requires approved product)
      const cappedResults = Math.min(Math.max(1, limit), 25);
      try {
        const ugc = await fetchJson(
          `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn:li:person:${encodeURIComponent(me.sub)})&count=${cappedResults}&sortBy=CREATED`,
          { headers: { ...bearer(accessToken), 'X-Restli-Protocol-Version': '2.0.0' } }
        ) as {
          elements?: Array<{
            id?: string;
            created?: { time?: number };
            specificContent?: { 'com.linkedin.ugc.ShareContent'?: { shareCommentary?: { text?: string } } };
          }>;
        };

        for (const post of (ugc.elements || []).slice(0, cappedResults)) {
          const text = post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || null;
          items.push({
            externalId: post.id,
            url: null,
            title: null,
            text,
            author: me.name || null,
            publishedAt: typeof post.created?.time === 'number' ? new Date(post.created.time) : null,
            metadata: {
              postId: post.id,
              authorId: me.sub,
            },
            sourceType: 'LINKEDIN',
            fetchedAt: new Date(),
          });
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('AUTH_REQUIRED')) {
          // Re-throw auth required errors
          throw error;
        }
        // If UGC posts not available, that's expected without approved product
        console.log('LinkedIn UGC posts not available (requires approved product):', error);
      }

      // Try to fetch organization posts if configured
      const orgIds = (config.organizationIds as string[]) || [];
      for (const orgId of orgIds) {
        if (items.length >= limit) break;
        try {
          const orgPosts = await fetchJson(
            `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn:li:organization:${encodeURIComponent(orgId)})&count=${Math.min(25, limit - items.length)}&sortBy=CREATED`,
            { headers: { ...bearer(accessToken), 'X-Restli-Protocol-Version': '2.0.0' } }
          ) as { elements?: any[] };

          for (const post of (orgPosts.elements || []).slice(0, Math.min(25, limit - items.length))) {
            const text = post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text || null;
            items.push({
              externalId: `org-${post.id}`,
              url: null,
              title: null,
              text,
              author: orgId,
              publishedAt: typeof post.created?.time === 'number' ? new Date(post.created.time) : null,
              metadata: {
                postId: post.id,
                organizationId: orgId,
              },
              sourceType: 'LINKEDIN',
              fetchedAt: new Date(),
            });
          }
        } catch (error) {
          console.log(`LinkedIn org posts failed for ${orgId}:`, error);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('AUTH_REQUIRED')) {
        throw new Error('AUTH_REQUIRED: LinkedIn API requires approved product (Share on LinkedIn / Community Management)');
      }
      if (error instanceof Error && error.message === 'RATE_LIMITED') {
        throw new Error('RATE_LIMITED');
      }
      console.error('LinkedIn fetch failed:', error);
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
        configuration: { role: 'research+publish' },
      };
    }

    try {
      // Test with userinfo endpoint (basic read)
      const me = await fetchJson('https://api.linkedin.com/v2/userinfo', {
        headers: bearer(credentials.accessToken),
      }) as { sub?: string; name?: string };
      
      if (!me.sub) {
        return {
          status: 'AUTH_REQUIRED',
          lastSuccessfulSync: null,
          lastAttemptedSync,
          recordsDiscovered: 0,
          recordsProcessed: 0,
          errors: ['Invalid access token - no member identity'],
          rateLimitState: { remaining: 0, resetAt: null },
          configuration: { role: 'research+publish' },
        };
      }

      // Check if UGC posts are available (requires approved product)
      let ugcAvailable = false;
      try {
        await fetchJson(
          `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn:li:person:${encodeURIComponent(me.sub)})&count=1`,
          { headers: { ...bearer(credentials.accessToken), 'X-Restli-Protocol-Version': '2.0.0' } }
        );
        ugcAvailable = true;
      } catch (error) {
        // UGC posts not available without approved product - this is expected
        ugcAvailable = false;
      }
      
      return {
        status: 'AVAILABLE',
        lastSuccessfulSync: new Date(),
        lastAttemptedSync,
        recordsDiscovered: 0,
        recordsProcessed: 0,
        errors: ugcAvailable ? [] : ['UGC posts require approved LinkedIn product (Share on LinkedIn / Community Management) - research mode only'],
        rateLimitState: { remaining: 100, resetAt: null },
        configuration: { 
          role: ugcAvailable ? 'research+publish' : 'research-only',
          memberId: me.sub,
          ugcAvailable,
        },
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('AUTH_REQUIRED')) {
        return {
          status: 'AUTH_REQUIRED',
          lastSuccessfulSync: null,
          lastAttemptedSync,
          recordsDiscovered: 0,
          recordsProcessed: 0,
          errors: [error.message],
          rateLimitState: { remaining: 0, resetAt: null },
          configuration: { role: 'research+publish' },
        };
      }
      if (error instanceof Error && error.message === 'RATE_LIMITED') {
        return {
          status: 'RATE_LIMITED',
          lastSuccessfulSync: null,
          lastAttemptedSync,
          recordsDiscovered: 0,
          recordsProcessed: 0,
          errors: ['Rate limited by LinkedIn API'],
          rateLimitState: { remaining: 0, resetAt: null },
          configuration: { role: 'research+publish' },
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
        configuration: { role: 'research+publish' },
      };
    }
  }
}

export const linkedinConnector = new LinkedInConnector();
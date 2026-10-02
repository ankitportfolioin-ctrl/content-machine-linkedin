/**
 * Facebook Connector - Tier 1 Core Research Source
 * 
 * Primary role: Page content research, audience insights, professional/business discussions
 * Research: Page posts, public discussions, audience demographics (where available), engagement patterns
 * 
 * Requires: Facebook Login + Graph API, Page access token (for Page posts)
 * Two modes: Profile (limited) and Page (full access to administered Pages)
 */

import { ResearchConnector, BaseResearchConnector, ConnectorCapabilities } from '../researchConnectors';

const FB_GRAPH = 'https://graph.facebook.com/v19.0';
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
      if (response.status === 403) {
        throw new Error('AUTH_REQUIRED: Facebook API requires Page access token for Page posts');
      }
      if (response.status === 429) {
        throw new Error('RATE_LIMITED');
      }
      throw new Error(`Facebook API responded ${response.status} for ${url}`);
    }
    return (await response.json()) as any;
  } finally {
    clearTimeout(timeout);
  }
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export class FacebookConnector extends BaseResearchConnector {
  readonly sourceType = 'FACEBOOK';
  readonly displayName = 'Facebook';
  readonly capabilities: ConnectorCapabilities = {
    provides: [
      'Administered Page posts: message, creation time, permalink, attachments',
      'Page insights: follower demographics, reach (when permitted)',
      'Public group discussions: posts, comments (public groups only)',
      'Hook inspiration: opening lines of real Page posts',
      'Format patterns: post vs photo vs video vs link from attachments',
      'Audience insights: age, gender, location, language breakdowns (Page insights)',
    ],
    limitations: [
      'Pages you administer only — personal timelines not readable via API',
      'No likes, shares, comments, or reach — engagement never read or stored',
      'Requires Facebook Login + pages_show_list + pages_read_engagement scopes',
      'Page access token required for Page posts (not user token)',
      'Rate limited by Graph API (200 req/hour per token)',
      'No public profile search — only your own authorized Pages',
      'Personal profile mode: very limited (own posts only, no insights)',
    ],
    scopes: ['pages_show_list', 'pages_read_engagement', 'pages_read_user_content'],
    requiresAuth: true,
    tier: 1,
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
      scope: 'pages_show_list,pages_read_engagement,pages_read_user_content',
      state,
    }).toString()}`;
  }

  async exchangeCode(credentials: Record<string, string>, code: string) {
    const clientId = credentials.clientId;
    const clientSecret = credentials.clientSecret;
    const redirectUri = credentials.redirectUri;
    if (!clientId || !clientSecret || !redirectUri) throw new Error('Missing credentials');
    return this.tokenPost(`${FB_GRAPH}/oauth/access_token`, {
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
    return this.tokenPost(`${FB_GRAPH}/oauth/access_token`, {
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
    const pageAccessToken = credentials.pageAccessToken;
    if (!accessToken) throw new Error('No access token provided');

    const capped = Math.min(Math.max(1, limit), 50);
    const items: any[] = [];
    const mode = (config.mode as string) || 'page'; // 'page' | 'profile'

    try {
      // Get user's Pages
      const accounts = await fetchJson(
        `${FB_GRAPH}/me/accounts?fields=id,name,access_token,category&limit=50`,
        { headers: bearer(accessToken) }
      ) as { data?: Array<{ id?: string; name?: string; access_token?: string; category?: string }> };

      const pages = (accounts.data || []).filter(p => p.access_token && p.id);

      if (mode === 'page') {
        // Research mode: fetch posts from administered Pages
        const pageIds = (config.pageIds as string[]) || pages.map(p => p.id).filter(Boolean);
        
        for (const pageId of pageIds) {
          if (items.length >= limit) break;
          
          const pageToken = pageAccessToken || pages.find(p => p.id === pageId)?.access_token;
          if (!pageToken) {
            console.log(`No Page access token for Page ${pageId}`);
            continue;
          }

          try {
            const posts = await fetchJson(
              `${FB_GRAPH}/${pageId}/posts?fields=id,message,created_time,permalink_url,full_picture,attachments{type,url,title,description}&limit=${Math.min(25, limit - items.length)}`,
              { headers: bearer(pageToken) }
            ) as { data?: Array<{ id?: string; message?: string; created_time?: string; permalink_url?: string; full_picture?: string; attachments?: { data?: any[] } }> };

            for (const post of (posts.data || []).slice(0, Math.min(25, limit - items.length))) {
              const text = post.message || null;
              const attachments = post.attachments?.data || [];
              const mediaType = attachments.length > 0 ? attachments[0].type : 'post';

              items.push({
                externalId: post.id,
                url: post.permalink_url || null,
                title: null,
                text,
                author: pages.find(p => p.id === pageId)?.name || null,
                publishedAt: post.created_time ? new Date(post.created_time) : null,
                metadata: {
                  postId: post.id,
                  pageId,
                  pageName: pages.find(p => p.id === pageId)?.name,
                  mediaType,
                  attachments: attachments.map(a => ({ type: a.type, url: a.url, title: a.title, description: a.description })),
                  fullPicture: post.full_picture,
                },
                sourceType: 'FACEBOOK',
                fetchedAt: new Date(),
              });
            }
          } catch (error) {
            console.error(`Facebook Page posts failed for ${pageId}:`, error);
            continue;
          }
        }
      } else {
        // Profile mode: own posts only (very limited)
        try {
          const profilePosts = await fetchJson(
            `${FB_GRAPH}/me/posts?fields=id,message,created_time,permalink_url&limit=${capped}`,
            { headers: bearer(accessToken) }
          ) as { data?: Array<{ id?: string; message?: string; created_time?: string; permalink_url?: string }> };

          for (const post of (profilePosts.data || []).slice(0, capped)) {
            items.push({
              externalId: post.id,
              url: post.permalink_url || null,
              title: null,
              text: post.message || null,
              author: 'Me (Profile)',
              publishedAt: post.created_time ? new Date(post.created_time) : null,
              metadata: {
                postId: post.id,
                mode: 'profile',
              },
              sourceType: 'FACEBOOK',
              fetchedAt: new Date(),
            });
          }
        } catch (error) {
          console.error('Facebook profile posts failed:', error);
        }
      }

      // If configured, also fetch public group posts (requires group membership)
      const groupIds = (config.groupIds as string[]) || [];
      for (const groupId of groupIds) {
        if (items.length >= limit) break;
        try {
          const groupPosts = await fetchJson(
            `${FB_GRAPH}/${groupId}/feed?fields=id,message,created_time,permalink_url,from&limit=${Math.min(25, limit - items.length)}`,
            { headers: bearer(accessToken) }
          ) as { data?: Array<{ id?: string; message?: string; created_time?: string; permalink_url?: string; from?: { name?: string; id?: string } }> };

          for (const post of (groupPosts.data || []).slice(0, Math.min(25, limit - items.length))) {
            if (!post.message) continue; // Skip non-text posts for research
            items.push({
              externalId: `group-${post.id}`,
              url: post.permalink_url || null,
              title: null,
              text: post.message,
              author: post.from?.name || null,
              publishedAt: post.created_time ? new Date(post.created_time) : null,
              metadata: {
                postId: post.id,
                groupId,
                authorId: post.from?.id,
                mode: 'group',
              },
              sourceType: 'FACEBOOK',
              fetchedAt: new Date(),
            });
          }
        } catch (error) {
          console.error(`Facebook group posts failed for ${groupId}:`, error);
          continue;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('AUTH_REQUIRED')) {
        throw new Error('AUTH_REQUIRED: Facebook API requires Page access token for Page posts');
      }
      if (error instanceof Error && error.message === 'RATE_LIMITED') {
        throw new Error('RATE_LIMITED');
      }
      console.error('Facebook fetch failed:', error);
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
        configuration: { mode: credentials.mode || 'page' },
      };
    }

    try {
      // Test with accounts endpoint to find Pages
      const accounts = await fetchJson(
        `${FB_GRAPH}/me/accounts?fields=id,name,access_token,category&limit=1`,
        { headers: bearer(credentials.accessToken) }
      ) as { data?: Array<{ id?: string; name?: string; access_token?: string; category?: string }> };

      const pages = (accounts.data || []).filter(p => p.access_token && p.id);
      const hasPageToken = pages.length > 0;

      if (!hasPageToken) {
        return {
          status: 'NOT_CONFIGURED',
          lastSuccessfulSync: null,
          lastAttemptedSync,
          recordsDiscovered: 0,
          recordsProcessed: 0,
          errors: ['No administered Pages found with Page access tokens'],
          rateLimitState: { remaining: 0, resetAt: null },
          configuration: { mode: credentials.mode || 'page', pageCount: 0 },
        };
      }

      // Test Page posts access
      let pagePostsAvailable = false;
      const testPage = pages[0];
      if (testPage && testPage.access_token) {
        try {
          await fetchJson(
            `${FB_GRAPH}/${testPage.id}/posts?fields=id&limit=1`,
            { headers: bearer(testPage.access_token) }
          );
          pagePostsAvailable = true;
        } catch {
          pagePostsAvailable = false;
        }
      }

      return {
        status: 'AVAILABLE',
        lastSuccessfulSync: new Date(),
        lastAttemptedSync,
        recordsDiscovered: 0,
        recordsProcessed: 0,
        errors: pagePostsAvailable 
          ? [] 
          : ['Page posts require Page access token (pages_read_engagement) - profile mode only'],
        rateLimitState: { remaining: 200, resetAt: null },
        configuration: { 
          mode: credentials.mode || 'page',
          pageCount: pages.length,
          pages: pages.map(p => ({ id: p.id, name: p.name, category: p.category })),
          pagePostsAvailable,
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
          configuration: { mode: credentials.mode || 'page' },
        };
      }
      if (error instanceof Error && error.message === 'RATE_LIMITED') {
        return {
          status: 'RATE_LIMITED',
          lastSuccessfulSync: null,
          lastAttemptedSync,
          recordsDiscovered: 0,
          recordsProcessed: 0,
          errors: ['Rate limited by Facebook Graph API'],
          rateLimitState: { remaining: 0, resetAt: null },
          configuration: { mode: credentials.mode || 'page' },
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
        configuration: { mode: credentials.mode || 'page' },
      };
    }
  }
}

export const facebookConnector = new FacebookConnector();
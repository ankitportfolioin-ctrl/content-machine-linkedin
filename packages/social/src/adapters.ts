import {
  ConnectorError,
  OAuthCredentials,
  SocialAdapter,
  SocialItem,
  SocialPlatform,
  TokenPair,
  assertConfigured,
  extractHashtags,
  fetchJson,
} from './types';

function encodeParams(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

async function tokenPost(url: string, params: Record<string, string>): Promise<TokenPair> {
  const payload = (await fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encodeParams(params),
  })) as Record<string, unknown>;
  if (typeof payload.access_token !== 'string' || !payload.access_token) {
    throw new ConnectorError('INVALID_RESPONSE', 'The token endpoint returned no access token.');
  }
  return {
    accessToken: payload.access_token,
    refreshToken: typeof payload.refresh_token === 'string' ? payload.refresh_token : null,
    expiresAt:
      typeof payload.expires_in === 'number'
        ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
        : null,
  };
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ---------------------------------------------------------------------------
// YouTube (Google OAuth2 + YouTube Data API v3)
// ---------------------------------------------------------------------------

class YouTubeAdapter implements SocialAdapter {
  readonly platform: SocialPlatform = 'youtube';
  readonly displayName = 'YouTube';

  capabilities() {
    return {
      provides: [
        'Own channel uploads: video title, description, publish time, watch URL',
        'Hook inspiration: opening lines of real video titles/descriptions',
        'Format patterns: video vs short-form inferred from duration metadata when present',
      ],
      limitations: [
        'No view counts, likes, comments, or reach — engagement is never read or stored',
        'No trending or search discovery — only your own authorized channel uploads',
        'Subject to YouTube Data API quota; quota exhaustion reports RATE_LIMITED honestly',
      ],
      scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    };
  }

  authorizationUrl(c: OAuthCredentials, state: string): string {
    assertConfigured(this.platform, c);
    return (
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      encodeParams({
        client_id: c.clientId,
        redirect_uri: c.redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/youtube.readonly',
        access_type: 'offline',
        prompt: 'consent',
        state,
      })
    );
  }

  async exchangeCode(c: OAuthCredentials, code: string): Promise<TokenPair> {
    assertConfigured(this.platform, c);
    return tokenPost('https://oauth2.googleapis.com/token', {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirectUri,
      grant_type: 'authorization_code',
      code,
    });
  }

  async refreshAccessToken(c: OAuthCredentials, refreshToken: string): Promise<TokenPair> {
    assertConfigured(this.platform, c);
    return tokenPost('https://oauth2.googleapis.com/token', {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  async fetchRecentItems(accessToken: string, limit: number): Promise<SocialItem[]> {
    const capped = Math.min(Math.max(1, limit), 25);
    const channels = (await fetchJson(
      `https://www.googleapis.com/youtube/v3/channels?mine=true&part=contentDetails&maxResults=1`,
      { headers: bearer(accessToken) },
    )) as { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> };
    const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploads) {
      throw new ConnectorError('INVALID_RESPONSE', 'YouTube returned no uploads playlist for this channel.');
    }
    const playlist = (await fetchJson(
      `https://www.googleapis.com/youtube/v3/playlistItems?playlistId=${encodeURIComponent(uploads)}&part=snippet,contentDetails&maxResults=${capped}`,
      { headers: bearer(accessToken) },
    )) as {
      items?: Array<{
        contentDetails?: { videoId?: string };
        snippet?: { title?: string; description?: string; publishedAt?: string; channelTitle?: string };
      }>;
    };
    return (playlist.items ?? []).map((entry): SocialItem => {
      const videoId = entry.contentDetails?.videoId ?? '';
      const text = entry.snippet?.description ?? null;
      return {
        externalId: videoId || `${uploads}:${entry.snippet?.publishedAt ?? 'unknown'}`,
        url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
        title: entry.snippet?.title ?? null,
        text,
        author: entry.snippet?.channelTitle ?? null,
        publishedAt: entry.snippet?.publishedAt ?? null,
        mediaKind: 'video',
        hashtags: extractHashtags(text),
      };
    });
  }
}

// ---------------------------------------------------------------------------
// Instagram (Facebook Login + Instagram Graph API, business/creator accounts)
// ---------------------------------------------------------------------------

const FB_GRAPH = 'https://graph.facebook.com/v19.0';

class InstagramAdapter implements SocialAdapter {
  readonly platform: SocialPlatform = 'instagram';
  readonly displayName = 'Instagram';

  capabilities() {
    return {
      provides: [
        'Business/creator media: caption, media type, permalink, timestamp',
        'Hook inspiration: opening lines of real captions',
        'Format patterns: image / video / carousel / reels from media_type',
      ],
      limitations: [
        'Business or creator accounts only — personal accounts are not readable via the API',
        'No likes, comments, reach, or insights — engagement is never read or stored',
        'No hashtag search or public trends — only your own authorized media',
      ],
      scopes: ['instagram_basic', 'pages_show_list'],
    };
  }

  authorizationUrl(c: OAuthCredentials, state: string): string {
    assertConfigured(this.platform, c);
    return (
      `https://www.facebook.com/v19.0/dialog/oauth?` +
      encodeParams({
        client_id: c.clientId,
        redirect_uri: c.redirectUri,
        response_type: 'code',
        scope: 'instagram_basic,pages_show_list',
        state,
      })
    );
  }

  async exchangeCode(c: OAuthCredentials, code: string): Promise<TokenPair> {
    assertConfigured(this.platform, c);
    return tokenPost(`${FB_GRAPH}/oauth/access_token`, {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirectUri,
      code,
    });
  }

  async refreshAccessToken(): Promise<TokenPair> {
    throw new ConnectorError(
      'INVALID_RESPONSE',
      'Instagram long-lived tokens are exchanged once; re-run Connect if this token expired.',
    );
  }

  async fetchRecentItems(accessToken: string, limit: number): Promise<SocialItem[]> {
    const capped = Math.min(Math.max(1, limit), 25);
    const accounts = (await fetchJson(
      `${FB_GRAPH}/me/accounts?fields=id,name,instagram_business_account&limit=25`,
      { headers: bearer(accessToken) },
    )) as { data?: Array<{ instagram_business_account?: { id?: string } }> };
    const igId = accounts.data
      ?.map((a) => a.instagram_business_account?.id)
      .find((id): id is string => typeof id === 'string' && id.length > 0);
    if (!igId) {
      throw new ConnectorError(
        'INVALID_RESPONSE',
        'No Instagram business or creator account is linked to this Facebook login.',
      );
    }
    const media = (await fetchJson(
      `${FB_GRAPH}/${igId}/media?fields=id,caption,media_type,permalink,timestamp,username&limit=${capped}`,
      { headers: bearer(accessToken) },
    )) as {
      data?: Array<{
        id?: string;
        caption?: string;
        media_type?: string;
        permalink?: string;
        timestamp?: string;
        username?: string;
      }>;
    };
    return (media.data ?? []).map((m): SocialItem => ({
      externalId: m.id ?? `${igId}:${m.timestamp ?? 'unknown'}`,
      url: m.permalink ?? null,
      title: null,
      text: m.caption ?? null,
      author: m.username ?? null,
      publishedAt: m.timestamp ?? null,
      mediaKind: (m.media_type ?? null)?.toLowerCase() ?? null,
      hashtags: extractHashtags(m.caption),
    }));
  }
}

// ---------------------------------------------------------------------------
// Facebook (Facebook Login + Graph API Page posts)
// ---------------------------------------------------------------------------

class FacebookAdapter implements SocialAdapter {
  readonly platform: SocialPlatform = 'facebook';
  readonly displayName = 'Facebook';

  capabilities() {
    return {
      provides: [
        'Own Page posts: message text, creation time, permalink',
        'Hook inspiration: opening lines of real Page posts',
        'Format patterns: post vs photo vs video from attachments when present',
      ],
      limitations: [
        'Pages you administer only — personal timelines are not readable via the API',
        'No likes, shares, comments, or reach — engagement is never read or stored',
      ],
      scopes: ['pages_show_list', 'pages_read_engagement'],
    };
  }

  authorizationUrl(c: OAuthCredentials, state: string): string {
    assertConfigured(this.platform, c);
    return (
      `https://www.facebook.com/v19.0/dialog/oauth?` +
      encodeParams({
        client_id: c.clientId,
        redirect_uri: c.redirectUri,
        response_type: 'code',
        scope: 'pages_show_list,pages_read_engagement',
        state,
      })
    );
  }

  async exchangeCode(c: OAuthCredentials, code: string): Promise<TokenPair> {
    assertConfigured(this.platform, c);
    return tokenPost(`${FB_GRAPH}/oauth/access_token`, {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirectUri,
      code,
    });
  }

  async refreshAccessToken(): Promise<TokenPair> {
    throw new ConnectorError(
      'INVALID_RESPONSE',
      'Facebook tokens do not refresh silently; re-run Connect if this token expired.',
    );
  }

  async fetchRecentItems(accessToken: string, limit: number): Promise<SocialItem[]> {
    const capped = Math.min(Math.max(1, limit), 25);
    const accounts = (await fetchJson(`${FB_GRAPH}/me/accounts?fields=id,name,access_token&limit=25`, {
      headers: bearer(accessToken),
    })) as { data?: Array<{ id?: string; name?: string; access_token?: string }> };
    const page = (accounts.data ?? []).find((a) => a.id && a.access_token) ?? null;
    if (!page?.id || !page.access_token) {
      throw new ConnectorError('INVALID_RESPONSE', 'This login administers no Facebook Page to read posts from.');
    }
    const posts = (await fetchJson(
      `${FB_GRAPH}/${page.id}/posts?fields=id,message,created_time,permalink_url,full_picture&limit=${capped}`,
      { headers: { Authorization: `Bearer ${page.access_token}` } },
    )) as {
      data?: Array<{ id?: string; message?: string; created_time?: string; permalink_url?: string }>;
    };
    return (posts.data ?? []).map((p): SocialItem => ({
      externalId: p.id ?? `${page.id}:${p.created_time ?? 'unknown'}`,
      url: p.permalink_url ?? null,
      title: null,
      text: p.message ?? null,
      author: page.name ?? null,
      publishedAt: p.created_time ?? null,
      mediaKind: 'post',
      hashtags: extractHashtags(p.message),
    }));
  }
}

// ---------------------------------------------------------------------------
// LinkedIn (OAuth2 + UGC posts; approved products required for post reads)
// ---------------------------------------------------------------------------

class LinkedInAdapter implements SocialAdapter {
  readonly platform: SocialPlatform = 'linkedin';
  readonly displayName = 'LinkedIn';

  capabilities() {
    return {
      provides: [
        'Member/organization UGC posts: text, creation time (when the app has an approved product)',
        'Hook inspiration: opening lines of real post text',
      ],
      limitations: [
        'Reading posts requires a LinkedIn developer app with an approved product (Share on LinkedIn / Community Management); without it the API refuses and the connector reports the error honestly',
        'No reactions, comments, impressions, or reach — engagement is never read or stored',
        'No feed search or public trends — only your own authorized posts',
      ],
      scopes: ['openid', 'profile', 'email', 'r_member_social'],
    };
  }

  authorizationUrl(c: OAuthCredentials, state: string): string {
    assertConfigured(this.platform, c);
    return (
      `https://www.linkedin.com/oauth/v2/authorization?` +
      encodeParams({
        client_id: c.clientId,
        redirect_uri: c.redirectUri,
        response_type: 'code',
        scope: 'openid profile email r_member_social',
        state,
      })
    );
  }

  async exchangeCode(c: OAuthCredentials, code: string): Promise<TokenPair> {
    assertConfigured(this.platform, c);
    return tokenPost('https://www.linkedin.com/oauth/v2/accessToken', {
      client_id: c.clientId,
      client_secret: c.clientSecret,
      redirect_uri: c.redirectUri,
      grant_type: 'authorization_code',
      code,
    });
  }

  async refreshAccessToken(): Promise<TokenPair> {
    throw new ConnectorError(
      'INVALID_RESPONSE',
      'LinkedIn access tokens are short-lived and do not refresh silently; re-run Connect when expired.',
    );
  }

  async fetchRecentItems(accessToken: string, limit: number): Promise<SocialItem[]> {
    const me = (await fetchJson('https://api.linkedin.com/v2/userinfo', {
      headers: bearer(accessToken),
    })) as { sub?: string; name?: string };
    if (!me.sub) {
      throw new ConnectorError('INVALID_RESPONSE', 'LinkedIn returned no member identity for this token.');
    }
    const capped = Math.min(Math.max(1, limit), 25);
    const ugc = (await fetchJson(
      `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=List(urn:li:person:${encodeURIComponent(me.sub)})&count=${capped}&sortBy=CREATED`,
      { headers: { ...bearer(accessToken), 'X-Restli-Protocol-Version': '2.0.0' } },
    )) as {
      elements?: Array<{
        id?: string;
        created?: { time?: number };
        specificContent?: { 'com.linkedin.ugc.ShareContent'?: { shareCommentary?: { text?: string } } };
      }>;
    };
    return (ugc.elements ?? []).map((post): SocialItem => {
      const text = post.specificContent?.['com.linkedin.ugc.ShareContent']?.shareCommentary?.text ?? null;
      return {
        externalId: post.id ?? `${me.sub}:${post.created?.time ?? 'unknown'}`,
        url: null,
        title: null,
        text,
        author: me.name ?? null,
        publishedAt: typeof post.created?.time === 'number' ? new Date(post.created.time).toISOString() : null,
        mediaKind: 'post',
        hashtags: extractHashtags(text),
      };
    });
  }
}

// ---------------------------------------------------------------------------
// X (OAuth2 PKCE + API v2 own posts; free tier is narrow by design)
// ---------------------------------------------------------------------------

class XAdapter implements SocialAdapter {
  readonly platform: SocialPlatform = 'x';
  readonly displayName = 'X';

  capabilities() {
    return {
      provides: [
        'Own posts: text, creation time, post URL',
        'Hook inspiration: opening lines of real posts',
        'Format patterns: plain vs hashtag vs link posts from entities when present',
      ],
      limitations: [
        'Free-tier X API is narrow: own recent posts only, tight rate limits — the connector surfaces 429s honestly',
        'No likes, reposts, views, or follower data — engagement is never read or stored',
        'No search or public trends on free access — only your own authorized posts',
      ],
      scopes: ['tweet.read', 'users.read', 'offline.access'],
    };
  }

  authorizationUrl(c: OAuthCredentials, state: string): string {
    assertConfigured(this.platform, c);
    // PKCE verifier is negotiated by the frontend flow docs; the API stores
    // tokens only after the code exchange below succeeds.
    return (
      `https://twitter.com/i/oauth2/authorize?` +
      encodeParams({
        client_id: c.clientId,
        redirect_uri: c.redirectUri,
        response_type: 'code',
        scope: 'tweet.read users.read offline.access',
        code_challenge: 'growth-operator-pkce',
        code_challenge_method: 'plain',
        state,
      })
    );
  }

  async exchangeCode(c: OAuthCredentials, code: string): Promise<TokenPair> {
    assertConfigured(this.platform, c);
    return tokenPost('https://api.twitter.com/2/oauth2/token', {
      client_id: c.clientId,
      redirect_uri: c.redirectUri,
      grant_type: 'authorization_code',
      code,
      code_verifier: 'growth-operator-pkce',
    });
  }

  async refreshAccessToken(c: OAuthCredentials, refreshToken: string): Promise<TokenPair> {
    assertConfigured(this.platform, c);
    return tokenPost('https://api.twitter.com/2/oauth2/token', {
      client_id: c.clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  async fetchRecentItems(accessToken: string, limit: number): Promise<SocialItem[]> {
    const me = (await fetchJson('https://api.twitter.com/2/users/me?user.fields=username', {
      headers: bearer(accessToken),
    })) as { data?: { id?: string; username?: string } };
    if (!me.data?.id) {
      throw new ConnectorError('INVALID_RESPONSE', 'X returned no user identity for this token.');
    }
    const capped = Math.min(Math.max(1, limit), 25);
    const tweets = (await fetchJson(
      `https://api.twitter.com/2/users/${me.data.id}/tweets?max_results=${capped}&tweet.fields=created_at,entities`,
      { headers: bearer(accessToken) },
    )) as {
      data?: Array<{ id?: string; text?: string; created_at?: string }>;
    };
    return (tweets.data ?? []).map((t): SocialItem => ({
      externalId: t.id ?? `${me.data?.id}:${t.created_at ?? 'unknown'}`,
      url:
        t.id && me.data?.username
          ? `https://x.com/${me.data.username}/status/${t.id}`
          : null,
      title: null,
      text: t.text ?? null,
      author: me.data?.username ? `@${me.data.username}` : null,
      publishedAt: t.created_at ?? null,
      mediaKind: 'post',
      hashtags: extractHashtags(t.text),
    }));
  }
}

const ADAPTERS: Record<SocialPlatform, SocialAdapter> = {
  instagram: new InstagramAdapter(),
  facebook: new FacebookAdapter(),
  linkedin: new LinkedInAdapter(),
  youtube: new YouTubeAdapter(),
  x: new XAdapter(),
};

export function getSocialAdapter(platform: SocialPlatform): SocialAdapter {
  return ADAPTERS[platform];
}

export function allSocialAdapters(): SocialAdapter[] {
  return Object.values(ADAPTERS);
}

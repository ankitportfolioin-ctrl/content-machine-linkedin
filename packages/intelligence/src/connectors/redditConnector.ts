/**
 * Reddit Connector - Tier 1 Core Research Source
 * 
 * Primary role: Problem / question / pain-point discovery
 * Use Reddit to understand what people are asking, struggling with, confused about
 */

import { ResearchConnector, BaseResearchConnector, ConnectorCapabilities, ConnectorCredentials, RawSignal } from '../researchConnectors';

const REDDIT_API = 'https://www.reddit.com';
const REDDIT_OAUTH_API = 'https://oauth.reddit.com';
const REDDIT_TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const REDDIT_UA = 'GrowthOperator/1.0 (+https://growth-operator.dev/bot)';
const FETCH_TIMEOUT_MS = 15000;

// App-only OAuth token cache (server identity, not workspace data).
// Tokens live ~1 hour; refresh 60s early. Never logged or persisted.
interface RedditAppToken {
  token: string;
  expiresAt: number;
}

let cachedAppToken: RedditAppToken | null = null;

function dropCachedAppToken(): void {
  cachedAppToken = null;
}

// Test seam: resets the in-memory app token between unit tests so token
// reuse never leaks across cases. Production code never calls this.
export function resetRedditAppTokenForTests(): void {
  dropCachedAppToken();
}

// Application-only OAuth for confidential "script"-type apps, per the
// official Reddit OAuth2 documentation: POST form-urlencoded
// grant_type=client_credentials with HTTP Basic auth (client_id as user,
// client_secret as password). No user context, no redirect URI, read-only.
async function acquireAppToken(clientId: string, clientSecret: string): Promise<string> {
  const now = Date.now();
  if (cachedAppToken && cachedAppToken.expiresAt - 60000 > now) {
    return cachedAppToken.token;
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  let response: Response;
  try {
    response = await fetch(REDDIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': REDDIT_UA,
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(
      `Reddit token endpoint unreachable: ${error instanceof Error ? error.message : 'network error'}`
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error('Reddit app credentials rejected - verify REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET');
  }
  if (!response.ok) {
    throw new Error(`Reddit token endpoint responded ${response.status}`);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Reddit token endpoint returned a malformed response');
  }
  const accessToken =
    typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>).access_token
      : undefined;
  if (typeof accessToken !== 'string' || !accessToken) {
    throw new Error('Reddit token endpoint returned no access token');
  }
  const expiresIn =
    typeof (payload as Record<string, unknown>).expires_in === 'number'
      ? ((payload as Record<string, unknown>).expires_in as number)
      : 3600;
  cachedAppToken = { token: accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

async function fetchJson(url: string, options: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'GrowthOperator/1.0 (+https://growth-operator.dev/bot)',
        'Accept': 'application/json',
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Reddit API responded ${response.status} for ${url}`);
    }
    return (await response.json()) as any;
  } finally {
    clearTimeout(timeout);
  }
}

export class RedditConnector extends BaseResearchConnector {
  readonly sourceType = 'REDDIT';
  readonly displayName = 'Reddit';
  readonly capabilities: ConnectorCapabilities = {
    provides: [
      'Subreddit posts: title, selftext, comments, score, permalink',
      'Problem/question discovery: what people are asking and struggling with',
      'Pain point identification: recurring complaints and frustrations',
      'Topic discovery: trending discussions in relevant communities',
      'Audience language: how real people describe their problems',
    ],
    limitations: [
      'Only public subreddits accessible',
      'No private subreddit or DM access',
      'Rate limited by Reddit API (60 req/min)',
      'No engagement metrics stored (score/comments not used for ranking)',
      'No user profiling - only public post content',
    ],
    scopes: [],
    requiresAuth: false,
    tier: 1,
  };

  getAuthorizationUrl(): string {
    // Reddit doesn't require OAuth for public reads
    return '';
  }

  async exchangeCode(): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
    throw new Error('Reddit connector does not require OAuth for public reads');
  }

  async refreshAccessToken(): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
    throw new Error('Reddit connector does not require OAuth for public reads');
  }

  async fetchRecentItems(
    credentials: Record<string, string>,
    limit: number,
    config: Record<string, unknown>
  ): Promise<any[]> {
    const subreddits = (config.subreddits as string[]) || ['programming', 'MachineLearning', 'artificial', 'OpenAI', 'ClaudeAI', 'LocalLLaMA', 'singularity', 'Futurology', 'technology', 'startups', 'Entrepreneur', 'SaaS', 'webdev', 'learnprogramming', 'coding', 'devops', 'sysadmin', 'kubernetes', 'aws', 'googlecloud', 'azure'];
    const timeFilter = (config.timeFilter as string) || 'day';
    const sortBy = (config.sortBy as string) || 'hot';

    const targets = subreddits.slice(0, Math.min(subreddits.length, 20));
    const capped = Math.min(Math.max(1, limit), 100);
    const failures: string[] = [];
    const successful: any[] = [];

    // Improved: use old.reddit.com which is more permissive, add retry with backoff
    const REDDIT_API_ALT = 'https://old.reddit.com';

    // Marker for transient failures (rate limits, network errors) that may
    // succeed on retry. Every other failure is definitive: the provider
    // refused this client (403/404), the payload is not JSON (HTML
    // interstitial pages are never parseable posts), or the request is
    // malformed. Definitive failures throw immediately with the exact
    // provider status instead of burning the backoff budget.
    class TransientRedditError extends Error {}

    async function fetchOnce(url: string, bearer?: string): Promise<any> {
      const headers: Record<string, string> = {
        'User-Agent': REDDIT_UA,
        'Accept': 'application/json',
      };
      if (bearer) headers.Authorization = `Bearer ${bearer}`;
      const response = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers,
      });
      if (response.status === 429) {
        throw new TransientRedditError('RATE_LIMITED');
      }
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? `Reddit API responded ${response.status} (forbidden) - subreddit may be private, quarantined, or blocking`
            : `Reddit API responded ${response.status}`
        );
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('json')) {
        throw new Error(
          `Reddit API returned unexpected content-type "${contentType || 'unknown'}" - not parseable posts`
        );
      }
      return await response.json();
    }

    function isTransient(error: unknown): boolean {
      if (error instanceof TransientRedditError) return true;
      if (error instanceof TypeError) return true; // network failure in fetch
      return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
    }

    async function fetchWithRetry(
      url: string,
      retries = 3,
      bearer?: string,
      onUnauthorized?: () => Promise<string>,
    ): Promise<any> {
      const isFallbackHost = !url.includes('www.reddit.com');
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await fetchOnce(url, bearer);
        } catch (error) {
          // Single re-auth: a 401 under app credentials means the cached
          // token died early. Drop it, acquire once, retry once — then stop.
          if (
            bearer &&
            onUnauthorized &&
            attempt === 0 &&
            error instanceof Error &&
            error.message.includes('responded 401')
          ) {
            const fresh = await onUnauthorized();
            return fetchOnce(url, fresh);
          }
          // Single fallback attempt for a www 403 only: a 404 or any other
          // definitive status will fail identically on the old host.
          if (
            !isFallbackHost &&
            attempt === 0 &&
            error instanceof Error &&
            error.message.includes('responded 403')
          ) {
            await new Promise(r => setTimeout(r, 1000));
            return fetchOnce(url.replace('www.reddit.com', 'old.reddit.com'));
          }
          if (!isTransient(error) || attempt === retries) throw error;
          const waitMs = Math.min(2000 * Math.pow(2, attempt), 10000);
          await new Promise(r => setTimeout(r, waitMs));
        }
      }
      throw new Error('Max retries exceeded');
    }

    const fetchOne = async (subreddit: string): Promise<any[]> => {
      // App-only OAuth when the server holds script-app credentials:
      // same listing shape via oauth.reddit.com with a bearer token.
      // Otherwise the honest public fail-fast path below.
      const appId = (credentials.clientId || '').trim();
      const appSecret = (credentials.clientSecret || '').trim();
      const useAppAuth = Boolean(appId && appSecret);
      const host = useAppAuth ? REDDIT_OAUTH_API : REDDIT_API;
      const url = `${host}/r/${subreddit}/${sortBy}.json?t=${timeFilter}&limit=25&raw_json=1`;
      const data = useAppAuth
        ? await fetchWithRetry(
            url,
            3,
            await acquireAppToken(appId, appSecret),
            async () => {
              dropCachedAppToken();
              return acquireAppToken(appId, appSecret);
            },
          )
        : await fetchWithRetry(url);
      const posts = data?.data?.children || [];
      const out: any[] = [];
      for (const post of posts) {
        const p = post.data;
        if (!p.title || p.is_self === false) continue;
        out.push({
          externalId: p.id,
          url: `https://reddit.com${p.permalink}`,
          title: p.title,
          content: p.selftext || p.title,
          author: p.author,
          publishedAt: p.created_utc ? new Date(p.created_utc * 1000) : null,
          metadata: {
            subreddit: p.subreddit,
            score: p.score,
            numComments: p.num_comments,
            upvoteRatio: p.upvote_ratio,
            isSelf: p.is_self,
            flair: p.link_flair_text,
          },
          sourceType: 'REDDIT',
          fetchedAt: new Date(),
        });
      }
      return out;
    };

    const perSubreddit: any[][] = targets.map(() => []);
    const SUBREDDIT_CONCURRENCY = 3; // Reduced to be more polite
    for (let start = 0; start < targets.length; start += SUBREDDIT_CONCURRENCY) {
      const batch = targets.slice(start, start + SUBREDDIT_CONCURRENCY);
      const settled = await Promise.allSettled(batch.map((s) => fetchOne(s)));
      settled.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') {
          perSubreddit[start + i] = outcome.value;
          successful.push(...outcome.value);
        } else {
          const message = outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error';
          failures.push(`r/${batch[i]}: ${message}`);
        }
      });
      // Small delay between batches to avoid rate limiting
      if (start + SUBREDDIT_CONCURRENCY < targets.length) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    const items = perSubreddit.flat().slice(0, capped);
    if (items.length === 0 && failures.length > 0) {
      throw new Error(failures.join('; '));
    }
    return items;
  }

  async getHealth(credentials: Record<string, string>): Promise<any> {
    const lastAttemptedSync = new Date();
    try {
      // Test with a simple fetch to a known subreddit
      const testUrl = `${REDDIT_API}/r/programming/hot.json?limit=1`;
      const response = await fetch(testUrl, {
        headers: { 'User-Agent': 'GrowthOperator/1.0 (+https://growth-operator.dev/bot)' },
        signal: AbortSignal.timeout(5000),
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          return {
            status: 'RATE_LIMITED',
            lastSuccessfulSync: null,
            lastAttemptedSync,
            recordsDiscovered: 0,
            recordsProcessed: 0,
            errors: ['Rate limited by Reddit API'],
            rateLimitState: { remaining: 0, resetAt: null },
            configuration: {},
          };
        }
        return {
          status: 'SOURCE_UNAVAILABLE',
          lastSuccessfulSync: null,
          lastAttemptedSync,
          recordsDiscovered: 0,
          recordsProcessed: 0,
          errors: [`Reddit API responded ${response.status}`],
          rateLimitState: { remaining: 0, resetAt: null },
          configuration: {},
        };
      }
      
      return {
        status: 'AVAILABLE',
        lastSuccessfulSync: new Date(),
        lastAttemptedSync,
        recordsDiscovered: 0,
        recordsProcessed: 0,
        errors: [],
        rateLimitState: { remaining: 60, resetAt: null },
        configuration: {},
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
        configuration: {},
      };
    }
  }
}

export const redditConnector = new RedditConnector();
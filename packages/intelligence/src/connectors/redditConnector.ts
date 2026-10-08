/**
 * Reddit Connector - Tier 1 Core Research Source
 * 
 * Primary role: Problem / question / pain-point discovery
 * Use Reddit to understand what people are asking, struggling with, confused about
 */

import { ResearchConnector, BaseResearchConnector, ConnectorCapabilities, ConnectorCredentials, RawSignal } from '../researchConnectors';

const REDDIT_API = 'https://www.reddit.com';
const FETCH_TIMEOUT_MS = 15000;

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
    
    async function fetchWithRetry(url: string, retries = 3): Promise<any> {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: {
              'User-Agent': 'GrowthOperator/1.0 (+https://growth-operator.dev/bot)',
              'Accept': 'application/json',
            },
          });
          
          if (response.status === 429) {
            // Rate limited - wait and retry
            const retryAfter = response.headers.get('retry-after');
            const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.min(2000 * Math.pow(2, attempt), 10000);
            if (attempt < retries) {
              await new Promise(r => setTimeout(r, waitMs));
              continue;
            }
            throw new Error('RATE_LIMITED');
          }
          
          if (response.status === 403) {
            // Try alternative domain
            if (url.includes('www.reddit.com') && attempt === 0) {
              const altUrl = url.replace('www.reddit.com', 'old.reddit.com');
              await new Promise(r => setTimeout(r, 1000));
              return fetchWithRetry(altUrl, retries);
            }
            if (attempt < retries) {
              await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
              continue;
            }
            throw new Error(`Reddit API responded 403 (forbidden) - subreddit may be private, quarantined, or blocking`);
          }
          
          if (!response.ok) {
            throw new Error(`Reddit API responded ${response.status}`);
          }
          
          return await response.json();
        } catch (error) {
          if (attempt === retries) throw error;
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
      throw new Error('Max retries exceeded');
    }

    const fetchOne = async (subreddit: string): Promise<any[]> => {
      const url = `${REDDIT_API}/r/${subreddit}/${sortBy}.json?t=${timeFilter}&limit=25`;
      const data = await fetchWithRetry(url);
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
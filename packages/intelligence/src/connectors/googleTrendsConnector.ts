/**
 * Google Trends Connector - Tier 1 Core Research Source
 * 
 * Primary role: Search-demand and rising-interest detection
 * Different from Reddit: Reddit = what people discuss; Trends = what people search for
 */

import { ResearchConnector, BaseResearchConnector, ConnectorCapabilities, ConnectorCredentials } from '../researchConnectors';

const TRENDS_API = 'https://trends.google.com/trends/api';
const FETCH_TIMEOUT_MS = 15000;

async function fetchJson(url: string, options: RequestInit = {}): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'GrowthOperator/1.0 (+https://growth-operator.dev/bot)',
        ...options.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Google Trends responded ${response.status} for ${url}`);
    }
    const text = await response.text();
    // Google Trends returns JSON with a prefix ")]}'\n"
    const jsonText = text.replace(/^\)\]\}'\n/, '');
    return JSON.parse(jsonText);
  } finally {
    clearTimeout(15000);
  }
}

export class GoogleTrendsConnector extends BaseResearchConnector {
  readonly sourceType = 'GOOGLE_TRENDS';
  readonly displayName = 'Google Trends';
  readonly capabilities: ConnectorCapabilities = {
    provides: [
      'Related queries: rising and top searches for a topic',
      'Interest over time: relative search interest by date',
      'Related topics: breakout and rising related topics',
      'Geographic interest: where searches are coming from',
      'Category filtering: filter by Google Trends categories',
    ],
    limitations: [
      'No absolute search volume - only relative interest (0-100)',
      'No user demographics or intent - only aggregate search behavior',
      'Rate limited (unofficial API, ~10 req/min)',
      'No historical data beyond what Google provides (typically 5 years max)',
      'No query-level demographics',
    ],
    scopes: [],
    requiresAuth: false,
    tier: 1,
  };

  getAuthorizationUrl(): string {
    return '';
  }

  async exchangeCode(): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
    throw new Error('Google Trends connector does not require OAuth');
  }

  async refreshAccessToken(): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null }> {
    throw new Error('Google Trends connector does not require OAuth');
  }

  async fetchRecentItems(
    credentials: Record<string, string>,
    limit: number,
    config: Record<string, unknown>
  ): Promise<any[]> {
    const topics = (config.topics as string[]) || this.generateQueriesFromConfig(config);
    const geo = (config.geo as string) || 'US';
    const timeRange = (config.timeRange as string) || 'now 7-d'; // Past 7 days
    const category = (config.category as number) || 0; // All categories

    const capped = Math.min(Math.max(1, limit), 50);
    // Gate 1 honesty (§4): the CSV endpoints previously ignored HTTP status,
    // turning 429/403 into silent empty results. Classify rejections and
    // surface total failure so the registry records it. Partial-topic
    // failures stay isolated; an empty-but-clean result remains quiet.
    const failures: string[] = [];

    // Bounded concurrency (Gate 1 perf): topics fetch in chunks so one
    // slow/refusing endpoint does not serialize the whole connector.
    // Results merge back in config order, so capping stays deterministic.
    // NOTE: these raw CSV fetches carry an explicit timeout — without one a
    // black-hole network would hang the intelligence run indefinitely.
    const fetchCsv = async (url: string): Promise<string> => {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (res.status === 429) throw new Error('RATE_LIMITED');
      if (!res.ok) throw new Error(`Google Trends responded ${res.status}`);
      return res.text();
    };

    const fetchOne = async (topic: string): Promise<any[]> => {
      const out: any[] = [];
      // Get related queries (rising and top)
      const relatedUrl = `https://trends.google.com/trends/api/widgetdata/relatedsearches/csv?req=%7B%22comparisonItem%22%3A%5B%7B%22keyword%22%3A%22${encodeURIComponent(topic)}%22%2C%22geo%22%3A%22${geo}%22%2C%22time%22%3A%22${timeRange}%22%7D%5D%2C%22category%22%3A${category}%2C%22property%22%3A%22%22%7D&tz=0`;

      const csvText = await fetchCsv(relatedUrl);
      const lines = csvText.split('\n').slice(1); // Skip header

      for (const line of lines) {
        const [type, query, value] = line.split(',');
        if (!query || query === 'Breakout') continue;

        out.push({
          externalId: `trends-${topic}-${query}`,
          url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(query)}&geo=${geo}&date=${timeRange}`,
          title: query,
          content: `Google Trends: ${type} query for "${topic}"`,
          author: null,
          publishedAt: new Date(), // Trends data is current
          metadata: {
            topic,
            queryType: type, // 'Rising' or 'Top'
            value: value === 'Breakout' ? '100+' : value,
            geo,
            timeRange,
            category,
          },
          sourceType: 'GOOGLE_TRENDS',
          fetchedAt: new Date(),
        });
      }

      // Also get interest over time
      const interestUrl = `https://trends.google.com/trends/api/widgetdata/multiline/csv?req=%7B%22comparisonItem%22%3A%5B%7B%22keyword%22%3A%22${encodeURIComponent(topic)}%22%2C%22geo%22%3A%22${geo}%22%2C%22time%22%3A%22${timeRange}%22%7D%5D%2C%22category%22%3A${category}%2C%22property%22%3A%22%22%7D&tz=0`;

      const interestText = await fetchCsv(interestUrl);
      const interestLines = interestText.split('\n').slice(1);

      for (const line of interestLines.slice(-7)) { // Last 7 days
        const [date, value] = line.split(',');
        if (!value || parseInt(value) < 10 || !date) continue;

        out.push({
          externalId: `trends-interest-${topic}-${date}`,
          url: `https://trends.google.com/trends/explore?q=${encodeURIComponent(topic)}&geo=${geo}&date=${timeRange}`,
          title: `${topic} interest on ${date}`,
          content: `Search interest: ${value} (relative)`,
          author: null,
          publishedAt: new Date(date),
          metadata: {
            topic,
            metric: 'interest_over_time',
            value: parseInt(value),
            geo,
            date,
          },
          sourceType: 'GOOGLE_TRENDS',
          fetchedAt: new Date(),
        });
      }
      return out;
    };

    const perTopic: any[][] = topics.map(() => []);
    const TOPIC_CONCURRENCY = 4;
    for (let start = 0; start < topics.length; start += TOPIC_CONCURRENCY) {
      const batch = topics.slice(start, start + TOPIC_CONCURRENCY);
      const settled = await Promise.allSettled(batch.map((t) => fetchOne(t)));
      settled.forEach((outcome, i) => {
        if (outcome.status === 'fulfilled') {
          perTopic[start + i] = outcome.value;
        } else {
          const message = outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error';
          failures.push(`"${batch[i]}": ${message}`);
        }
      });
    }

    const items = perTopic.flat().slice(0, capped);
    if (items.length === 0 && failures.length > 0) {
      throw new Error(failures.join('; '));
    }
    return items;
  }

  private generateQueriesFromConfig(config: Record<string, unknown>): string[] {
    if (config.topics && Array.isArray(config.topics)) {
      return (config.topics as string[]);
    }
    if (config.keywords && Array.isArray(config.keywords)) {
      return (config.keywords as string[]);
    }
    return ['AI', 'AI coding', 'AI agents', 'Claude Code', 'vibe coding', 'automation', 'developer tools'];
  }

  async getHealth(credentials: Record<string, string>): Promise<any> {
    const lastAttemptedSync = new Date();
    
    try {
      // Test with a simple request to Google Trends
      const testUrl = 'https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=%7B%22comparisonItem%22%3A%5B%7B%22keyword%22%3A%22test%22%2C%22geo%22%3A%22US%22%2C%22time%22%3A%22now+1-d%22%7D%5D%2C%22category%22%3A0%2C%22property%22%3A%22%22%7D';
      const response = await fetch(testUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'GrowthOperator/1.0 (+https://growth-operator.dev/bot)',
        },
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
            errors: ['Rate limited by Google Trends'],
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
          errors: [`Google Trends responded ${response.status}`],
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
        rateLimitState: { remaining: 100, resetAt: null },
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

export const googleTrendsConnector = new GoogleTrendsConnector();
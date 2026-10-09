import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redditConnector } from '../connectors/redditConnector';
import { googleTrendsConnector } from '../connectors/googleTrendsConnector';

// Regression tests for the fail-fast fetch behavior.
//
// Verified live failures (this machine, real providers):
// - www.reddit.com/.../hot.json -> HTTP 403; old.reddit.com answers 200 but
//   serves an HTML interstitial ("Welcome to Reddit"), never JSON posts.
// - trends.google.com widgetdata CSV -> HTTP 400 with an HTML error page.
//
// Before the fix, definitive refusals were retried with exponential backoff
// (and HTML pages were fed to response.json()), so a blocked source took
// tens of seconds to report and the live probe timed out instead of failing
// with the provider's exact reason. These tests pin the new contract using
// stubbed fetch: definitive statuses fail immediately with honest errors,
// transient ones (429, network errors) keep their retry budget.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function htmlResponse(status: number): Response {
  return new Response('<html><body>blocked</body></html>', {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

const REDDIT_POSTS = {
  data: {
    children: [
      {
        data: {
          id: 'abc123',
          title: 'How do I test this?',
          selftext: 'body here',
          author: 'someone',
          created_utc: 1759000000,
          permalink: '/r/testsub/comments/abc123/how_do_i_test_this/',
          subreddit: 'testsub',
          score: 10,
          num_comments: 2,
          upvote_ratio: 0.9,
          is_self: true,
          link_flair_text: null,
        },
      },
    ],
  },
};

describe('Reddit fail-fast fetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails fast with the exact 403 when www refuses and the fallback serves HTML, not JSON', async () => {
    const stub = vi.mocked(fetch);
    stub.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('www.reddit.com')) return htmlResponse(403);
      return htmlResponse(200); // old.reddit interstitial: 200, text/html
    });

    await expect(
      redditConnector.fetchRecentItems({}, 5, { subreddits: ['testsub'] }),
    ).rejects.toThrow(/403|content-type/i);
    // Exactly 2 requests: www once + one fallback attempt. No backoff storm.
    expect(stub).toHaveBeenCalledTimes(2);
  });

  it('does not retry or fall back on a definitive 404', async () => {
    const stub = vi.mocked(fetch);
    stub.mockImplementation(async () => htmlResponse(404));

    await expect(
      redditConnector.fetchRecentItems({}, 5, { subreddits: ['nosuchsubreddit'] }),
    ).rejects.toThrow(/404/);
    // A 404 fails identically on both hosts, so no fallback attempt either.
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('still parses real JSON posts with source timestamps intact', async () => {
    vi.mocked(fetch).mockImplementation(async () => jsonResponse(REDDIT_POSTS));

    const items = await redditConnector.fetchRecentItems({}, 5, { subreddits: ['testsub'] });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('How do I test this?');
    expect(items[0].publishedAt).toEqual(new Date(1759000000 * 1000));
  });
});

describe('Google Trends fail-fast fetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fails immediately on HTTP 400 without retrying the identical request', async () => {
    const stub = vi.mocked(fetch);
    stub.mockImplementation(async () => htmlResponse(400));

    await expect(
      googleTrendsConnector.fetchRecentItems({}, 5, { topics: ['AI'] }),
    ).rejects.toThrow(/400/);
    // related + interest endpoints, one attempt each. No backoff retries.
    expect(stub).toHaveBeenCalledTimes(2);
  });

  it('keeps the 429 retry budget and reports RATE_LIMITED honestly', async () => {
    const stub = vi.mocked(fetch);
    stub.mockImplementation(async () => new Response('rate limited', { status: 429 }));

    await expect(
      googleTrendsConnector.fetchRecentItems({}, 5, { topics: ['AI'] }),
    ).rejects.toThrow(/RATE_LIMITED|429/);
    // Initial attempts + retries: more than one call per endpoint.
    expect(stub.mock.calls.length).toBeGreaterThan(2);
  }, 60000);

  it('leaves related-query rows timestamped null (no source time) and keeps CSV dates on interest rows', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('relatedsearches')) {
        return new Response('TOP,vibe coding,Breakout\nRISING,ai agents,120\n', {
          status: 200,
          headers: { 'Content-Type': 'text/csv' },
        });
      }
      return new Response('date,value\n2026-10-01,42\n', {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
      });
    });

    const items = await googleTrendsConnector.fetchRecentItems({}, 10, { topics: ['AI'] });
    const related = items.filter((i) => String(i.externalId).startsWith('trends-AI-'));
    const interest = items.filter((i) => String(i.externalId).startsWith('trends-interest-'));
    expect(related.length).toBeGreaterThan(0);
    for (const row of related) expect(row.publishedAt).toBeNull();
    expect(interest).toHaveLength(1);
    expect(interest[0].publishedAt).toEqual(new Date('2026-10-01'));
  });
});

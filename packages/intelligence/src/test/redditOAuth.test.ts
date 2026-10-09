import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { redditConnector, resetRedditAppTokenForTests } from '../connectors/redditConnector';

// Reddit app-only OAuth (script-type app, grant_type=client_credentials)
// per the official Reddit OAuth2 documentation: token POST to
// www.reddit.com/api/v1/access_token with HTTP Basic auth, reads against
// https://oauth.reddit.com with a bearer token. Tokens live ~1 hour and
// app-only grants receive no refresh token, so the connector caches the
// token and re-acquires on a 401, exactly once.
//
// All network here is stubbed: these are contract tests, not live-access
// proof. No live credentials exist in this environment (NEEDS_CREDENTIALS).

const CREDS = { clientId: 'test-client-id', clientSecret: 'test-client-s3cr3t' };

function tokenResponse(token = 'app-token-abc', expiresIn = 3600): Response {
  return new Response(JSON.stringify({ access_token: token, token_type: 'bearer', expires_in: expiresIn }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function listingResponse(posts: unknown[] = []): Response {
  return new Response(JSON.stringify({ data: { children: posts } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function post(id: string, createdUtc: number) {
  return {
    data: {
      id,
      title: `Question about ${id}?`,
      selftext: 'details here',
      author: 'someone',
      created_utc: createdUtc,
      permalink: `/r/testsub/comments/${id}/q/`,
      subreddit: 'testsub',
      score: 5,
      num_comments: 1,
      upvote_ratio: 0.9,
      is_self: true,
      link_flair_text: null,
    },
  };
}

function tokenCalls(stub: ReturnType<typeof vi.mocked<typeof fetch>>): string[] {
  return stub.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/access_token'));
}

describe('Reddit app-only OAuth (stubbed network)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    resetRedditAppTokenForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('acquires a token with Basic auth and reads listings from oauth.reddit.com', async () => {
    const stub = vi.mocked(fetch);
    stub.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/access_token')) {
        expect((init?.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
        expect(String(init?.body)).toContain('grant_type=client_credentials');
        return tokenResponse();
      }
      expect(url.startsWith('https://oauth.reddit.com/')).toBe(true);
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer app-token-abc');
      return listingResponse([post('a1', 1759000000)]);
    });

    const items = await redditConnector.fetchRecentItems(CREDS, 5, { subreddits: ['testsub'] });
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://reddit.com/r/testsub/comments/a1/q/');
    expect(items[0].publishedAt).toEqual(new Date(1759000000 * 1000));
    expect(tokenCalls(stub)).toHaveLength(1);
  });

  it('rejects invalid app credentials immediately without touching listings', async () => {
    const stub = vi.mocked(fetch);
    stub.mockImplementation(async () => new Response('{}', { status: 401 }));

    await expect(redditConnector.fetchRecentItems(CREDS, 5, { subreddits: ['testsub'] })).rejects.toThrow(
      /credentials rejected/i,
    );
    expect(stub).toHaveBeenCalledTimes(1);
  });

  it('fails honestly on a malformed token response', async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      new Response(JSON.stringify({ token_type: 'bearer' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(redditConnector.fetchRecentItems(CREDS, 5, { subreddits: ['testsub'] })).rejects.toThrow(
      /no access token/i,
    );
  });

  it('re-acquires once on a listing 401 and then succeeds', async () => {
    const stub = vi.mocked(fetch);
    let listings = 0;
    stub.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/access_token')) return tokenResponse(`tok-${tokenCalls(stub).length}`);
      listings += 1;
      if (listings === 1) return new Response('{}', { status: 401 });
      return listingResponse([post('b2', 1759000100)]);
    });

    const items = await redditConnector.fetchRecentItems(CREDS, 5, { subreddits: ['testsub'] });
    expect(items).toHaveLength(1);
    expect(tokenCalls(stub)).toHaveLength(2);
  });

  it('stops after a second 401 instead of retry-storming', async () => {
    const stub = vi.mocked(fetch);
    stub.mockImplementation(async (input) => {
      if (String(input).includes('/access_token')) return tokenResponse();
      return new Response('{}', { status: 401 });
    });

    await expect(redditConnector.fetchRecentItems(CREDS, 5, { subreddits: ['testsub'] })).rejects.toThrow(
      /401/,
    );
    // token, listing, token, listing — then stop.
    expect(stub).toHaveBeenCalledTimes(4);
  });

  it('never leaks the client secret or bearer token in thrown errors', async () => {
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes('/access_token')) return new Response('{}', { status: 401 });
      return listingResponse([]);
    });

    const failure = await redditConnector
      .fetchRecentItems(CREDS, 5, { subreddits: ['testsub'] })
      .then(() => '', (e: unknown) => (e instanceof Error ? e.message + (e.stack ?? '') : String(e)));
    expect(failure).not.toContain('test-client-s3cr3t');
    expect(failure).not.toContain('app-token');
  });
});

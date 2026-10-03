import { describe, it, expect } from 'vitest';
import {
  ConnectorError,
  SOCIAL_PLATFORMS,
  allSocialAdapters,
  extractHashtags,
  getSocialAdapter,
} from './index';
import { extractHook, summarizeItems } from './insights';
import type { SocialItem } from './index';

describe('social connector honesty', () => {
  it('exposes exactly five isolated adapters', () => {
    expect(SOCIAL_PLATFORMS).toEqual(['instagram', 'facebook', 'linkedin', 'youtube', 'x']);
    expect(allSocialAdapters()).toHaveLength(5);
    for (const platform of SOCIAL_PLATFORMS) {
      expect(getSocialAdapter(platform).platform).toBe(platform);
    }
  });

  it('every adapter declares read-only scopes and honest limitations', () => {
    for (const adapter of allSocialAdapters()) {
      const caps = adapter.capabilities();
      expect(caps.provides.length).toBeGreaterThan(0);
      expect(caps.limitations.length).toBeGreaterThan(0);
      expect(caps.scopes.length).toBeGreaterThan(0);
      // The provides list must never promise engagement data...
      expect(caps.provides.join(' ').toLowerCase()).not.toMatch(
        /engagement|reach|likes|followers|views|impressions/,
      );
      // ...while the limitations list must explicitly deny it.
      expect(caps.limitations.join(' ').toLowerCase()).toMatch(/never/);
    }
  });

  it('reports NOT_CONFIGURED before any network call when credentials are missing', () => {
    for (const adapter of allSocialAdapters()) {
      try {
        adapter.authorizationUrl(
          { clientId: '', clientSecret: '', redirectUri: 'http://localhost/cb' },
          'state',
        );
        expect.unreachable(`adapter ${adapter.platform} did not throw`);
      } catch (err) {
        expect(err).toBeInstanceOf(ConnectorError);
        expect((err as ConnectorError).kind).toBe('NOT_CONFIGURED');
      }
    }
  });

  it('LinkedIn requests OIDC-minimal scopes and nothing restricted', () => {
    const linkedin = getSocialAdapter('linkedin');
    const url = linkedin.authorizationUrl(
      { clientId: 'CID', clientSecret: 'CSEC', redirectUri: 'http://localhost:3001/api/v1/social/callback/linkedin' },
      's1',
    );
    const scope = new URL(url).searchParams.get('scope') ?? '';
    const scopes = scope.split(' ');
    expect(scopes).toContain('openid');
    expect(scopes).toContain('profile');
    expect(scopes).toContain('email');
    expect(url).not.toContain('r_member_social');
    expect(linkedin.capabilities().scopes).toEqual(['openid', 'profile', 'email']);
    expect(linkedin.capabilities().scopes).not.toContain('r_member_social');
    expect(linkedin.capabilities().scopes).not.toContain('w_member_social');
  });

  it('LinkedIn verifies identity without ever calling a post-reading endpoint', async () => {
    const linkedin = getSocialAdapter('linkedin');
    if (typeof linkedin.fetchAccountIdentity !== 'function') {
      expect.unreachable('LinkedIn adapter must verify account identity');
      return;
    }
    const calls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: unknown) => {
      const url = typeof input === 'string' ? input : String((input as { url?: unknown }).url ?? input);
      calls.push(url);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ sub: 'member-123', name: 'Ada Example', picture: 'https://example.com/p.jpg', email: 'ada@example.com' }),
      } as unknown as Response;
    }) as typeof fetch;
    try {
      const identity = await linkedin.fetchAccountIdentity('oidc-token');
      expect(identity).toEqual({
        id: 'member-123',
        name: 'Ada Example',
        picture: 'https://example.com/p.jpg',
        email: 'ada@example.com',
      });
      // Exactly one network call, to the identity endpoint only.
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain('/v2/userinfo');
      expect(calls.join(' ')).not.toContain('ugcPosts');

      // A pull verifies the grant (identity check) and honestly yields zero
      // items instead of attempting post reads.
      const items = await linkedin.fetchRecentItems('oidc-token', 10);
      expect(items).toEqual([]);
      expect(calls.filter((u) => u.includes('ugcPosts'))).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('extracts hooks verbatim from real items only', () => {
    expect(extractHook({ text: '  \nFirst line here\nsecond', title: null })).toBe('First line here');
    expect(extractHook({ text: null, title: null })).toBeNull();
    const long = 'x'.repeat(200);
    expect(extractHook({ text: long, title: null })?.endsWith('…')).toBe(true);
  });

  it('summarizes only what items contain — zero items means zero patterns', () => {
    const empty = summarizeItems('youtube', []);
    expect(empty.itemCount).toBe(0);
    expect(empty.hooks).toEqual([]);
    expect(empty.formats).toEqual([]);
    expect(empty.topHashtags).toEqual([]);

    const items: SocialItem[] = [
      {
        externalId: 'a',
        url: 'https://example.com/a',
        title: null,
        text: 'Ship weekly #buildinpublic\nmore',
        author: 'me',
        publishedAt: '2026-01-01T00:00:00Z',
        mediaKind: 'video',
        hashtags: extractHashtags('Ship weekly #buildinpublic'),
      },
      {
        externalId: 'b',
        url: null,
        title: 'Checklist post',
        text: null,
        author: 'me',
        publishedAt: null,
        mediaKind: 'post',
        hashtags: [],
      },
    ];
    const summary = summarizeItems('x', items);
    expect(summary.itemCount).toBe(2);
    expect(summary.hooks.map((h) => h.hook)).toEqual(['Ship weekly #buildinpublic', 'Checklist post']);
    expect(summary.hooks[0]?.sourceUrl).toBe('https://example.com/a');
    expect(summary.formats).toEqual([
      { kind: 'video', count: 1 },
      { kind: 'post', count: 1 },
    ]);
    expect(summary.topHashtags).toEqual([{ tag: 'buildinpublic', count: 1 }]);
  });
});

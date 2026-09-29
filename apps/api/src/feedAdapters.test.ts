import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from 'vitest';
import { promises as dnsPromises } from 'dns';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { runDailyLoop } from './worker/dailyRun';

// Hermetic DNS (see batch3E2E.test.ts): stub the resolver the SSRF guard uses.
beforeEach(() => {
  vi.spyOn(dnsPromises, 'resolve4').mockResolvedValue(['93.184.216.34']);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const stamp = Date.now();
const email = `hnfeed-${stamp}@example.com`;
const password = 'testpassword123';

let token = '';
let workspaceId = '';

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Workspace-ID': workspaceId });

function storyHtml(title: string, body: string): string {
  return `<html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${body}</p></article></body></html>`;
}

function stubFetch(handler: (url: string) => Response) {
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (input: unknown) => handler(String(input))));
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [email] });
});

describe('platform feed adapters in the daily loop', () => {
  beforeEach(async () => {
    if (!token) {
      await request(app).post('/api/v1/auth/register').send({ email, password, name: 'HN User' }).expect(201);
      const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
      token = login.body.token as string;
      const ws = await request(app)
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `HN WS ${stamp}` })
        .expect(201);
      workspaceId = (ws.body.workspace?.id ?? ws.body.id) as string;
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('expands an HN frontpage feed into story sources with provenance', async () => {
    await request(app).post('/api/v1/feeds').set(auth()).send({
      url: 'https://news.ycombinator.com/',
      type: 'hackernews',
      name: 'HN frontpage',
    }).expect(201);

    stubFetch((url) => {
      if (url.endsWith('/topstories.json')) return jsonResponse([901, 902]);
      if (url.endsWith('/item/901.json')) {
        return jsonResponse({ id: 901, title: 'Seeded HN story', url: `https://example.com/hn-seed-${stamp}`, time: 1759000000 });
      }
      if (url.endsWith('/item/902.json')) {
        return jsonResponse({ id: 902, title: 'Ask HN: seeded question', time: 1759000100 });
      }
      if (url.includes('example.com')) {
        return new Response(storyHtml('Seeded HN story', 'Seeded story body about founder checklists and onboarding workflows for software teams.'), {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url.includes('news.ycombinator.com/item')) {
        return new Response(storyHtml('Ask HN: seeded question', 'Seeded discussion body with enough words to extract.'), {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('not found', { status: 404 });
    });

    const result = await runDailyLoop(workspaceId, '2026-11-20');
    expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);
    const intel = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRun: { runDate: new Date('2026-11-20T00:00:00.000Z') }, stage: 'INTELLIGENCE' },
    });
    expect(intel?.status).toBe('SUCCEEDED');

    const feed = await prisma.feedSource.findFirst({ where: { workspaceId, type: 'HACKERNEWS' } });
    expect(feed?.lastError).toBeNull();
    expect(feed?.lastCursor).toContain('example.com');
    const sources = await prisma.intelligenceSource.findMany({ where: { workspaceId } });
    const urls = sources.map((s) => s.url);
    expect(urls).toContain(`https://example.com/hn-seed-${stamp}`);
  });

  it('failure-isolates an unreachable HN API without failing the run', async () => {
    stubFetch((url) => {
      if (url.includes('firebaseio.com')) throw new Error('network down');
      return new Response('not found', { status: 404 });
    });
    const result = await runDailyLoop(workspaceId, '2026-11-21');
    expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);
    const intel = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRun: { runDate: new Date('2026-11-21T00:00:00.000Z') }, stage: 'INTELLIGENCE' },
    });
    expect(intel?.status).toBe('SUCCEEDED');
    const feed = await prisma.feedSource.findFirst({ where: { workspaceId, type: 'HACKERNEWS' } });
    expect(feed?.lastError).toMatch(/network down|no stories/i);
  });

  it('resolves a GitHub repo URL without scraping', async () => {
    const { resolveReleaseFeedUrl } = await import('@growth-operator/intelligence');
    expect(resolveReleaseFeedUrl('https://github.com/microsoft/TypeScript')).toBe(
      'https://github.com/microsoft/TypeScript/releases.atom'
    );
  });
});

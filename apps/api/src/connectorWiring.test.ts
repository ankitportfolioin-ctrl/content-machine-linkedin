import { describe, it, expect, vi, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { connectorRegistry } from '@growth-operator/intelligence';
import { cleanupTestData } from './test/helpers';
import { runDailyLoop } from './worker/dailyRun';

const stamp = Date.now();
const email = `connwire-${stamp}@example.com`;
const password = 'testpassword123';

let token = '';
let workspaceId = '';

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Workspace-ID': workspaceId });

async function setupOnce(): Promise<void> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Conn Wire' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  token = login.body.token as string;
  const ws = await request(app)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Conn Wire WS ${stamp}` })
    .expect(201);
  workspaceId = (ws.body.workspace?.id ?? ws.body.id) as string;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [email] });
});

describe('Gate 1: FeedSource type honesty', () => {
  it('refuses connector-managed feed types with an honest explanation', async () => {
    await setupOnce();
    for (const type of ['reddit', 'youtube', 'google_trends', 'linkedin', 'x', 'instagram', 'tiktok']) {
      const res = await request(app)
        .post('/api/v1/feeds')
        .set(auth())
        .send({ url: `https://example.com/${type}-${stamp}`, type });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/research connector registry/i);
    }
    // Ordinary feed types keep working.
    await request(app)
      .post('/api/v1/feeds')
      .set(auth())
      .send({ url: `https://example.com/rss-${stamp}.xml`, type: 'rss', name: 'Honest RSS' })
      .expect(201);
  });

  it('refuses retargeting an existing feed onto a connector-managed type', async () => {
    const feed = await prisma.feedSource.findFirst({ where: { workspaceId, url: `https://example.com/rss-${stamp}.xml` } });
    expect(feed).toBeDefined();
    await request(app)
      .patch(`/api/v1/feeds/${feed!.id}`)
      .set(auth())
      .send({ type: 'youtube' })
      .expect(400);
    // Non-type updates (pause/resume) are unaffected.
    await request(app).patch(`/api/v1/feeds/${feed!.id}`).set(auth()).send({ active: false }).expect(200);
    await request(app).patch(`/api/v1/feeds/${feed!.id}`).set(auth()).send({ active: true }).expect(200);
  });
});

describe('Gate 1: connector registry runs once per intelligence cycle', () => {
  it('invokes fetchFromAllSources exactly once and isolates connector failures', async () => {
    // Fail-closed network: every external request 404s. AI hosts are never
    // reached here because no new documents exist to understand.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => new Response('unavailable', { status: 404 })),
    );
    const spy = vi.spyOn(connectorRegistry, 'fetchFromAllSources');

    const result = await runDailyLoop(workspaceId, '2026-12-01');
    expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);
    expect(spy).toHaveBeenCalledTimes(1);

    const row = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRun: { runDate: new Date('2026-12-01T00:00:00.000Z') }, stage: 'INTELLIGENCE' },
    });
    expect(row?.status).toBe('SUCCEEDED');
    // Stage notes persist on the row's error column (pre-existing shape).
    const evidence = String(row?.error ?? '');
    expect(evidence).toContain('Connector registry primed (REDDIT, GOOGLE_TRENDS, QUORA');
    expect(evidence).toContain('Connector errors:');
    expect(evidence).toMatch(/YouTube.*not configured|not configured.*YouTube/i);
    // Failure isolation: connector + feed failures never fail the stage.
    const counts = row?.counts as Record<string, number>;
    expect(counts.sourcesAttempted).toBe(1);
  });
});

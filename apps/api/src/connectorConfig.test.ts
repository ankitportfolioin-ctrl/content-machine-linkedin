import { describe, it, expect, vi, afterAll, afterEach, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import {
  CONNECTOR_CATALOGUE,
  WORKER_ELIGIBLE_SOURCE_TYPES,
  connectorRegistry,
  redditConnector,
} from '@growth-operator/intelligence';
import { cleanupTestData } from './test/helpers';
import { runDailyLoop } from './worker/dailyRun';
import { loadWorkspaceConnectorConfigs, buildWorkerFetchConfigs } from './services/workspaceConnectors';

const stamp = Date.now();
const emailA = `conncfg-a-${stamp}@example.com`;
const emailB = `conncfg-b-${stamp}@example.com`;
const password = 'testpassword123';

let tokenA = '';
let workspaceA = '';
let tokenB = '';
let workspaceB = '';

const authA = () => ({ Authorization: `Bearer ${tokenA}`, 'X-Workspace-ID': workspaceA });
const authB = () => ({ Authorization: `Bearer ${tokenB}`, 'X-Workspace-ID': workspaceB });

async function registerWorkspace(email: string, name: string) {
  await request(app).post('/api/v1/auth/register').send({ email, password, name }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  const ws = await request(app)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${login.body.token as string}`)
    .send({ name: `${name} WS ${stamp}` })
    .expect(201);
  return { token: login.body.token as string, workspaceId: (ws.body.workspace?.id ?? ws.body.id) as string };
}

beforeAll(async () => {
  const a = await registerWorkspace(emailA, 'ConnCfg A');
  tokenA = a.token;
  workspaceA = a.workspaceId;
  const b = await registerWorkspace(emailB, 'ConnCfg B');
  tokenB = b.token;
  workspaceB = b.workspaceId;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceA, workspaceB], userEmails: [emailA, emailB] });
});

describe('Connector catalogue (user-visible truth)', () => {
  it('lists every supported research connector with separated states', async () => {
    const res = await request(app).get('/api/v1/connectors').set(authA()).expect(200);
    const types = (res.body.connectors as Array<{ sourceType: string }>).map((c) => c.sourceType).sort();
    expect(types).toEqual(
      ['FACEBOOK', 'GOOGLE_TRENDS', 'INSTAGRAM', 'LINKEDIN', 'QUORA', 'REDDIT', 'TIKTOK', 'X', 'YOUTUBE'].sort(),
    );
    for (const c of res.body.connectors as Array<Record<string, unknown>>) {
      // Separated states — never one overloaded status.
      expect(c).toHaveProperty('enabledState');
      expect(c).toHaveProperty('configState');
      expect(c).toHaveProperty('accountState');
      expect(c).toHaveProperty('workerWillRun');
      expect(c).toHaveProperty('workerEligible');
      expect(c).toHaveProperty('sourceOfTruth');
      expect(typeof c.sourceOfTruth).toBe('string');
      expect((c.sourceOfTruth as string).length).toBeGreaterThan(0);
    }
  });

  it('fresh workspaces start with everything disabled (missing row == DISABLED)', async () => {
    const res = await request(app).get('/api/v1/connectors').set(authA()).expect(200);
    for (const c of res.body.connectors as Array<{ enabled: boolean; workerWillRun: boolean; enabledState: string }>) {
      expect(c.enabled).toBe(false);
      expect(c.enabledState).toBe('DISABLED');
      expect(c.workerWillRun).toBe(false);
    }
  });
});

describe('Workspace connector configuration (persisted, isolated)', () => {
  it('persists Reddit config per workspace and reflects it back', async () => {
    const put = await request(app)
      .put('/api/v1/connectors/REDDIT')
      .set(authA())
      .send({ enabled: true, config: { subreddits: ['artificial', 'programming'], timeFilter: 'week', sortBy: 'top' } })
      .expect(200);
    expect(put.body.connector.enabled).toBe(true);
    expect(put.body.connector.config).toMatchObject({ timeFilter: 'week', sortBy: 'top' });

    const get = await request(app).get('/api/v1/connectors').set(authA()).expect(200);
    const reddit = (get.body.connectors as Array<Record<string, unknown>>).find((c) => c.sourceType === 'REDDIT') as {
      enabled: boolean;
      workerWillRun: boolean;
      config: Record<string, unknown>;
    };
    expect(reddit.enabled).toBe(true);
    expect(reddit.workerWillRun).toBe(true);
    expect(reddit.config).toMatchObject({ subreddits: ['artificial', 'programming'] });
  });

  it('rejects invalid Reddit config without storing anything', async () => {
    await request(app)
      .put('/api/v1/connectors/REDDIT')
      .set(authB())
      .send({ enabled: true, config: { subreddits: [], sortBy: 'nope' } })
      .expect(400);
    const row = await prisma.workspaceConnector.findUnique({
      where: { workspaceId_sourceType: { workspaceId: workspaceB, sourceType: 'REDDIT' } },
    });
    expect(row).toBeNull();
  });

  it('rejects feed-owned types with a pointer to feed sources', async () => {
    for (const t of ['RSS', 'HACKERNEWS', 'GITHUB_RELEASES']) {
      const res = await request(app).put(`/api/v1/connectors/${t}`).set(authA()).send({ enabled: true, config: {} });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/feed source/i);
    }
    expect(await prisma.workspaceConnector.findMany({ where: { workspaceId: workspaceA, sourceType: { in: ['RSS', 'HACKERNEWS', 'GITHUB_RELEASES'] } } })).toEqual([]);
  });

  it('rejects Quora unconditionally (UNAVAILABLE) and TikTok enable (BLOCKED)', async () => {
    const quora = await request(app).put('/api/v1/connectors/QUORA').set(authA()).send({ enabled: true, config: {} });
    expect(quora.status).toBe(409);
    expect(JSON.stringify(quora.body)).toMatch(/UNAVAILABLE/i);
    const tiktok = await request(app).put('/api/v1/connectors/TIKTOK').set(authA()).send({ enabled: true, config: {} });
    expect(tiktok.status).toBe(409);
    expect(JSON.stringify(tiktok.body)).toMatch(/not yet connectable/i);
    // Nothing persisted for either.
    expect(
      await prisma.workspaceConnector.findMany({
        where: { workspaceId: workspaceA, sourceType: { in: ['QUORA', 'TIKTOK'] } },
      }),
    ).toEqual([]);
  });

  it('keeps workspace B isolated from workspace A configuration', async () => {
    // A enabled Reddit above; B must still show disabled and stay runnable-off.
    const get = await request(app).get('/api/v1/connectors').set(authB()).expect(200);
    const reddit = (get.body.connectors as Array<{ sourceType: string; enabled: boolean; workerWillRun: boolean }>).find(
      (c) => c.sourceType === 'REDDIT',
    );
    expect(reddit?.enabled).toBe(false);
    expect(reddit?.workerWillRun).toBe(false);
  });
});

describe('No hidden execution (missing/disabled never runs)', () => {
  it('never calls the registry when no connector is enabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('nope', { status: 500 })));
    const spyFetch = vi.spyOn(connectorRegistry, 'fetchFromAllSources');
    const spyReddit = vi.spyOn(redditConnector, 'fetchRecentItems');
    const result = await runDailyLoop(workspaceB, '2026-12-02');
    expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);
    expect(spyFetch).not.toHaveBeenCalled();
    expect(spyReddit).not.toHaveBeenCalled();
    const row = await prisma.runStage.findFirst({
      where: { workspaceId: workspaceB, dailyRun: { runDate: new Date('2026-12-02T00:00:00.000Z') }, stage: 'INTELLIGENCE' },
    });
    expect(String(row?.error ?? '')).toMatch(/nothing to fetch|all disabled/i);
  });

  it('executes an enabled connector exactly once per cycle with honest errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('unavailable', { status: 404 })));
    const spy = vi.spyOn(connectorRegistry, 'fetchFromAllSources');
    // Workspace A enabled REDDIT earlier in this file.
    const result = await runDailyLoop(workspaceA, '2026-12-03');
    expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);
    expect(spy).toHaveBeenCalledTimes(1);
    const row = await prisma.runStage.findFirst({
      where: { workspaceId: workspaceA, dailyRun: { runDate: new Date('2026-12-03T00:00:00.000Z') }, stage: 'INTELLIGENCE' },
    });
    const evidence = String(row?.error ?? '');
    expect(evidence).toContain('Workspace connectors enabled: REDDIT');
    expect(evidence).toMatch(/REDDIT|Reddit/);
  });

  it('research trigger honors persisted config and reports honestly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response('unavailable', { status: 404 })));
    // B has nothing enabled: zero discovered, zero hidden errors.
    const off = await request(app).post('/api/v1/intelligence/research/trigger').set(authB()).send({ limit: 5 }).expect(201);
    expect(off.body.trigger.discovered).toBe(0);
    expect(off.body.trigger.connectorErrors).toEqual([]);
    // A has REDDIT enabled: attempt happens, failure surfaces honestly.
    const on = await request(app).post('/api/v1/intelligence/research/trigger').set(authA()).send({ limit: 5 }).expect(201);
    expect(on.body.trigger.connectorErrors.length).toBeGreaterThan(0);
    expect(JSON.stringify(on.body.trigger.connectorErrors)).toMatch(/Reddit/i);
  });
});

describe('Catalogue/runtime invariant (claims == capability)', () => {
  it('worker-eligible catalogue entries are exactly the executable set', async () => {
    const eligible = CONNECTOR_CATALOGUE.filter((e) => e.workerEligible).map((e) => e.sourceType).sort();
    expect(eligible).toEqual([...WORKER_ELIGIBLE_SOURCE_TYPES].sort());
    expect(eligible).toEqual(['GOOGLE_TRENDS', 'REDDIT', 'YOUTUBE']);
    const res = await request(app).get('/api/v1/connectors').set(authA()).expect(200);
    for (const c of res.body.connectors as Array<{ sourceType: string; workerEligible: boolean; notWiredReason: unknown }>) {
      const inSet = (WORKER_ELIGIBLE_SOURCE_TYPES as readonly string[]).includes(c.sourceType);
      expect(c.workerEligible).toBe(inSet);
      if (!inSet) expect(c.notWiredReason).toBeTruthy();
    }
  });

  it('non-executable entries can never be enabled into execution', async () => {
    // LINKEDIN/X/INSTAGRAM/FACEBOOK rows may exist as enabled, but the
    // worker must still never call their fetch methods.
    await request(app).put('/api/v1/connectors/LINKEDIN').set(authB()).send({ enabled: true, config: {} }).expect(200);
    const persisted = await loadWorkspaceConnectorConfigs(workspaceB);
    const { fetchConfigs, skipped } = buildWorkerFetchConfigs(persisted);
    expect(fetchConfigs.LINKEDIN).toBeUndefined();
    expect(skipped.some((s: { sourceType: string }) => s.sourceType === 'LINKEDIN')).toBe(true);
    expect(Object.keys(fetchConfigs).every((k) => (WORKER_ELIGIBLE_SOURCE_TYPES as readonly string[]).includes(k))).toBe(true);
  });
});

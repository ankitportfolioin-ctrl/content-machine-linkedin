import { describe, it, expect, afterAll, vi, afterEach } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { cleanupTestData } from './test/helpers';
import { runDailyLoop } from './worker/dailyRun';
import { resolveDueRuns } from './worker/tick';
import { STAGES } from './worker/stages';

const stamp = Date.now();
const ownerEmailA = `faults-a-${stamp}@example.com`;
const ownerEmailB = `faults-b-${stamp}@example.com`;
const password = 'testpassword123';

let workspaceA = '';
let workspaceB = '';

async function registerWorkspace(email: string, wsName: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Faults User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  const created = await request(app)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${login.body.token as string}`)
    .send({ name: wsName })
    .expect(201);
  return (created.body.workspace?.id ?? created.body.id) as string;
}

function fakeBoss() {
  const sent: Array<{ queue: string; data: { workspaceId: string; runDate: string }; opts: Record<string, unknown> }> = [];
  return {
    sent,
    boss: {
      send: async (queue: string, data: { workspaceId: string; runDate: string }, opts: Record<string, unknown>) => {
        sent.push({ queue, data, opts });
        return 'job-1';
      },
    } as never,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Step G: loop fault injection', () => {
  it('sets up two isolated workspaces', async () => {
    workspaceA = await registerWorkspace(ownerEmailA, `Faults WS A ${stamp}`);
    workspaceB = await registerWorkspace(ownerEmailB, `Faults WS B ${stamp}`);
    expect(workspaceB).not.toBe(workspaceA);
  });

  it('a throwing stage is recorded FAILED without blocking later stages', async () => {
    // Fault is injected on the plain STAGES record (safe under vite SSR).
    // Spying on Prisma delegates is NOT done: mockRestore permanently
    // breaks their lazy getters (observed: ".count is not a function").
    const spy = vi.spyOn(STAGES, 'APPROVAL_SNAPSHOT').mockRejectedValueOnce(new Error('simulated outage'));
    try {
      const result = await runDailyLoop(workspaceA, '2026-10-01');
      expect(result.status).toBe('COMPLETED_WITH_FAILURES');

      const snapshot = await prisma.runStage.findFirst({
        where: { workspaceId: workspaceA, dailyRun: { runDate: new Date('2026-10-01T00:00:00.000Z') }, stage: 'APPROVAL_SNAPSHOT' },
      });
      expect(snapshot?.status).toBe('FAILED');
      expect(snapshot?.error ?? '').toMatch(/simulated outage/);

      // Later independent stages still ran to completion.
      const digest = await prisma.runStage.findFirst({
        where: { workspaceId: workspaceA, dailyRun: { runDate: new Date('2026-10-01T00:00:00.000Z') }, stage: 'DIGEST' },
      });
      expect(digest?.status).toBe('SUCCEEDED');
      const execution = await prisma.runStage.findFirst({
        where: { workspaceId: workspaceA, dailyRun: { runDate: new Date('2026-10-01T00:00:00.000Z') }, stage: 'EXECUTION' },
      });
      expect(execution?.status).toBe('SKIPPED');
    } finally {
      spy.mockRestore();
    }
  });

  it('a crashed run resumes only its missing stages', async () => {
    const first = await runDailyLoop(workspaceA, '2026-10-02');
    expect(first.status).toBe('COMPLETED');

    // Simulate a crash after 6 of 8 stages: drop two rows, rewind status.
    await prisma.runStage.deleteMany({
      where: { dailyRunId: first.runId, stage: { in: ['OBSERVE_LEARN', 'DIGEST'] } },
    });
    await prisma.dailyRun.update({
      where: { id: first.runId },
      data: { status: 'RUNNING', finishedAt: null },
    });

    const second = await runDailyLoop(workspaceA, '2026-10-02');
    expect(second.runId).toBe(first.runId);
    expect(second.resumed).toBe(true);
    expect(second.status).toBe('COMPLETED');
    const stageCount = await prisma.runStage.count({ where: { dailyRunId: first.runId } });
    expect(stageCount).toBe(8);
  });

  it('zero preparation budget prepares nothing but still succeeds honestly', async () => {
    const topic = await prisma.topic.create({
      data: { workspaceId: workspaceA, name: `Faults topic ${stamp}`, canonicalName: `faults-topic-${stamp}` },
    });
    await prisma.contentOpportunity.create({
      data: {
        workspaceId: workspaceA,
        topicId: topic.id,
        title: `Faults opportunity ${stamp}`,
        thesis: 'T.',
        problem: 'P.',
        audience: 'A.',
        angle: 'Practical.',
        objective: 'TEACH_PRACTICAL',
        opportunityScore: 7,
        status: 'NEW',
        sourceIds: [],
        claimIds: [],
        trendSignalIds: [],
        reasoning: 'Seeded.',
        evidenceSummary: 'Seeded.',
      },
    });
    await prisma.lead.create({
      data: {
        workspaceId: workspaceA,
        linkedinUrl: `https://linkedin.com/in/faults-lead-${stamp}`,
        name: 'Faults Lead',
      },
    });
    await prisma.workspaceSettings.upsert({
      where: { workspaceId: workspaceA },
      create: { workspaceId: workspaceA, dailyPreparationCap: 0 },
      update: { dailyPreparationCap: 0 },
    });

    const result = await runDailyLoop(workspaceA, '2026-10-03');
    expect(result.status).toBe('COMPLETED');
    const rows = await prisma.runStage.findMany({
      where: { workspaceId: workspaceA, dailyRun: { runDate: new Date('2026-10-03T00:00:00.000Z') } },
    });
    const byName = new Map(rows.map((r) => [r.stage, r]));
    expect((byName.get('CONTENT')?.counts as Record<string, number>).ideasCreated).toBe(0);
    expect((byName.get('SALES')?.counts as Record<string, number>).researched).toBe(0);
    expect(`${byName.get('CONTENT')?.error ?? ''} ${byName.get('SALES')?.error ?? ''}`).toMatch(/budget/i);

    await prisma.workspaceSettings.update({
      where: { workspaceId: workspaceA },
      data: { dailyPreparationCap: 20 },
    });
  });

  it('tick enqueues due workspaces with idempotency keys, skips the rest', async () => {
    await prisma.workspaceSettings.upsert({
      where: { workspaceId: workspaceA },
      create: { workspaceId: workspaceA, timezone: 'UTC', dailyRunTime: '00:00' },
      update: { timezone: 'UTC', dailyRunTime: '00:00' },
    });
    await prisma.workspaceSettings.upsert({
      where: { workspaceId: workspaceB },
      create: { workspaceId: workspaceB, timezone: 'UTC', dailyRunTime: '23:00' },
      update: { timezone: 'UTC', dailyRunTime: '23:00' },
    });
    const { sent, boss } = fakeBoss();
    const result = await resolveDueRuns(boss, new Date('2026-10-10T12:00:00.000Z'));

    expect(result.checked).toBeGreaterThanOrEqual(2);
    const forA = sent.filter((s) => s.data.workspaceId === workspaceA);
    const forB = sent.filter((s) => s.data.workspaceId === workspaceB);
    // A is due (00:00 passed at 12:00 UTC), B is not (23:00 not reached).
    // A also carries earlier runs in this file, so the capped backfill may
    // add at most one extra send (2026-10-09) alongside today.
    const datesA = forA.map((s) => s.data.runDate).sort();
    expect(datesA).toContain('2026-10-10');
    expect(datesA.length).toBeLessThanOrEqual(2);
    if (datesA.length === 2) expect(datesA).toEqual(['2026-10-09', '2026-10-10']);
    const todaySend = forA.find((s) => s.data.runDate === '2026-10-10');
    expect(todaySend?.opts.singletonKey).toBe(`${workspaceA}:2026-10-10`);
    expect(forB).toHaveLength(0);
  });

  it('tick backfills at most one missed day without flooding', async () => {
    // B: last run 3 days ago, due time reached -> today + single backfill.
    await prisma.dailyRun.create({
      data: { workspaceId: workspaceB, runDate: new Date('2026-10-07T00:00:00.000Z'), status: 'COMPLETED' },
    });
    await prisma.workspaceSettings.update({
      where: { workspaceId: workspaceB },
      data: { dailyRunTime: '00:00' },
    });
    const { sent, boss } = fakeBoss();
    await resolveDueRuns(boss, new Date('2026-10-10T12:00:00.000Z'));
    const forB = sent
      .filter((s) => s.data.workspaceId === workspaceB)
      .map((s) => s.data.runDate)
      .sort();
    expect(forB).toEqual(['2026-10-09', '2026-10-10']);
  });

  it('full loops stay isolated across both workspaces', async () => {
    const a = await runDailyLoop(workspaceA, '2026-10-11');
    const b = await runDailyLoop(workspaceB, '2026-10-11');
    expect(a.status).toBe('COMPLETED');
    expect(b.status).toBe('COMPLETED');

    const [runsA, runsB, stagesA, stagesB] = await Promise.all([
      prisma.dailyRun.count({ where: { workspaceId: workspaceA, runDate: new Date('2026-10-11T00:00:00.000Z') } }),
      prisma.dailyRun.count({ where: { workspaceId: workspaceB, runDate: new Date('2026-10-11T00:00:00.000Z') } }),
      prisma.runStage.count({ where: { workspaceId: workspaceA, dailyRun: { runDate: new Date('2026-10-11T00:00:00.000Z') } } }),
      prisma.runStage.count({ where: { workspaceId: workspaceB, dailyRun: { runDate: new Date('2026-10-11T00:00:00.000Z') } } }),
    ]);
    expect(runsA).toBe(1);
    expect(runsB).toBe(1);
    expect(stagesA).toBe(8);
    expect(stagesB).toBe(8);

    const leakedIdeas = await prisma.contentIdea.count({
      where: { workspaceId: workspaceB, thesis: 'T.' },
    });
    expect(leakedIdeas).toBe(0);
  });
});

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceA, workspaceB], userEmails: [ownerEmailA, ownerEmailB] });
});

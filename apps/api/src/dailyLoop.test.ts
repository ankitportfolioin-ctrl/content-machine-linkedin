import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { cleanupTestData } from './test/helpers';
import { runDailyLoop } from './worker/dailyRun';
import { RunBudget } from './worker/budget';

const stamp = Date.now();
const ownerEmailA = `loop-owner-a-${stamp}@example.com`;
const ownerEmailB = `loop-owner-b-${stamp}@example.com`;
const password = 'testpassword123';

let workspaceA = '';
let workspaceB = '';

async function registerWorkspace(email: string, wsName: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Loop User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  const created = await request(app)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${login.body.token as string}`)
    .send({ name: wsName })
    .expect(201);
  return (created.body.workspace?.id ?? created.body.id) as string;
}

describe('Step C: daily loop foundation', () => {
  it('sets up two isolated workspaces', async () => {
    workspaceA = await registerWorkspace(ownerEmailA, `Loop WS A ${stamp}`);
    workspaceB = await registerWorkspace(ownerEmailB, `Loop WS B ${stamp}`);
    expect(workspaceA).toBeDefined();
    expect(workspaceB).not.toBe(workspaceA);
  });

  it('runs all 8 stages and records a RunLog', async () => {
    const result = await runDailyLoop(workspaceA);
    expect(result.status).toBe('COMPLETED');
    expect(result.resumed).toBe(false);
    expect(result.stages).toHaveLength(8);

    const run = await prisma.dailyRun.findUnique({
      where: { id: result.runId },
      include: { stages: true },
    });
    expect(run?.workspaceId).toBe(workspaceA);
    const byName = new Map(run?.stages.map((s) => [s.stage, s.status]));
    expect(byName.get('DECISION')).toBe('SUCCEEDED');
    expect(byName.get('EXECUTION')).toBe('SKIPPED');
    for (const s of run?.stages ?? []) {
      expect(s.durationMs).not.toBeNull();
    }
  });

  it('re-running the same day is idempotent (no duplicate runs or stages)', async () => {
    const first = await runDailyLoop(workspaceA);
    const second = await runDailyLoop(workspaceA);
    expect(second.runId).toBe(first.runId);
    expect(second.resumed).toBe(false);
    const stageCount = await prisma.runStage.count({ where: { dailyRunId: first.runId } });
    expect(stageCount).toBe(8);
    const runCount = await prisma.dailyRun.count({ where: { workspaceId: workspaceA } });
    expect(runCount).toBe(1);
  });

  it('EXECUTION never executes: always SKIPPED with a policy reason', async () => {
    const run = await prisma.dailyRun.findFirst({
      where: { workspaceId: workspaceA },
      include: { stages: true },
    });
    const exec = run?.stages.find((s) => s.stage === 'EXECUTION');
    expect(exec?.status).toBe('SKIPPED');
    expect(exec?.error ?? '').toMatch(/no execution integration/i);
  });

  it('kill switch blocks the run and records zero stages', async () => {
    await prisma.workspaceSettings.upsert({
      where: { workspaceId: workspaceB },
      create: { workspaceId: workspaceB, killSwitch: true },
      update: { killSwitch: true },
    });
    const result = await runDailyLoop(workspaceB);
    expect(result.status).toBe('SKIPPED_KILLED');
    expect(result.stages).toHaveLength(0);
  });

  it('pause blocks the run and records zero stages', async () => {
    await prisma.workspaceSettings.update({
      where: { workspaceId: workspaceB },
      data: { killSwitch: false, paused: true },
    });
    // Remove the killed run so the paused verdict is recorded fresh.
    await prisma.dailyRun.deleteMany({ where: { workspaceId: workspaceB } });
    const result = await runDailyLoop(workspaceB);
    expect(result.status).toBe('SKIPPED_PAUSED');
    expect(result.stages).toHaveLength(0);
  });

  it('workspace B has no stages from workspace A’s run (isolation)', async () => {
    const stagesB = await prisma.runStage.count({ where: { workspaceId: workspaceB } });
    expect(stagesB).toBe(0);
    const runsA = await prisma.dailyRun.count({ where: { workspaceId: workspaceA } });
    expect(runsA).toBe(1);
  });

  it('budget guard refuses spending past caps instead of inventing output', async () => {
    const budget = new RunBudget({ llmCalls: 1, fetches: 0, preparations: 2 });
    expect(budget.spendLlm()).toBe(true);
    expect(budget.spendLlm()).toBe(false);
    expect(budget.spendFetch()).toBe(false);
    expect(budget.spendPreparation(2)).toBe(true);
    expect(budget.spendPreparation()).toBe(false);
    expect(budget.remaining().exhausted).toEqual(
      expect.arrayContaining(['llmCalls', 'fetches', 'preparations'])
    );
  });
});

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceA, workspaceB], userEmails: [ownerEmailA, ownerEmailB] });
});

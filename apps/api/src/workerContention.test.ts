import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { createBoss } from '../src/worker/queue';
import { runDailyLoop } from '../src/worker/dailyRun';

// Release gate — concurrency safety under contention. pg-boss awards each job
// to exactly one worker (row-level claiming); idempotency keys and unique
// constraints make even a double delivery safe. These tests prove the claim
// behavior with two live workers plus parallel multi-workspace execution.
// All rows live in the dedicated TEST database.

const stamp = Date.now();
const ownerEmail = `contend-owner-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
const workspaceIds: string[] = [];

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Contend User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

async function makeWorkspace(name: string): Promise<string> {
  const created = await request(app)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name })
    .expect(201);
  return (created.body.workspace?.id ?? created.body.id) as string;
}

afterAll(async () => {
  await cleanupTestData({ workspaceIds, userEmails: [ownerEmail] });
});

describe('Release gate — worker claim contention and parallel cycles', () => {
  it('registers owner and creates isolated workspaces', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    for (const tag of ['a', 'b', 'c']) {
      workspaceIds.push(await makeWorkspace(`Contend WS ${tag} ${stamp}`));
    }
    expect(new Set(workspaceIds).size).toBe(3);
  });

  it('two workers racing one queue process the job exactly once', async () => {
    const ws = workspaceIds[0]!;
    const runDate = '2021-03-01';
    const queue = `test-claim-${stamp}`;
    const bossA = createBoss();
    const bossB = createBoss();
    let invocations = 0;
    try {
      await bossA.start();
      await bossB.start();
      await bossA.createQueue(queue);
      const handler = async (jobs: Array<{ data: { workspaceId: string; runDate: string } }>) => {
        for (const job of jobs) {
          invocations += 1;
          await runDailyLoop(job.data.workspaceId, job.data.runDate);
        }
      };
      await bossA.work(queue, handler);
      await bossB.work(queue, handler);

      const jobId = await bossA.send(queue, { workspaceId: ws, runDate });
      expect(jobId).not.toBeNull();

      const deadline = Date.now() + 25000;
      while (invocations === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(invocations).toBe(1);
      // Grace period: a second claimant would show up here.
      await new Promise((r) => setTimeout(r, 3000));
      expect(invocations).toBe(1);
      expect(await prisma.dailyRun.count({ where: { workspaceId: ws, runDate: new Date(`${runDate}T00:00:00.000Z`) } })).toBe(1);
    } finally {
      await bossA.stop().catch(() => undefined);
      await bossB.stop().catch(() => undefined);
    }
  }, 60000);

  it('parallel cycles across workspaces stay isolated and terminal', async () => {
    const results = await Promise.all(
      workspaceIds.map((ws, i) => runDailyLoop(ws, `2021-04-0${i + 1}`))
    );
    const runIds = new Set(results.map((r) => r.runId));
    expect(runIds.size).toBe(3);
    for (const r of results) {
      expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(r.status);
    }
    for (const [i, ws] of workspaceIds.entries()) {
      const stages = await prisma.runStage.findMany({
        where: { workspaceId: ws, dailyRunId: results[i]!.runId },
        select: { workspaceId: true },
      });
      expect(stages.length).toBe(8);
      expect(stages.every((s) => s.workspaceId === ws)).toBe(true);
    }
  }, 120000);
});

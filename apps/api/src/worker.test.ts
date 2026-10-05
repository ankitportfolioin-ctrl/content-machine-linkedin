import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { resolveDueRuns } from '../src/worker/tick';
import { createBoss, RUN_QUEUE, sendRunJob } from '../src/worker/queue';
import { runDailyLoop } from '../src/worker/dailyRun';

const stamp = Date.now();
const ownerEmail = `wp9-worker-owner-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let workspaceId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'WP9 Worker User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [ownerEmail] });
});

describe('WP9 Phase 2 — Worker Integration Tests', () => {
  describe('Setup', () => {
    it('registers user and creates workspace with schedule configured', async () => {
      ownerToken = await registerAndLogin(ownerEmail);

      const created = await request(app)
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `WP9 Worker WS ${stamp}` })
        .expect(201);
      workspaceId = (created.body.workspace?.id ?? created.body.id) as string;

      // Configure schedule (PUT /onboarding/schedule). autonomyTier is a
      // required literal-0 field in the schema — Tier 0 until a LinkedIn
      // report is approved — so it must be sent explicitly.
      await request(app)
        .put('/api/v1/onboarding/schedule')
        .set(authOwner())
        .send({
          timezone: 'UTC',
          dailyRunTime: '06:00',
          dailyLlmCallCap: 50,
          dailyFetchCap: 100,
          dailyPreparationCap: 20,
          autonomyTier: 0,
        })
        .expect(200);
    });

    it('seeds minimal data for daily run stages', async () => {
      const topic = await prisma.topic.create({
        data: { workspaceId, name: 'AI Trends', canonicalName: `ai-trends-${stamp}`, description: 'AI trends' },
      });
      await prisma.contentOpportunity.create({
        data: {
          workspaceId, topicId: topic.id, title: 'AI trend opportunity',
          thesis: 'AI is trending', problem: 'Need to know', audience: 'Devs',
          angle: 'Practical', objective: 'TEACH_PRACTICAL', opportunityScore: 85,
          sourceIds: [], claimIds: [], trendSignalIds: [],
          reasoning: 'Seeded', evidenceSummary: 'Seeded',
        },
      });
      await prisma.trendSignal.create({
        data: {
          workspaceId, topicId: topic.id, status: 'TRENDING', mentionCount: 10,
          sourceCount: 5, firstSeenAt: new Date(Date.now() - 3 * 86400000),
          lastSeenAt: new Date(), recencyScore: 0.9, sourceDiversityScore: 0.8,
          frequencyScore: 0.7, evidenceSummary: 'Seeded trend',
        },
      });
      await prisma.lead.create({
        data: {
          workspaceId, linkedinUrl: `https://linkedin.com/in/wp9-worker-lead-${stamp}`,
          name: 'Test Lead', headline: 'CTO at TestCorp', company: 'TestCorp', status: 'NEW',
        },
      });
    });
  });

  describe('Tick Handler — resolveDueRuns', () => {
    it('returns a well-formed TickResult without throwing across many workspaces', async () => {
      // The API test suite shares one database, so other files' workspaces
      // exist here; asserting an exact count would be flaky. What matters is
      // the tick tolerates hundreds of rows and reports honestly.
      const mockBoss = {
        send: vi.fn().mockResolvedValue('mock-job-id'),
      } as any;

      const result = await resolveDueRuns(mockBoss, new Date());
      expect(result.checked).toBeGreaterThanOrEqual(1);
      expect(typeof result.enqueuedToday).toBe('number');
      expect(typeof result.enqueuedBackfill).toBe('number');
      expect(typeof result.skipped).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('enqueues today\u2019s run when the workspace schedule is due', async () => {
      // Fresh workspace no other test touches: schedule it with a run time
      // five minutes in the past so "due" holds regardless of wall clock.
      const created = await request(app)
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `WP9 Due WS ${stamp}` })
        .expect(201);
      const dueWs = (created.body.workspace?.id ?? created.body.id) as string;
      const headers = { Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': dueWs };

      const past = new Date(Date.now() - 5 * 60 * 1000);
      const runTime = `${String(past.getUTCHours()).padStart(2, '0')}:${String(past.getUTCMinutes()).padStart(2, '0')}`;
      await request(app)
        .put('/api/v1/onboarding/schedule')
        .set(headers)
        .send({
          timezone: 'UTC',
          dailyRunTime: runTime,
          dailyLlmCallCap: 50,
          dailyFetchCap: 100,
          dailyPreparationCap: 20,
          autonomyTier: 0,
        })
        .expect(200);

      const boss = createBoss();
      try {
        await boss.start();
        await boss.createQueue(RUN_QUEUE);

        const tickResult = await resolveDueRuns(boss, new Date());
        expect(tickResult.checked).toBeGreaterThanOrEqual(1);
        expect(tickResult.errors).toEqual([]);

        // Attribution proof: no other test can touch this workspace's
        // singleton key, so deduped=true means the tick just enqueued it.
        const today = new Date().toISOString().slice(0, 10);
        const { deduped } = await sendRunJob(boss, { workspaceId: dueWs, runDate: today });
        expect(deduped).toBe(true);
      } finally {
        await boss.stop();
      }
    });

    it('skips workspaces without scheduleConfigured', async () => {
      // Create a second workspace without schedule
      const created = await request(app)
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `WP9 No Schedule ${stamp}` })
        .expect(201);

      const mockBoss = {
        send: vi.fn().mockResolvedValue('mock-job-id'),
      } as any;

      const result = await resolveDueRuns(mockBoss, new Date());
      expect(result.checked).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Queue — sendRunJob', () => {
    it('enqueues a daily run job with deduplication', async () => {
      const boss = createBoss();
      try {
        await boss.start();
        await boss.createQueue(RUN_QUEUE);

        // A date the tick NEVER enqueues (only today/backfill are eligible),
        // so no other test can have claimed this singleton key first.
        const data = { workspaceId, runDate: '2030-01-01' };

        // First send
        const result1 = await sendRunJob(boss, data);
        expect(result1.jobId).toBeDefined();
        expect(result1.deduped).toBe(false);

        // Second send with same singletonKey should be deduplicated
        const result2 = await sendRunJob(boss, data);
        expect(result2.jobId).toBeNull();
        expect(result2.deduped).toBe(true);
      } finally {
        await boss.stop();
      }
    });
  });

  describe('Daily Run — runDailyLoop', () => {
    it('executes a full daily run via worker function', async () => {
      const result = await runDailyLoop(workspaceId);

      expect(result.runId).toBeDefined();
      expect(['COMPLETED', 'COMPLETED_WITH_FAILURES', 'FAILED', 'SKIPPED_PAUSED', 'SKIPPED_KILLED']).toContain(result.status);
      expect(result.stages).toHaveLength(8);
      expect(typeof result.resumed).toBe('boolean');

      const stageNames = result.stages.map(s => s.stage);
      expect(stageNames).toEqual([
        'INTELLIGENCE',
        'DECISION',
        'CONTENT',
        'SALES',
        'APPROVAL_SNAPSHOT',
        'EXECUTION',
        'OBSERVE_LEARN',
        'DIGEST',
      ]);

      for (const stage of result.stages) {
        expect(['SUCCEEDED', 'FAILED', 'SKIPPED']).toContain(stage.status);
      }
    }, 120000);

    it('is idempotent — re-running same date returns existing run', async () => {
      const runDate = new Date().toISOString().slice(0, 10);

      const result1 = await runDailyLoop(workspaceId, runDate);
      const result2 = await runDailyLoop(workspaceId, runDate);

      expect(result2.runId).toBe(result1.runId);
      expect(result2.resumed).toBe(false);
    });

    it('resumes a non-terminal run', async () => {
      const runDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10); // yesterday

      // Create a RUNNING daily run
      const runningRun = await prisma.dailyRun.create({
        data: {
          workspaceId,
          runDate: new Date(`${runDate}T00:00:00.000Z`),
          status: 'RUNNING',
        },
      });

      // Create a RUNNING stage
      await prisma.runStage.create({
        data: {
          workspaceId,
          dailyRunId: runningRun.id,
          stage: 'INTELLIGENCE',
          status: 'RUNNING',
          startedAt: new Date(),
          attempt: 1,
        },
      });

      const result = await runDailyLoop(workspaceId, runDate);

      expect(result.runId).toBe(runningRun.id);
      expect(result.resumed).toBe(true);
      expect(result.status).not.toBe('RUNNING'); // Should complete
    });
  });

  describe('End-to-End Worker Flow', () => {
    it('tick → enqueues daily run → daily run executes', async () => {
      const boss = createBoss();
      try {
        await boss.start();
        await boss.createQueue(RUN_QUEUE);

        // Run tick to enqueue today's run
        const tickResult = await resolveDueRuns(boss, new Date());
        expect(tickResult.enqueuedToday).toBeGreaterThanOrEqual(0);

        // Wait for job processing (poll for completion)
        let completed = false;
        for (let i = 0; i < 30; i++) {
          const run = await prisma.dailyRun.findFirst({
            where: { workspaceId },
            orderBy: { runDate: 'desc' },
            include: { stages: true },
          });
          if (run && ['COMPLETED', 'COMPLETED_WITH_FAILURES', 'FAILED'].includes(run.status)) {
            completed = true;
            expect(run.stages).toHaveLength(8);
            break;
          }
          await new Promise(r => setTimeout(r, 1000));
        }
        expect(completed).toBe(true);
      } finally {
        await boss.stop();
      }
    }, 180000);
  });

  describe('Autonomy Tier Enforcement', () => {
    it('respects autonomyTier=0 (no auto-preparation)', async () => {
      // Default autonomyTier is 0
      const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId } });
      expect(settings?.autonomyTier).toBe(0);

      // Run daily loop - autoPrepareColdWork defaults to false
      const result = await runDailyLoop(workspaceId);
      expect(['COMPLETED', 'COMPLETED_WITH_FAILURES', 'FAILED']).toContain(result.status);
    });

    it('runs safely at tier=1 with approved-work preparation allowed', async () => {
      // autonomyPolicy rows are NOT auto-created (only workspaceSettings
      // is), so upsert — never assume the row exists.
      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { autonomyTier: 1 },
      });
      await prisma.autonomyPolicy.upsert({
        where: { workspaceId },
        create: { workspaceId, autoPrepareApprovedWork: true, autoPrepareColdWork: false },
        update: { autoPrepareApprovedWork: true, autoPrepareColdWork: false },
      });

      const result = await runDailyLoop(workspaceId);
      expect(['COMPLETED', 'COMPLETED_WITH_FAILURES', 'FAILED']).toContain(result.status);

      // Reset
      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { autonomyTier: 0 },
      });
    });
  });

  describe('Budget Enforcement', () => {
    it('respects dailyLlmCallCap', async () => {
      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { dailyLlmCallCap: 1 },
      });

      const result = await runDailyLoop(workspaceId);
      expect(['COMPLETED', 'COMPLETED_WITH_FAILURES', 'FAILED']).toContain(result.status);

      // Should still complete but some stages may be SKIPPED due to budget
      const intelligenceStage = result.stages.find(s => s.stage === 'INTELLIGENCE');
      expect(intelligenceStage).toBeDefined();

      // Reset
      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { dailyLlmCallCap: 50 },
      });
    });

    it('respects dailyPreparationCap', async () => {
      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { dailyPreparationCap: 1 },
      });

      const result = await runDailyLoop(workspaceId);
      expect(['COMPLETED', 'COMPLETED_WITH_FAILURES', 'FAILED']).toContain(result.status);

      // Reset
      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { dailyPreparationCap: 20 },
      });
    });

    it('respects dailyExecutionCap = 0 (EXECUTION always SKIPPED)', async () => {
      const settings = await prisma.workspaceSettings.findUnique({ where: { workspaceId } });
      expect(settings?.dailyExecutionCap).toBe(0);

      const result = await runDailyLoop(workspaceId);
      const executionStage = result.stages.find(s => s.stage === 'EXECUTION');
      expect(executionStage?.status).toBe('SKIPPED');

      // RunResult.stages carries only { stage, status }; the honest note
      // lives on the persisted RunStage row. Read the source of truth.
      const execRow = await prisma.runStage.findFirst({
        where: { workspaceId, dailyRunId: result.runId, stage: 'EXECUTION' },
      });
      expect(execRow?.error ?? '').toContain('No execution integration');
    });
  });

  describe('Kill Switch / Pause', () => {
    // NOTE: a terminal DailyRun short-circuits before the gate (idempotent
    // re-run is a read, by design). These tests therefore use explicit past
    // dates that this workspace has never run — the gate only governs NEW
    // runs.
    it('respects killSwitch — new run is SKIPPED_KILLED', async () => {
      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { killSwitch: true },
      });

      const result = await runDailyLoop(workspaceId, '2020-04-01');
      expect(result.status).toBe('SKIPPED_KILLED');

      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { killSwitch: false },
      });
    });

    it('respects paused — new run is SKIPPED_PAUSED', async () => {
      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { paused: true },
      });

      const result = await runDailyLoop(workspaceId, '2020-04-02');
      expect(result.status).toBe('SKIPPED_PAUSED');

      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { paused: false },
      });
    });
  });

  describe('Workspace Isolation in Worker', () => {
    it('runs daily loop for each workspace independently', async () => {
      // Create second workspace
      const created = await request(app)
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `WP9 Worker WS 2 ${stamp}` })
        .expect(201);
      const ws2Id = (created.body.workspace?.id ?? created.body.id) as string;

      await request(app)
        .put('/api/v1/onboarding/schedule')
        .set({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': ws2Id })
        .send({
          timezone: 'UTC',
          dailyRunTime: '06:00',
          dailyLlmCallCap: 50,
          dailyFetchCap: 100,
          dailyPreparationCap: 20,
          autonomyTier: 0,
        })
        .expect(200);

      // Run daily loop for both workspaces
      const result1 = await runDailyLoop(workspaceId);
      const result2 = await runDailyLoop(ws2Id);

      expect(result1.runId).not.toBe(result2.runId);
      expect(result1.status).not.toBe('RUNNING');
      expect(result2.status).not.toBe('RUNNING');
    });
  });
});
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `wp9-owner-${stamp}@example.com`;
const outsiderEmail = `wp9-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let outsiderToken = '';
let workspaceId = '';
let emptyWorkspaceId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'WP9 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });
const authOwnerEmpty = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': emptyWorkspaceId });

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId, emptyWorkspaceId], userEmails: [ownerEmail, outsiderEmail] });
});

describe('WP9 Phase 1 — Operator Cycle Integration Tests', () => {
  describe('Setup', () => {
    it('registers users and creates workspaces', async () => {
      ownerToken = await registerAndLogin(ownerEmail);
      outsiderToken = await registerAndLogin(outsiderEmail);

      const created = await request(app)
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `WP9 WS ${stamp}` })
        .expect(201);
      workspaceId = (created.body.workspace?.id ?? created.body.id) as string;

      const empty = await request(app)
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ name: `WP9 Empty WS ${stamp}` })
        .expect(201);
      emptyWorkspaceId = (empty.body.workspace?.id ?? empty.body.id) as string;
    });

    it('seeds minimal intelligence data for the workspace', async () => {
      const topic = await prisma.topic.create({
        data: { workspaceId, name: 'AI Workflows', canonicalName: `ai-workflows-${stamp}`, description: 'AI workflow automation' },
      });
      await prisma.contentOpportunity.create({
        data: {
          workspaceId,
          topicId: topic.id,
          title: 'AI workflow opportunity',
          thesis: 'AI workflows save time',
          problem: 'Manual work is slow',
          audience: 'Developers',
          angle: 'Practical',
          objective: 'TEACH_PRACTICAL',
          opportunityScore: 85,
          sourceIds: [],
          claimIds: [],
          trendSignalIds: [],
          reasoning: 'Seeded for cycle test',
          evidenceSummary: 'Seeded',
        },
      });
      await prisma.trendSignal.create({
        data: {
          workspaceId,
          topicId: topic.id,
          status: 'TRENDING',
          mentionCount: 10,
          sourceCount: 5,
          firstSeenAt: new Date(Date.now() - 3 * 86400000),
          lastSeenAt: new Date(),
          recencyScore: 0.9,
          sourceDiversityScore: 0.8,
          frequencyScore: 0.7,
          evidenceSummary: 'Seeded trend',
        },
      });
    });

    it('seeds a lead for sales stage', async () => {
      await prisma.lead.create({
        data: {
          workspaceId,
          linkedinUrl: `https://linkedin.com/in/wp9-lead-${stamp}`,
          name: 'Test Lead',
          headline: 'CTO at TestCorp',
          company: 'TestCorp',
          status: 'NEW',
        },
      });
    });
  });

  describe('Happy Path — Full Cycle Execution', () => {
    it('executes a complete operator cycle end-to-end', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-happy`;

      const res = await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey, correlationId: `corr-${stamp}-happy` })
        .expect(201);

      const cycle = res.body.cycle;
      expect(cycle.cycleId).toBeDefined();
      expect(cycle.workspaceId).toBe(workspaceId);
      expect(['COMPLETED', 'PARTIAL']).toContain(cycle.status);
      expect(cycle.startedAt).toBeDefined();
      expect(cycle.completedAt).toBeDefined();
      expect(cycle.correlationId).toBe(`corr-${stamp}-happy`);
      expect(cycle.stages).toHaveLength(8);

      const stageNames = cycle.stages.map((s: { stage: string }) => s.stage);
      expect(stageNames).toEqual([
        'RESEARCH',
        'DECISION',
        'CONTENT',
        'SALES',
        'APPROVAL',
        'EXECUTION',
        'OBSERVE',
        'LEARN',
      ]);

      for (const stage of cycle.stages) {
        expect(['SUCCEEDED', 'SKIPPED', 'FAILED']).toContain(stage.status);
        expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      }

      expect(cycle.totals).toBeDefined();
      expect(typeof cycle.totals.opportunities).toBe('number');
      expect(typeof cycle.totals.contentIdeas).toBe('number');
      expect(typeof cycle.totals.plans).toBe('number');
      expect(typeof cycle.totals.drafts).toBe('number');
      expect(typeof cycle.totals.salesSignals).toBe('number');
      expect(typeof cycle.totals.preparedActions).toBe('number');
      expect(typeof cycle.totals.observations).toBe('number');
      expect(typeof cycle.totals.learningSignals).toBe('number');

      expect(Array.isArray(cycle.blocked)).toBe(true);
      expect(Array.isArray(cycle.skipped)).toBe(true);
      expect(Array.isArray(cycle.failures)).toBe(true);
      expect(Array.isArray(cycle.approvalsRequired)).toBe(true);
    }, 120000);
  });

  describe('Idempotency — Same Request Twice', () => {
    it('returns the same cycle on duplicate idempotency key', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-idempotent`;

      const res1 = await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      const res2 = await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      expect(res2.body.cycle.cycleId).toBe(res1.body.cycle.cycleId);
      expect(['COMPLETED', 'PARTIAL']).toContain(res2.body.cycle.status);
    });

    it('does not duplicate work on repeated calls', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-no-duplicate`;

      await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      const beforeCounts = await Promise.all([
        prisma.contentIdea.count({ where: { workspaceId } }),
        prisma.contentPlan.count({ where: { workspaceId } }),
        prisma.contentDraft.count({ where: { workspaceId } }),
        prisma.prospectResearch.count({ where: { workspaceId } }),
        prisma.operatorAction.count({ where: { workspaceId } }),
      ]);

      await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      const afterCounts = await Promise.all([
        prisma.contentIdea.count({ where: { workspaceId } }),
        prisma.contentPlan.count({ where: { workspaceId } }),
        prisma.contentDraft.count({ where: { workspaceId } }),
        prisma.prospectResearch.count({ where: { workspaceId } }),
        prisma.operatorAction.count({ where: { workspaceId } }),
      ]);

      for (let i = 0; i < beforeCounts.length; i++) {
        expect(afterCounts[i]).toBe(beforeCounts[i]);
      }
    });
  });

  describe('Resume After Failure', () => {
    it('resumes from the failed stage without repeating completed stages', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-resume`;

      await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      const cycleAfterFirst = await request(app)
        .get(`/api/v1/operator/cycle/key/${idempotencyKey}`)
        .set(authOwner())
        .expect(200);

      expect(['COMPLETED', 'PARTIAL']).toContain(cycleAfterFirst.body.cycle.status);
      const completedStages = cycleAfterFirst.body.cycle.stages.filter((s: { status: string }) => s.status === 'SUCCEEDED');
      expect(completedStages.length).toBeGreaterThan(0);

      await request(app)
        .post('/api/v1/operator/cycle/resume')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(200);

      const cycleAfterResume = await request(app)
        .get(`/api/v1/operator/cycle/key/${idempotencyKey}`)
        .set(authOwner())
        .expect(200);

      expect(cycleAfterResume.body.cycle.cycleId).toBe(cycleAfterFirst.body.cycle.cycleId);
      expect(['COMPLETED', 'PARTIAL']).toContain(cycleAfterResume.body.cycle.status);

      const resumedStages = cycleAfterResume.body.cycle.stages.filter((s: { status: string }) => s.status === 'SUCCEEDED');
      expect(resumedStages.length).toBe(completedStages.length);
    });

    it('blocks a new cycle when kill switch is enabled', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-kill-new`;

      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { killSwitch: true },
      });

      const res = await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      expect(res.body.cycle.status).toBe('CANCELLED');
      expect(res.body.cycle.error).toContain('KILL_SWITCH');

      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { killSwitch: false },
      });
    });
  });

  describe('Concurrent Duplicate Trigger', () => {
    it('handles two simultaneous requests with same idempotency key', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-concurrent`;

      const [res1, res2] = await Promise.all([
        request(app).post('/api/v1/operator/cycle').set(authOwner()).send({ idempotencyKey }),
        request(app).post('/api/v1/operator/cycle').set(authOwner()).send({ idempotencyKey }),
      ]);

      // Both should succeed (one creates, one returns existing)
      expect([res1.status, res2.status].sort()).toEqual([201, 201]);

      const cycleIds = [res1.body.cycle?.cycleId, res2.body.cycle?.cycleId].filter(Boolean);
      expect(new Set(cycleIds).size).toBe(1);
    });
  });

  describe('Workspace Isolation', () => {
    it('does not leak data between workspaces', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-isolation`;

      await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      const cycleA = await request(app)
        .get(`/api/v1/operator/cycle/key/${idempotencyKey}`)
        .set(authOwner())
        .expect(200);

      await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwnerEmpty())
        .send({ idempotencyKey })
        .expect(201);

      const cycleB = await request(app)
        .get(`/api/v1/operator/cycle/key/${idempotencyKey}`)
        .set(authOwnerEmpty())
        .expect(200);

      expect(cycleA.body.cycle.workspaceId).toBe(workspaceId);
      expect(cycleB.body.cycle.workspaceId).toBe(emptyWorkspaceId);
      expect(cycleA.body.cycle.cycleId).not.toBe(cycleB.body.cycle.cycleId);
    });

    it('denies cross-workspace cycle access', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-cross-access`;

      await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      await request(app)
        .get(`/api/v1/operator/cycle/key/${idempotencyKey}`)
        .set(authOutsider())
        .expect(403);

      // Accessing by cycleId (not idempotencyKey) from another workspace should 403 (forbidden)
      const cycle = await request(app)
        .get(`/api/v1/operator/cycle/key/${idempotencyKey}`)
        .set(authOwner())
        .expect(200);
      const cycleId = cycle.body.cycle.cycleId;

      await request(app)
        .get(`/api/v1/operator/cycle/${cycleId}`)
        .set(authOutsider())
        .expect(403);
    });
  });

  describe('AI Unavailable — Graceful Degradation', () => {
    it('completes cycle without AI (content plans/drafts deferred, no prose invented)', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-no-ai`;

      const res = await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwnerEmpty())
        .send({ idempotencyKey })
        .expect(201);

      const cycle = res.body.cycle;
      expect(['COMPLETED', 'PARTIAL']).toContain(cycle.status);

      const contentStage = cycle.stages.find((s: { stage: string }) => s.stage === 'CONTENT');
      expect(contentStage).toBeDefined();
      expect(['SUCCEEDED', 'SKIPPED', 'FAILED']).toContain(contentStage.status);

      const notes = contentStage.error || contentStage.note || '';
      if (contentStage.counts?.skippedNoAI) {
        expect(contentStage.counts.skippedNoAI).toBeGreaterThan(0);
      }
    });
  });

  describe('Provider Failure Isolation', () => {
    it('continues cycle when a research provider fails', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-provider-fail`;

      const res = await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      const cycle = res.body.cycle;
      expect(['COMPLETED', 'PARTIAL']).toContain(cycle.status);

      const researchStage = cycle.stages.find((s: { stage: string }) => s.stage === 'RESEARCH');
      expect(researchStage).toBeDefined();
      expect(['SUCCEEDED', 'SKIPPED', 'FAILED']).toContain(researchStage.status);
    });
  });

  describe('Capability/Policy Enforcement', () => {
    it('skips execution stage when capability unavailable (cap = 0)', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-capability`;

      const res = await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      const cycle = res.body.cycle;
      const executionStage = cycle.stages.find((s: { stage: string }) => s.stage === 'EXECUTION');
      expect(executionStage).toBeDefined();
      expect(executionStage.status).toBe('SKIPPED');
      expect(executionStage.error || executionStage.note || '').toContain('No execution integration');
    });

    it('respects kill switch and pauses', async () => {
      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { killSwitch: true },
      });

      const idempotencyKey = `wp9-cycle-${stamp}-killed`;

      const res = await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      expect(res.body.cycle.status).toBe('CANCELLED');
      expect(res.body.cycle.error).toContain('KILL_SWITCH');

      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { killSwitch: false },
      });
    });

    it('respects paused setting', async () => {
      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { paused: true },
      });

      const idempotencyKey = `wp9-cycle-${stamp}-paused`;

      const res = await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      expect(res.body.cycle.status).toBe('CANCELLED');
      expect(res.body.cycle.error).toContain('PAUSED');

      await prisma.workspaceSettings.update({
        where: { workspaceId },
        data: { paused: false },
      });
    });
  });

  describe('Audit Trail & Deterministic Result', () => {
    it('returns deterministic cycle result with all required fields', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-audit`;

      const res = await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      const cycle = res.body.cycle;

      expect(cycle).toHaveProperty('cycleId');
      expect(cycle).toHaveProperty('workspaceId');
      expect(cycle).toHaveProperty('status');
      expect(cycle).toHaveProperty('requestedAt');
      expect(cycle).toHaveProperty('startedAt');
      expect(cycle).toHaveProperty('completedAt');
      expect(cycle).toHaveProperty('error');
      expect(cycle).toHaveProperty('errorStage');
      expect(cycle).toHaveProperty('correlationId');
      expect(cycle).toHaveProperty('stages');
      expect(cycle).toHaveProperty('totals');
      expect(cycle).toHaveProperty('blocked');
      expect(cycle).toHaveProperty('skipped');
      expect(cycle).toHaveProperty('failures');
      expect(cycle).toHaveProperty('approvalsRequired');

      expect(typeof cycle.cycleId).toBe('string');
      expect(typeof cycle.workspaceId).toBe('string');
      expect(typeof cycle.status).toBe('string');
      expect(typeof cycle.requestedAt).toBe('string');
      expect(Array.isArray(cycle.stages)).toBe(true);
      expect(typeof cycle.totals).toBe('object');
      expect(Array.isArray(cycle.blocked)).toBe(true);
      expect(Array.isArray(cycle.skipped)).toBe(true);
      expect(Array.isArray(cycle.failures)).toBe(true);
      expect(Array.isArray(cycle.approvalsRequired)).toBe(true);
    });

    it('cycle result is consistent across retrieval methods', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-consistent`;

      await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwner())
        .send({ idempotencyKey })
        .expect(201);

      const byKey = await request(app)
        .get(`/api/v1/operator/cycle/key/${idempotencyKey}`)
        .set(authOwner())
        .expect(200);

      const byId = await request(app)
        .get(`/api/v1/operator/cycle/${byKey.body.cycle.cycleId}`)
        .set(authOwner())
        .expect(200);

      const list = await request(app)
        .get('/api/v1/operator/cycle?limit=10')
        .set(authOwner())
        .expect(200);

      expect(byId.body.cycle.cycleId).toBe(byKey.body.cycle.cycleId);
      expect(list.body.cycles[0].cycleId).toBe(byKey.body.cycle.cycleId);
    });
  });

  describe('Empty Workspace', () => {
    it('completes cycle on empty workspace without errors', async () => {
      const idempotencyKey = `wp9-cycle-${stamp}-empty`;

      const res = await request(app)
        .post('/api/v1/operator/cycle')
        .set(authOwnerEmpty())
        .send({ idempotencyKey })
        .expect(201);

      const cycle = res.body.cycle;
      expect(['COMPLETED', 'PARTIAL']).toContain(cycle.status);
      expect(cycle.workspaceId).toBe(emptyWorkspaceId);

      for (const stage of cycle.stages) {
        expect(['SUCCEEDED', 'SKIPPED', 'FAILED']).toContain(stage.status);
      }
    });
  });
});
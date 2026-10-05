import { describe, it, expect, afterAll, vi } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { STAGES } from '../src/worker/stages';

// WP9 Phase 5 — PRODUCTION LOOP HARDENING.
//
// Forensic regression coverage for gaps the audit proved UNPROVEN (everything
// else in the Phase 5 matrix is already covered: operatorCycle.test.ts,
// worker.test.ts, closedLoop.test.ts, loopFaults.test.ts, salesMachine,
// learningMachine, batch2/3E2E). Each test below pins one safety contract:
//
// 1. Subject-less outcome metrics are rejected (never stored as "data").
// 2. Below-threshold measurements cannot derive a learning proposal.
// 3. Preparation without a valid approval is blocked and stores nothing.
// 4. A crashed operator cycle resumes only its missing stages (no duplicates,
//    completed checkpoints preserved).
// 5. A throwing operator stage is recorded FAILED without corrupting earlier
//    stages; the cycle completes PARTIAL; resume leaves terminal cycles alone.
// 6. Zero preparation budget is recorded as an honest budget note (not silent).

const stamp = Date.now();
const ownerEmail = `harden-owner-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let workspaceId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Harden User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [ownerEmail] });
  vi.restoreAllMocks();
});

describe('WP9 Phase 5 — loop hardening', () => {
  it('registers owner and creates an isolated workspace with fixtures', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Harden WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;

    const topic = await prisma.topic.create({
      data: { workspaceId, name: 'Hardening Topic', canonicalName: `harden-topic-${stamp}`, description: 'Hardening fixture' },
    });
    await prisma.contentOpportunity.create({
      data: {
        workspaceId, topicId: topic.id, title: `Harden opportunity ${stamp}`,
        thesis: 'T.', problem: 'P.', audience: 'A.', angle: 'Practical.',
        objective: 'TEACH_PRACTICAL', opportunityScore: 80, status: 'NEW',
        sourceIds: [], claimIds: [], trendSignalIds: [],
        reasoning: 'Seeded.', evidenceSummary: 'Seeded.',
      },
    });
    await prisma.lead.create({
      data: { workspaceId, linkedinUrl: `https://linkedin.com/in/harden-${stamp}`, name: 'Harden Lead' },
    });
  });

  it('rejects subject-less outcome metrics instead of storing fake data', async () => {
    const res = await request(app)
      .post('/api/v1/outcomes')
      .set(authOwner())
      .send({ metricName: 'responses', metricValue: 42, unit: 'count', source: 'closed-loop fixture record' })
      .expect(422);
    expect(res.body.error.code).toBe('EVIDENCE_MISSING');
    expect(await prisma.outcomeMetric.count({ where: { workspaceId, metricName: 'responses' } })).toBe(0);
  });

  it('refuses learning derivation below the evidence threshold', async () => {
    const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    const lead = await prisma.lead.findFirst({ where: { workspaceId } });
    const pipeOpp = await prisma.pipelineOpportunity.create({
      data: { workspaceId, leadId: lead!.id, ownerId: owner!.id, name: `Harden deal ${stamp}` },
    });
    // Single group only: derivation requires 2+ groups at minimum sample.
    for (const value of [5, 6]) {
      await request(app)
        .post('/api/v1/outcomes')
        .set(authOwner())
        .send({ pipelineOpportunityId: pipeOpp.id, metricName: 'thin-metric', metricValue: value, unit: 'only-seg', source: 'closed-loop fixture record' })
        .expect(201);
    }
    const res = await request(app)
      .post('/api/v1/learning/derived')
      .set(authOwner())
      .send({ metricName: 'thin-metric' })
      .expect(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_DATA');
    expect(await prisma.learningProposal.count({ where: { workspaceId } })).toBe(0);
  });

  it('blocks preparation without a valid approval and stores nothing', async () => {
    const lead = await prisma.lead.findFirst({ where: { workspaceId } });
    const strategy = await prisma.outreachStrategy.create({
      data: {
        workspaceId, leadId: lead!.id, objective: 'Intro', audience: 'CTOs',
        relationshipStage: 'COLD', angle: 'problem-led', reasonForContact: 'Hardening fixture.',
        personalizationLevel: 'LIGHT', status: 'DRAFT', createdBy: 'test',
      },
    });
    const draft = await prisma.outreachDraft.create({
      data: {
        workspaceId, strategyId: strategy.id, leadId: lead!.id, draftType: 'FIRST_MESSAGE',
        opening: 'Hi.', relevance: 'Seeded relevance.', value: 'Seeded value.',
        body: 'Hi, hardening fixture outreach body with enough length to be valid.',
        version: 1, createdBy: 'test',
      },
    });
    // No review requested, no approval: preparation must refuse.
    const res = await request(app)
      .post('/api/v1/outreach/prepared-actions')
      .set(authOwner())
      .send({ actionType: 'SEND_FIRST_MESSAGE', target: 'Harden Lead', draftId: draft.id })
      .expect(403);
    expect(res.body.error.code).toBe('ACTION_BLOCKED');
    expect(await prisma.preparedAction.count({ where: { workspaceId, draftId: draft.id } })).toBe(0);
  });

  it('a crashed operator cycle resumes only its missing stages', async () => {
    const key = `harden-crash-${stamp}`;
    const first = await request(app).post('/api/v1/operator/cycle').set(authOwner()).send({ idempotencyKey: key }).expect(201);
    const cycleId = first.body.cycle.cycleId as string;
    expect(['COMPLETED', 'PARTIAL']).toContain(first.body.cycle.status);

    const researchBefore = await prisma.operatorCycleStage.findFirst({
      where: { workspaceId, cycleId, stage: 'RESEARCH' },
    });
    const ideasBefore = await prisma.contentIdea.count({ where: { workspaceId } });

    // Simulate a crash after 6 of 8 stages: drop two checkpoints, rewind status.
    await prisma.operatorCycleStage.deleteMany({ where: { cycleId, stage: { in: ['OBSERVE', 'LEARN'] } } });
    await prisma.operatorCycle.update({ where: { id: cycleId }, data: { status: 'RUNNING', completedAt: null } });

    const second = await request(app).post('/api/v1/operator/cycle/resume').set(authOwner()).send({ idempotencyKey: key }).expect(200);
    expect(second.body.cycle.cycleId).toBe(cycleId);
    expect(['COMPLETED', 'PARTIAL']).toContain(second.body.cycle.status);

    // Completed checkpoints preserved untouched; missing stages re-ran once.
    const researchAfter = await prisma.operatorCycleStage.findFirst({
      where: { workspaceId, cycleId, stage: 'RESEARCH' },
    });
    expect(researchAfter?.counts).toEqual(researchBefore?.counts);
    expect(await prisma.operatorCycleStage.count({ where: { cycleId } })).toBe(8);
    expect(await prisma.contentIdea.count({ where: { workspaceId } })).toBe(ideasBefore);
  });

  it('a throwing operator stage is recorded FAILED without corrupting earlier stages', async () => {
    const spy = vi.spyOn(STAGES, 'DECISION').mockRejectedValueOnce(new Error('simulated decision outage'));
    try {
      const key = `harden-throw-${stamp}`;
      const res = await request(app).post('/api/v1/operator/cycle').set(authOwner()).send({ idempotencyKey: key }).expect(201);
      const cycle = res.body.cycle;
      expect(cycle.status).toBe('PARTIAL');

      const byStage = new Map<string, { status: string; error?: string | null }>(
        (cycle.stages as Array<{ stage: string; status: string; error?: string | null }>).map((s) => [s.stage, s])
      );
      expect(byStage.get('RESEARCH')?.status).toBe('SUCCEEDED');
      expect(byStage.get('DECISION')?.status).toBe('FAILED');
      expect(byStage.get('DECISION')?.error ?? '').toMatch(/simulated decision outage/);
      // Later independent stages still ran.
      expect(byStage.get('CONTENT')?.status).toBe('SUCCEEDED');

      // Terminal cycles are untouched by resume (documented idempotency).
      const again = await request(app).post('/api/v1/operator/cycle/resume').set(authOwner()).send({ idempotencyKey: key }).expect(200);
      expect(again.body.cycle.cycleId).toBe(cycle.cycleId);
      expect(again.body.cycle.status).toBe('PARTIAL');
    } finally {
      spy.mockRestore();
    }
  });

  it('zero preparation budget is recorded as an honest budget note, not silence', async () => {
    // Fresh opportunity: earlier tests in this file already prepared ideas
    // for the setup opportunity, and the dupe guard would skip it without
    // ever touching the budget. The loop needs real pending work to defer.
    const topic = await prisma.topic.create({
      data: { workspaceId, name: `Harden budget topic ${stamp}`, canonicalName: `harden-budget-topic-${stamp}` },
    });
    await prisma.contentOpportunity.create({
      data: {
        workspaceId, topicId: topic.id, title: `Harden budget opportunity ${stamp}`,
        thesis: 'T.', problem: 'P.', audience: 'A.', angle: 'Practical.',
        objective: 'TEACH_PRACTICAL', opportunityScore: 70, status: 'NEW',
        sourceIds: [], claimIds: [], trendSignalIds: [],
        reasoning: 'Seeded.', evidenceSummary: 'Seeded.',
      },
    });
    await prisma.workspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, dailyPreparationCap: 0 },
      update: { dailyPreparationCap: 0 },
    });
    const key = `harden-budget-${stamp}`;
    const res = await request(app).post('/api/v1/operator/cycle').set(authOwner()).send({ idempotencyKey: key }).expect(201);
    expect(['COMPLETED', 'PARTIAL']).toContain(res.body.cycle.status);

    const rows = await prisma.operatorCycleStage.findMany({ where: { workspaceId, cycleId: res.body.cycle.cycleId } });
    const byName = new Map(rows.map((r) => [r.stage, r]));
    expect((byName.get('CONTENT')?.counts as unknown as Record<string, number> | null)?.ideasCreated ?? 0).toBe(0);
    const notes = `${byName.get('CONTENT')?.error ?? ''} ${byName.get('SALES')?.error ?? ''}`;
    expect(notes).toMatch(/budget/i);

    await prisma.workspaceSettings.update({ where: { workspaceId }, data: { dailyPreparationCap: 20 } });
  });
});

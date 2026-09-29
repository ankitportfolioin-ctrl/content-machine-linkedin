import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { RunBudget } from './worker/budget';

const stamp = Date.now();
const ownerEmail = `batch2-owner-${stamp}@example.com`;
const outsiderEmail = `batch2-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let outsiderToken = '';
let ownerId = '';
let workspaceId = '';
let quotaWorkspaceId = '';
let coldWorkspaceId = '';
let otherWorkspaceId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Batch2 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

async function createWorkspace(token: string, name: string): Promise<string> {
  const created = await request(app)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .send({ name })
    .expect(201);
  return (created.body.workspace?.id ?? created.body.id) as string;
}

const authOwner = (ws: string) => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': ws });

async function seedPendingAction(ws: string, kind = 'content_gap', identityKey: string) {
  return prisma.operatorAction.create({
    data: {
      workspaceId: ws,
      identityKey,
      kind,
      subjectId: null,
      title: `Batch2 action ${identityKey}`,
      score: 5,
      reasons: ['Seeded for batch 2.'],
      evidenceLinks: [],
      subjectMeta: {},
      status: 'PENDING',
    },
  });
}

afterAll(async () => {
  await cleanupTestData({
    workspaceIds: [workspaceId, quotaWorkspaceId, coldWorkspaceId, otherWorkspaceId],
    userEmails: [ownerEmail, outsiderEmail],
  });
});

describe('Batch 2 setup', () => {
  it('registers users and creates isolated workspaces', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);
    workspaceId = await createWorkspace(ownerToken, `Batch2 WS ${stamp}`);
    quotaWorkspaceId = await createWorkspace(ownerToken, `Batch2 Quota WS ${stamp}`);
    coldWorkspaceId = await createWorkspace(ownerToken, `Batch2 Cold WS ${stamp}`);
    otherWorkspaceId = await createWorkspace(ownerToken, `Batch2 Other WS ${stamp}`);
    const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    ownerId = owner!.id;
    expect(workspaceId).toBeTruthy();
  });
});

describe('A. recommendation acceptance', () => {
  it('accepts a PENDING recommendation for preparation', async () => {
    const action = await seedPendingAction(workspaceId, 'content_gap', `accept-1-${stamp}`);
    const ideasBefore = await prisma.contentIdea.count({ where: { workspaceId } });
    const res = await request(app)
      .post(`/api/v1/operator/actions/${action.id}/accept`)
      .set(authOwner(workspaceId))
      .send({ reason: 'Looks worth prepping.' })
      .expect(200);
    expect(res.body.action.status).toBe('ACCEPTED');
    expect(res.body.action.acceptedAt).toBeTruthy();
    expect(res.body.action.acceptedBy).toBe(ownerId);
    // Acceptance is NOT execution approval: nothing external was prepared.
    expect(await prisma.contentIdea.count({ where: { workspaceId } })).toBe(ideasBefore);
  });

  it('rejects double acceptance and unknown ids', async () => {
    const action = await seedPendingAction(workspaceId, 'content_gap', `accept-2-${stamp}`);
    await request(app).post(`/api/v1/operator/actions/${action.id}/accept`).set(authOwner(workspaceId)).send({}).expect(200);
    await request(app).post(`/api/v1/operator/actions/${action.id}/accept`).set(authOwner(workspaceId)).send({}).expect(422);
    await request(app).post('/api/v1/operator/actions/00000000-0000-0000-0000-000000000000/accept').set(authOwner(workspaceId)).send({}).expect(404);
  });

  it('allows ACCEPTED -> DISMISSED / COMPLETED but never back to PENDING', async () => {
    const a1 = await seedPendingAction(workspaceId, 'content_gap', `accept-3-${stamp}`);
    await request(app).post(`/api/v1/operator/actions/${a1.id}/accept`).set(authOwner(workspaceId)).send({}).expect(200);
    await request(app).post(`/api/v1/operator/actions/${a1.id}/dismiss`).set(authOwner(workspaceId)).send({}).expect(200);
    const a2 = await seedPendingAction(workspaceId, 'content_gap', `accept-4-${stamp}`);
    await request(app).post(`/api/v1/operator/actions/${a2.id}/accept`).set(authOwner(workspaceId)).send({}).expect(200);
    await request(app).post(`/api/v1/operator/actions/${a2.id}/complete`).set(authOwner(workspaceId)).send({}).expect(200);
    // Dismissed actions stay terminal.
    await request(app).post(`/api/v1/operator/actions/${a1.id}/complete`).set(authOwner(workspaceId)).send({}).expect(422);
  });

  it('lists accepted recommendations separately from pending', async () => {
    const action = await seedPendingAction(workspaceId, 'trend_signal', `accept-5-${stamp}`);
    await request(app).post(`/api/v1/operator/actions/${action.id}/accept`).set(authOwner(workspaceId)).send({}).expect(200);
    const listed = await request(app).get('/api/v1/operator/actions?status=accepted').set(authOwner(workspaceId)).expect(200);
    expect((listed.body.actions as Array<{ id: string }>).map((a) => a.id)).toContain(action.id);
  });

  it('enforces workspace isolation on accept', async () => {
    const action = await seedPendingAction(workspaceId, 'content_gap', `accept-6-${stamp}`);
    await request(app)
      .post(`/api/v1/operator/actions/${action.id}/accept`)
      .set({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId })
      .send({})
      .expect(403);
  });
});

describe('B. prior-human-judgment auto-preparation', () => {
  it('exposes default policy and quota state', async () => {
    const res = await request(app).get('/api/v1/auto-preparation/status').set(authOwner(workspaceId)).expect(200);
    expect(res.body.status.policy.autoPrepareApprovedWork).toBe(true);
    expect(res.body.status.policy.autoPrepareColdWork).toBe(false);
    expect(res.body.status.policy.dailyAutoPreparationQuota).toBe(10);
    expect(typeof res.body.status.usedToday).toBe('number');
  });

  it('auto-prepares research for an imported lead with a traceable reason', async () => {
    await prisma.leadImportBatch.create({
      data: {
        workspaceId,
        filename: 'batch2.csv',
        fileHash: `batch2-${stamp}`,
        totalRows: 1,
        importedRows: 1,
        status: 'COMPLETED',
        importedBy: ownerId,
      },
    });
    const lead = await prisma.lead.create({
      data: { workspaceId, linkedinUrl: `https://linkedin.com/in/batch2-${stamp}`, name: 'Batch Lead', headline: 'CTO' },
    });
    const res = await request(app).post('/api/v1/auto-preparation/run').set(authOwner(workspaceId)).send({}).expect(200);
    const prepared = res.body.prepared as Array<{ kind: string; subjectId: string; authorizationReason: string }>;
    const entry = prepared.find((p) => p.kind === 'LEAD_RESEARCH' && p.subjectId === lead.id);
    expect(entry).toBeDefined();
    expect(entry!.authorizationReason).toMatch(/imported/);
    const research = await prisma.prospectResearch.findFirst({ where: { workspaceId, leadId: lead.id } });
    expect(research).toBeTruthy();
    expect((research!.facts as Record<string, unknown>).name).toBe('Batch Lead');
    expect(research!.confidence).toBeNull();
    // Log persists the authorization.
    const logs = await request(app).get('/api/v1/auto-preparation/log?take=50').set(authOwner(workspaceId)).expect(200);
    const log = (logs.body.logs as Array<Record<string, unknown>>).find(
      (l) => l.kind === 'LEAD_RESEARCH' && l.subjectId === lead.id
    );
    expect(log?.authorizationSource).toBe('IMPORT_ACCEPTANCE');
    expect(log?.status).toBe('PREPARED');
  });

  it('auto-prepares an idea for a triaged opportunity', async () => {
    const topic = await prisma.topic.create({
      data: { workspaceId, name: `Batch2 topic ${stamp}`, canonicalName: `batch2-${stamp}`, description: 't' },
    });
    const opp = await prisma.contentOpportunity.create({
      data: {
        workspaceId, topicId: topic.id, title: 'Reviewed opp', thesis: 'Thesis here.',
        problem: 'Problem.', audience: 'Founders', angle: 'Practical', objective: 'TEACH_PRACTICAL',
        opportunityScore: 7, sourceIds: [], claimIds: [], trendSignalIds: [],
        reasoning: 'Seeded.', evidenceSummary: 'Seeded.', status: 'REVIEWED',
      },
    });
    const res = await request(app).post('/api/v1/auto-preparation/run').set(authOwner(workspaceId)).send({}).expect(200);
    const entry = (res.body.prepared as Array<{ kind: string; subjectId: string }>).find(
      (p) => p.kind === 'OPPORTUNITY_IDEA' && p.subjectId === opp.id
    );
    expect(entry).toBeDefined();
    const idea = await prisma.contentIdea.findFirst({ where: { workspaceId, title: 'Reviewed opp' } });
    expect(idea).toBeTruthy();
  });

  it('auto-prepares a draft for an approved strategy without executing anything', async () => {
    const lead = await prisma.lead.create({
      data: { workspaceId, linkedinUrl: `https://linkedin.com/in/batch2 Strat-${stamp}`, name: 'Strat Lead' },
    });
    const strategy = await prisma.outreachStrategy.create({
      data: {
        workspaceId, leadId: lead.id, objective: 'Intro', audience: 'CTOs',
        relationshipStage: 'COLD', angle: 'problem-led', reasonForContact: 'Seeded reason.',
        personalizationLevel: 'LIGHT', status: 'APPROVED', createdBy: ownerId,
      },
    });
    const res = await request(app).post('/api/v1/auto-preparation/run').set(authOwner(workspaceId)).send({}).expect(200);
    const entry = (res.body.prepared as Array<{ kind: string; subjectId: string }>).find(
      (p) => p.kind === 'STRATEGY_DRAFT' && p.subjectId === strategy.id
    );
    expect(entry).toBeDefined();
    const draft = await prisma.outreachDraft.findFirst({ where: { workspaceId, strategyId: strategy.id } });
    expect(draft).toBeTruthy();
    expect(draft!.body).toMatch(/human review required/);
    // No outreach review/approval and no prepared (execution-side) action created.
    expect(await prisma.outreachReview.count({ where: { workspaceId, draftId: draft!.id } })).toBe(0);
    expect(await prisma.preparedAction.count({ where: { workspaceId } })).toBe(0);
  });

  it('skips cold untouched opportunities by default with an explicit reason', async () => {
    const topic = await prisma.topic.create({
      data: { workspaceId, name: `Batch2 cold ${stamp}`, canonicalName: `batch2-cold-${stamp}`, description: 't' },
    });
    const opp = await prisma.contentOpportunity.create({
      data: {
        workspaceId, topicId: topic.id, title: 'Untouched opp', thesis: 'Thesis.',
        problem: 'Problem.', audience: 'Founders', angle: 'Practical', objective: 'TEACH_PRACTICAL',
        opportunityScore: 6, sourceIds: [], claimIds: [], trendSignalIds: [],
        reasoning: 'Seeded.', evidenceSummary: 'Seeded.', status: 'NEW',
      },
    });
    const res = await request(app).post('/api/v1/auto-preparation/run').set(authOwner(workspaceId)).send({}).expect(200);
    const skipped = (res.body.skipped as Array<{ kind: string; subjectId: string; skipReason: string }>).find(
      (s) => s.kind === 'COLD_OPPORTUNITY_IDEA' && s.subjectId === opp.id
    );
    expect(skipped).toBeDefined();
    expect(skipped!.skipReason).toMatch(/no acceptance was recorded/);
    expect(await prisma.contentIdea.findFirst({ where: { workspaceId, title: 'Untouched opp' } })).toBeNull();
  });

  it('enables cold preparation only through explicit policy', async () => {
    const topic = await prisma.topic.create({
      data: { workspaceId: coldWorkspaceId, name: `ColdT ${stamp}`, canonicalName: `coldt-${stamp}`, description: 't' },
    });
    const opp = await prisma.contentOpportunity.create({
      data: {
        workspaceId: coldWorkspaceId, topicId: topic.id, title: 'Cold opp', thesis: 'Thesis.',
        problem: 'Problem.', audience: 'Founders', angle: 'Practical', objective: 'TEACH_PRACTICAL',
        opportunityScore: 6, sourceIds: [], claimIds: [], trendSignalIds: [],
        reasoning: 'Seeded.', evidenceSummary: 'Seeded.', status: 'NEW',
      },
    });
    const before = await request(app).post('/api/v1/auto-preparation/run').set(authOwner(coldWorkspaceId)).send({}).expect(200);
    expect(
      (before.body.skipped as Array<{ kind: string }>).some((s) => s.kind === 'COLD_OPPORTUNITY_IDEA')
    ).toBe(true);
    await request(app)
      .put('/api/v1/onboarding/policy')
      .set(authOwner(coldWorkspaceId))
      .send({
        tier1PostingEnabled: false, tier1PostingDailyCap: 1, tier1RequireApprovedPost: true,
        tier2HumanApprovalAck: true, autoPrepareApprovedWork: true, autoPrepareColdWork: true,
        dailyAutoPreparationQuota: 10,
      })
      .expect(200);
    const after = await request(app).post('/api/v1/auto-preparation/run').set(authOwner(coldWorkspaceId)).send({}).expect(200);
    const entry = (after.body.prepared as Array<{ kind: string; subjectId: string; authorizationReason: string }>).find(
      (p) => p.kind === 'COLD_OPPORTUNITY_IDEA' && p.subjectId === opp.id
    );
    expect(entry).toBeDefined();
    expect(entry!.authorizationReason).toMatch(/auto-preparation policy/);
  });

  it('enforces the daily quota gracefully and preserves backlog', async () => {
    await prisma.leadImportBatch.create({
      data: {
        workspaceId: quotaWorkspaceId, filename: 'q.csv', fileHash: `quota-${stamp}`,
        totalRows: 2, importedRows: 2, status: 'COMPLETED', importedBy: ownerId,
      },
    });
    await prisma.lead.create({
      data: { workspaceId: quotaWorkspaceId, linkedinUrl: `https://linkedin.com/in/q1-${stamp}`, name: 'Q Lead 1' },
    });
    await prisma.lead.create({
      data: { workspaceId: quotaWorkspaceId, linkedinUrl: `https://linkedin.com/in/q2-${stamp}`, name: 'Q Lead 2' },
    });
    await request(app)
      .put('/api/v1/onboarding/policy')
      .set(authOwner(quotaWorkspaceId))
      .send({
        tier1PostingEnabled: false, tier1PostingDailyCap: 1, tier1RequireApprovedPost: true,
        tier2HumanApprovalAck: true, autoPrepareApprovedWork: true, autoPrepareColdWork: false,
        dailyAutoPreparationQuota: 1,
      })
      .expect(200);
    const res = await request(app).post('/api/v1/auto-preparation/run').set(authOwner(quotaWorkspaceId)).send({}).expect(200);
    expect(res.body.prepared).toHaveLength(1);
    expect(res.body.quotaReached).toBe(true);
    const quotaSkip = (res.body.skipped as Array<{ skipReason: string }>).find((s) =>
      s.skipReason?.match(/quota/)
    );
    expect(quotaSkip).toBeDefined();
    // Backlog preserved: second lead still has no research.
    expect(await prisma.prospectResearch.count({ where: { workspaceId: quotaWorkspaceId } })).toBe(1);
    const status = await request(app).get('/api/v1/auto-preparation/status').set(authOwner(quotaWorkspaceId)).expect(200);
    expect(status.body.status.quotaReached).toBe(true);
    expect(status.body.status.usedToday).toBe(1);
  });
});

describe('C. evidence maturity ladder', () => {
  it('new proposals enter as HYPOTHESIS, never CONFIRMED', async () => {
    const res = await request(app)
      .post('/api/v1/learning/derived')
      .set(authOwner(workspaceId))
      .send({
        dimension: 'timeliness', observedPattern: 'Batch2 pattern.', supportingMeasurements: {},
        sourceMetricIds: [], sampleSize: 1, proposedAdjustment: 0.05, reason: 'Seeded.', confidence: 0.95,
      })
      .expect(201);
    expect(res.body.proposal.status).toBe('PROPOSED');
    expect(res.body.proposal.maturity).toBe('HYPOTHESIS');
  });

  it('walks UNKNOWN -> OBSERVED -> REPEATED_SIGNAL through recorded occurrences', async () => {
    const store = prisma as unknown as {
      learningProposal: { create(a: unknown): Promise<{ id: string }>; findUnique(a: unknown): Promise<{ maturity: string; evidenceCount: number } | null> };
    };
    const created = await store.learningProposal.create({
      data: {
        workspaceId, dimension: 'timeliness', observedPattern: 'Ladder walk.',
        supportingMeasurements: {}, sourceMetricIds: [], sampleSize: 0,
        proposedAdjustment: 0.05, reason: 'Seeded.', status: 'PROPOSED',
        maturity: 'UNKNOWN', evidenceCount: 0,
      },
    });
    const first = await request(app).post(`/api/v1/learning/derived/${created.id}/observe`).set(authOwner(workspaceId)).send({}).expect(200);
    expect(first.body.proposal.maturity).toBe('OBSERVED');
    await request(app).post(`/api/v1/learning/derived/${created.id}/observe`).set(authOwner(workspaceId)).send({}).expect(200);
    const third = await request(app).post(`/api/v1/learning/derived/${created.id}/observe`).set(authOwner(workspaceId)).send({}).expect(200);
    expect(third.body.proposal.maturity).toBe('REPEATED_SIGNAL');
    expect(third.body.proposal.evidenceCount).toBe(3);
  });

  it('rejects invalid transitions and observation past the early ladder', async () => {
    const res = await request(app)
      .post('/api/v1/learning/derived')
      .set(authOwner(workspaceId))
      .send({
        dimension: 'relevance', observedPattern: 'Invalid jumps.', supportingMeasurements: {},
        sourceMetricIds: [], sampleSize: 2, proposedAdjustment: 0.05, reason: 'Seeded.',
      })
      .expect(201);
    const id = res.body.proposal.id as string;
    // HYPOTHESIS is past the observation window.
    await request(app).post(`/api/v1/learning/derived/${id}/observe`).set(authOwner(workspaceId)).send({}).expect(422);
    // Skipping HYPOTHESIS -> SUPPORTED_PATTERN is rejected.
    await request(app)
      .post(`/api/v1/learning/derived/${id}/promote`)
      .set(authOwner(workspaceId))
      .send({ to: 'SUPPORTED_PATTERN', sourceMetricIds: [], reason: 'Skipping ahead.' })
      .expect(422);
    // CONFIRMED is never reachable through promotion.
    await request(app)
      .post(`/api/v1/learning/derived/${id}/promote`)
      .set(authOwner(workspaceId))
      .send({ to: 'CONFIRMED', sourceMetricIds: [], reason: 'Trying.' })
      .expect(400);
  });

  it('promotes with real evidence and reaches CONFIRMED only via human confirm', async () => {
    const lead = await prisma.lead.create({
      data: { workspaceId, linkedinUrl: `https://linkedin.com/in/mat-${stamp}`, name: 'Maturity Lead' },
    });
    const opp = await prisma.pipelineOpportunity.create({
      data: { workspaceId, leadId: lead.id, ownerId, name: 'Maturity Opp', stage: 'PROSPECTING' },
    });
    const metric = await request(app)
      .post('/api/v1/outcomes')
      .set(authOwner(workspaceId))
      .send({ pipelineOpportunityId: opp.id, metricName: 'replies', metricValue: 9999, source: 'manual CRM entry' })
      .expect(201);
    const metricId = metric.body.outcomeMetric.id as string;
    // Even one huge post only yields a hypothesis.
    const res = await request(app)
      .post('/api/v1/learning/derived')
      .set(authOwner(workspaceId))
      .send({
        dimension: 'evidence_strength', observedPattern: 'Huge single post.', supportingMeasurements: {},
        sourceMetricIds: [metricId], sampleSize: 1, proposedAdjustment: 0.05, reason: 'Seeded.',
      })
      .expect(201);
    expect(res.body.proposal.maturity).toBe('HYPOTHESIS');
    const id = res.body.proposal.id as string;
    const promoted = await request(app)
      .post(`/api/v1/learning/derived/${id}/promote`)
      .set(authOwner(workspaceId))
      .send({ to: 'EXPERIMENT', sourceMetricIds: [metricId], reason: 'Testing explicitly with recorded metric.' })
      .expect(200);
    expect(promoted.body.proposal.maturity).toBe('EXPERIMENT');
    // Fake evidence is rejected.
    await request(app)
      .post(`/api/v1/learning/derived/${id}/promote`)
      .set(authOwner(workspaceId))
      .send({ to: 'SUPPORTED_PATTERN', sourceMetricIds: ['00000000-0000-0000-0000-000000000000'], reason: 'Fake.' })
      .expect(422);
    // Human confirmation is the only path to CONFIRMED.
    const confirmed = await request(app).post(`/api/v1/learning/derived/${id}/confirm`).set(authOwner(workspaceId)).send({}).expect(200);
    expect(confirmed.body.proposal.status).toBe('CONFIRMED');
    expect(confirmed.body.proposal.maturity).toBe('CONFIRMED');
  });
});

describe('D. DIRECT / INFERRED / UNKNOWN attribution', () => {
  it('creates honest links and refuses overclaims', async () => {
    const lead = await prisma.lead.create({
      data: { workspaceId, linkedinUrl: `https://linkedin.com/in/attr-${stamp}`, name: 'Attr Lead' },
    });
    const opp = await prisma.pipelineOpportunity.create({
      data: { workspaceId, leadId: lead.id, ownerId, name: 'Attr Opp', stage: 'PROPOSAL' },
    });
    const metric = await request(app)
      .post('/api/v1/outcomes')
      .set(authOwner(workspaceId))
      .send({ pipelineOpportunityId: opp.id, metricName: 'deal_value', metricValue: 5000, source: 'manual CRM entry' })
      .expect(201);
    const metricId = metric.body.outcomeMetric.id as string;
    // INFERRED without a documented reason is rejected.
    await request(app)
      .post('/api/v1/attribution/links')
      .set(authOwner(workspaceId))
      .send({ sourceType: 'lead', sourceId: lead.id, targetType: 'outcomeMetric', targetId: metricId, attributionType: 'INFERRED', evidenceRefs: [] })
      .expect(422);
    // DIRECT without evidence is rejected (reach alone never qualifies).
    await request(app)
      .post('/api/v1/attribution/links')
      .set(authOwner(workspaceId))
      .send({ sourceType: 'lead', sourceId: lead.id, targetType: 'outcomeMetric', targetId: metricId, attributionType: 'DIRECT', evidenceRefs: [] })
      .expect(422);
    const inferred = await request(app)
      .post('/api/v1/attribution/links')
      .set(authOwner(workspaceId))
      .send({
        sourceType: 'lead', sourceId: lead.id, targetType: 'outcomeMetric', targetId: metricId,
        attributionType: 'INFERRED', evidenceRefs: [`lead:${lead.id}`],
        reason: 'Conversation followed content engagement; no authoritative revenue record links them.',
      })
      .expect(201);
    expect(inferred.body.link.attributionType).toBe('INFERRED');
    // Upgrade without NEW evidence is rejected.
    await request(app)
      .post('/api/v1/attribution/links')
      .set(authOwner(workspaceId))
      .send({
        sourceType: 'lead', sourceId: lead.id, targetType: 'outcomeMetric', targetId: metricId,
        attributionType: 'DIRECT', evidenceRefs: [`lead:${lead.id}`], reason: 'Same evidence.',
      })
      .expect(422);
    // Upgrade with new evidence succeeds.
    const direct = await request(app)
      .post('/api/v1/attribution/links')
      .set(authOwner(workspaceId))
      .send({
        sourceType: 'lead', sourceId: lead.id, targetType: 'outcomeMetric', targetId: metricId,
        attributionType: 'DIRECT', evidenceRefs: [`lead:${lead.id}`, `outcome:${metricId}`],
        reason: 'CRM record explicitly ties the closed opportunity to this lead.',
      })
      .expect(201);
    expect(direct.body.link.attributionType).toBe('DIRECT');
    // UNKNOWN is reported honestly when nothing exists.
    const listed = await request(app)
      .get(`/api/v1/attribution?targetType=outcomeMetric&targetId=${metricId}`)
      .set(authOwner(workspaceId))
      .expect(200);
    expect(listed.body.strongest).toBe('DIRECT');
    const detail = await request(app).get(`/api/v1/outcomes/${metricId}`).set(authOwner(workspaceId)).expect(200);
    expect(detail.body.attribution.strongest).toBe('DIRECT');
    expect(detail.body.attribution.links).toHaveLength(1);
  });

  it('never fabricates links and isolates workspaces', async () => {
    const foreignLead = await prisma.lead.create({
      data: { workspaceId: otherWorkspaceId, linkedinUrl: `https://linkedin.com/in/foreign-${stamp}`, name: 'Foreign' },
    });
    const localLead = await prisma.lead.create({
      data: { workspaceId, linkedinUrl: `https://linkedin.com/in/local-${stamp}`, name: 'Local' },
    });
    // Cross-workspace endpoint is rejected.
    await request(app)
      .post('/api/v1/attribution/links')
      .set(authOwner(workspaceId))
      .send({
        sourceType: 'lead', sourceId: foreignLead.id, targetType: 'lead', targetId: localLead.id,
        attributionType: 'UNKNOWN', evidenceRefs: [],
      })
      .expect(422);
    // Nonexistent endpoint is rejected.
    await request(app)
      .post('/api/v1/attribution/links')
      .set(authOwner(workspaceId))
      .send({
        sourceType: 'lead', sourceId: '00000000-0000-0000-0000-000000000000',
        targetType: 'lead', targetId: localLead.id, attributionType: 'UNKNOWN', evidenceRefs: [],
      })
      .expect(422);
  });
});

describe('E. execution budget', () => {
  it('keeps preparation and execution budgets separate', () => {
    const budget = new RunBudget({ llmCalls: 5, fetches: 5, preparations: 1 });
    // No execution integration: cap defaults to 0, execution unavailable.
    expect(budget.spendExecution()).toBe(false);
    expect(budget.remaining().executions).toBe(0);
    expect(budget.remaining().exhausted).toContain('executions');
    // Preparation spend does not consume execution budget or vice versa.
    expect(budget.spendPreparation()).toBe(true);
    expect(budget.spendPreparation()).toBe(false);
    const withExec = new RunBudget({ llmCalls: 5, fetches: 5, preparations: 5, executions: 2 });
    expect(withExec.spendExecution()).toBe(true);
    expect(withExec.spendExecution()).toBe(true);
    expect(withExec.spendExecution()).toBe(false);
    expect(withExec.remaining().preparations).toBe(5);
  });

  it('readiness still reports LinkedIn execution as not connected', async () => {
    const res = await request(app).get('/api/v1/readiness').set(authOwner(workspaceId)).expect(200);
    expect(res.body.readiness.linkedInExecution.ready).toBe(false);
    expect(res.body.readiness.linkedInExecution.reason).toMatch(/No LinkedIn integration exists/);
  });
});

describe('F. comment -> audience signal -> sales intelligence bridge', () => {
  it('turns a LEAD_SIGNAL comment into a reviewable sales signal, not a lead', async () => {
    const leadsBefore = await prisma.lead.count({ where: { workspaceId } });
    const convosBefore = await prisma.conversation.count({ where: { workspaceId } });
    const res = await request(app)
      .post('/api/v1/comments')
      .set(authOwner(workspaceId))
      .send({ text: 'What is the pricing? I want a demo call next week.', authorName: 'Prospect Pam' })
      .expect(201);
    expect(res.body.classification.type).toBe('LEAD_SIGNAL');
    expect(res.body.audienceSignalId).toBeTruthy();
    expect(res.body.salesSignalId).toBeTruthy();
    const commentId = res.body.comment.id as string;
    // Provenance both ways.
    const byComment = await request(app).get(`/api/v1/comments/${commentId}/sales-signals`).set(authOwner(workspaceId)).expect(200);
    expect((byComment.body.signals as Array<{ id: string }>).map((s) => s.id)).toContain(res.body.salesSignalId);
    const all = await request(app).get('/api/v1/comments/sales-signals').set(authOwner(workspaceId)).expect(200);
    const signal = (all.body.signals as Array<Record<string, unknown>>).find((s) => s.id === res.body.salesSignalId);
    expect(signal?.status).toBe('PENDING_REVIEW');
    expect(String(signal?.reason)).toMatch(/not a confirmed lead/);
    // Nothing was auto-created downstream.
    expect(await prisma.lead.count({ where: { workspaceId } })).toBe(leadsBefore);
    expect(await prisma.conversation.count({ where: { workspaceId } })).toBe(convosBefore);
    // Human review still creates no prospect.
    await request(app)
      .post(`/api/v1/comments/sales-signals/${res.body.salesSignalId}/review`)
      .set(authOwner(workspaceId))
      .send({ decision: 'REVIEWED' })
      .expect(200);
    expect(await prisma.lead.count({ where: { workspaceId } })).toBe(leadsBefore);
  });

  it('creates audience signals without sales signals for non-lead comments', async () => {
    const praise = await request(app)
      .post('/api/v1/comments')
      .set(authOwner(workspaceId))
      .send({ text: 'Great post, love the framework!', authorName: 'Fan Fran' })
      .expect(201);
    expect(praise.body.classification.type).toBe('PRAISE');
    expect(praise.body.salesSignalId).toBeNull();
    expect(praise.body.audienceSignalId).toBeTruthy();
    const question = await request(app)
      .post('/api/v1/comments')
      .set(authOwner(workspaceId))
      .send({ text: 'How do you handle follow-ups at scale?', authorName: 'Curious Cal' })
      .expect(201);
    expect(question.body.audienceSignalId).toBeTruthy();
    expect(question.body.salesSignalId).toBeNull();
    const signals = await request(app).get('/api/v1/comments/signals').set(authOwner(workspaceId)).expect(200);
    const types = (signals.body.signals as Array<{ signalType: string }>).map((s) => s.signalType);
    expect(types).toContain('COMMENT_PRAISE');
    expect(types).toContain('COMMENT_QUESTION');
  });

  it('ignores spam entirely', async () => {
    const signalsBefore = await prisma.audienceSignal.count({ where: { workspaceId } });
    const res = await request(app)
      .post('/api/v1/comments')
      .set(authOwner(workspaceId))
      .send({ text: 'Buy followers crypto casino click here!!!!', authorName: 'Spammer' })
      .expect(201);
    expect(res.body.classification.type).toBe('SPAM');
    expect(res.body.audienceSignalId).toBeNull();
    expect(res.body.salesSignalId).toBeNull();
    expect(await prisma.audienceSignal.count({ where: { workspaceId } })).toBe(signalsBefore);
  });
});

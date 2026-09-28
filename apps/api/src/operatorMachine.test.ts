import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `phase6-owner-${stamp}@example.com`;
const outsiderEmail = `phase6-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let outsiderToken = '';
let workspaceId = '';
let emptyWorkspaceId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase6 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

// Step A contract: remove exactly this file's rows; never touch other files' data.
afterAll(async () => {
  await cleanupTestData({
    workspaceIds: [workspaceId, emptyWorkspaceId],
    userEmails: [ownerEmail, outsiderEmail, `phase6-empty-${stamp}@example.com`],
  });
});

describe('Phase 6 setup', () => {
  it('registers users and creates an isolated workspace with artifacts', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase6 WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;

    const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    const topic = await prisma.topic.create({
      data: { workspaceId, name: 'Workflows', canonicalName: `workflows-${stamp}`, description: 'Workflow topic' },
    });
    await prisma.contentOpportunity.create({
      data: {
        workspaceId, topicId: topic.id, title: 'Workflow opportunity', thesis: 'Workflows beat tools.',
        problem: 'Tool sprawl.', audience: 'Founders', angle: 'Practical', objective: 'TEACH_PRACTICAL',
        opportunityScore: 8, sourceIds: [], claimIds: [], trendSignalIds: [],
        reasoning: 'Seeded.', evidenceSummary: 'Seeded.',
      },
    });
    await prisma.contentGap.create({
      data: { workspaceId, topicId: topic.id, gapType: 'ANGLE', description: 'Missing checklist angle.', importanceScore: 0.7, evidence: 'Seeded.' },
    });
    await prisma.trendSignal.create({
      data: {
        workspaceId, topicId: topic.id, status: 'TRENDING', mentionCount: 5, sourceCount: 3,
        firstSeenAt: new Date(Date.now() - 5 * 86400000), lastSeenAt: new Date(),
        recencyScore: 0.9, sourceDiversityScore: 0.8, frequencyScore: 0.7, evidenceSummary: 'Seeded.',
      },
    });
    const idea = await prisma.contentIdea.create({
      data: { workspaceId, authorId: owner!.id, title: 'Seeded idea', status: 'DRAFT', tags: [] },
    });
    const draft = await prisma.contentDraft.create({
      data: { workspaceId, contentIdeaId: idea.id, authorId: owner!.id, body: 'Seeded draft body with enough length to be valid content here.', version: 1 },
    });
    await prisma.contentReview.create({
      data: { workspaceId, draftId: draft.id, status: 'SUBMITTED', requestedBy: owner!.id },
    });
    const oldDraft = await prisma.contentDraft.create({
      data: { workspaceId, contentIdeaId: idea.id, authorId: owner!.id, body: 'Old idle draft body with enough length to be valid content.', version: 2 },
    });
    await prisma.contentDraft.update({
      where: { id: oldDraft.id },
      data: { updatedAt: new Date(Date.now() - 20 * 86400000) },
    });
    const lead = await prisma.lead.create({
      data: { workspaceId, linkedinUrl: `https://linkedin.com/in/phase6-${stamp}`, name: 'Op Lead' },
    });
    const followUp = await prisma.followUpRecommendation.create({
      data: {
        workspaceId, leadId: lead.id, recommendation: 'FOLLOW_UP_NOW',
        why: 'Requested a demo slot.', evidence: 'Message text.',
      },
    });
    expect(followUp.id).toBeDefined();

    const strategy = await prisma.outreachStrategy.create({
      data: {
        workspaceId, leadId: lead.id, objective: 'Intro', audience: 'CTOs',
        relationshipStage: 'COLD', angle: 'problem-led', reasonForContact: 'Seeded.',
        personalizationLevel: 'LIGHT', status: 'DRAFT', createdBy: owner!.id,
      },
    });
    const outreachDraft = await prisma.outreachDraft.create({
      data: {
        workspaceId, strategyId: strategy.id, leadId: lead.id, draftType: 'FIRST_MESSAGE',
        opening: 'Hi.', relevance: 'Seeded relevance.', value: 'Seeded value.',
        body: 'Hi, seeded outreach body with enough length to be valid.',
        version: 1, createdBy: owner!.id,
      },
    });
    await prisma.outreachReview.create({
      data: { workspaceId, draftId: outreachDraft.id, status: 'SUBMITTED', requestedBy: owner!.id },
    });
    await prisma.preparedAction.create({
      data: { workspaceId, actionType: 'SEND_FIRST_MESSAGE', target: 'Op Lead', status: 'READY_FOR_AUTHORIZED_EXECUTION' },
    });
    await prisma.learningProposal.create({
      data: {
        workspaceId, dimension: 'timeliness', observedPattern: 'Observed pattern: seeded.',
        supportingMeasurements: {}, sourceMetricIds: [], sampleSize: 4, denominator: 10,
        proposedAdjustment: 0.05, reason: 'Seeded reason.',
      },
    });
  });
});

describe('Operator next-actions', () => {
  it('collects, ranks, and explains multi-artifact candidates', async () => {
    const response = await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
    const actions = response.body.actions as Array<{ id: string; kind: string; score: number; reasons: string[]; evidenceLinks: unknown[] }>;
    expect(actions.length).toBeGreaterThanOrEqual(8);
    expect(response.body.total).toBe(actions.length);
    for (const action of actions) {
      expect(action.id).toBeDefined();
      expect(action.score).toBeGreaterThanOrEqual(0);
      expect(action.score).toBeLessThanOrEqual(100);
      expect(action.reasons.length).toBeGreaterThan(0);
    }
    const scores = actions.map((a) => a.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    const kinds = new Set(actions.map((a) => a.kind));
    for (const expected of ['content_opportunity', 'content_gap', 'trend_signal', 'content_review', 'outreach_review', 'follow_up', 'prepared_action', 'learning_proposal', 'stale_draft']) {
      expect(kinds.has(expected)).toBe(true);
    }
  });

  it('refresh does not duplicate persisted rows', async () => {
    await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
    await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
    const rows = await prisma.operatorAction.findMany({ where: { workspaceId, status: 'PENDING' } });
    const keys = rows.map((r) => r.identityKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('excludes stale artifacts whose lifecycle changed', async () => {
    const opp = await prisma.contentOpportunity.findFirst({ where: { workspaceId } });
    await prisma.contentOpportunity.update({ where: { id: opp!.id }, data: { status: 'CONVERTED' } });
    const response = await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
    const kinds = (response.body.actions as Array<{ kind: string }>).map((a) => a.kind);
    expect(kinds).not.toContain('content_opportunity');
    await prisma.contentOpportunity.update({ where: { id: opp!.id }, data: { status: 'NEW' } });
  });

  it('dismisses and completes, then excludes; invalid transitions rejected', async () => {
    const first = await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
    const gap = (first.body.actions as Array<{ id: string; kind: string }>).find((a) => a.kind === 'content_gap')!;
    expect(gap).toBeDefined();
    await request(app).post(`/api/v1/operator/actions/${gap.id}/dismiss`).set(authOwner()).send({}).expect(200);

    const second = await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
    expect((second.body.actions as Array<{ id: string }>).some((a) => a.id === gap.id)).toBe(false);

    const trend = (second.body.actions as Array<{ id: string; kind: string }>).find((a) => a.kind === 'trend_signal')!;
    await request(app).post(`/api/v1/operator/actions/${trend.id}/complete`).set(authOwner()).send({}).expect(200);
    const third = await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
    expect((third.body.actions as Array<{ id: string }>).some((a) => a.id === trend.id)).toBe(false);

    await request(app).post(`/api/v1/operator/actions/${gap.id}/complete`).set(authOwner()).send({}).expect(422);
    await request(app).post('/api/v1/operator/actions/missing-id/dismiss').set(authOwner()).send({}).expect(404);
  });

  it('explains actions deterministically with honest AI state', async () => {
    const response = await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
    const action = (response.body.actions as Array<{ id: string }>)[0]!;
    const explanation = await request(app).get(`/api/v1/operator/explanations/${action.id}`).set(authOwner()).expect(200);
    expect(explanation.body.explanation.reasons.length).toBeGreaterThan(0);
    expect(explanation.body.explanation.dimensions.length).toBeGreaterThan(0);
    expect(explanation.body.explanation.lifecycle.length).toBeGreaterThan(0);

    const ai = await request(app).get(`/api/v1/operator/explanations/${action.id}?format=ai`).set(authOwner()).expect(200);
    expect(ai.body.aiAvailable).toBe(false);
    expect(ai.body.explanation).toBeDefined();
  });

  it('denies cross-workspace access', async () => {
    await request(app).get('/api/v1/operator/next-actions').set(authOutsider()).expect(403);
    const owned = await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
    const actionId = (owned.body.actions as Array<{ id: string }>)[0]!.id;
    await request(app).post(`/api/v1/operator/actions/${actionId}/dismiss`).set(authOutsider()).send({}).expect(403);
    await request(app).get(`/api/v1/operator/explanations/${actionId}`).set(authOutsider()).expect(403);
  });

  it('returns explicit empty state, never ranked noise', async () => {
    const email = `phase6-empty-${stamp}@example.com`;
    await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Empty' }).expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
    const token = login.body.token as string;
    const ws = await request(app).post('/api/v1/workspaces').set('Authorization', `Bearer ${token}`).send({ name: `Empty WS ${stamp}` }).expect(201);
    emptyWorkspaceId = (ws.body.workspace?.id ?? ws.body.id) as string;
    const headers = { Authorization: `Bearer ${token}`, 'X-Workspace-ID': emptyWorkspaceId };
    const response = await request(app).get('/api/v1/operator/next-actions').set(headers).expect(200);
    expect(response.body.actions).toEqual([]);
    expect(response.body.total).toBe(0);
  });
});

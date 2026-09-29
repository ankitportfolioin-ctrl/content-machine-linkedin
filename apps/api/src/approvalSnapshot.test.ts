import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { runDailyLoop } from './worker/dailyRun';

const stamp = Date.now();
const email = `snap-${stamp}@example.com`;
const outsiderEmail = `snap-out-${stamp}@example.com`;
const password = 'testpassword123';

let token = '';
let outsiderToken = '';
let workspaceId = '';
let runId = '';
let actionId = '';
let contentReviewId = '';
let outreachReviewId = '';

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Workspace-ID': workspaceId });

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [email, outsiderEmail] });
});

describe('approval snapshot freezes run-time approval state', () => {
  it('sets up a workspace with pending approvals', async () => {
    await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Snap User' }).expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
    token = login.body.token as string;
    const owner = await prisma.user.findUnique({ where: { email } });
    await request(app).post('/api/v1/auth/register').send({ email: outsiderEmail, password, name: 'Out' }).expect(201);
    const outLogin = await request(app).post('/api/v1/auth/login').send({ email: outsiderEmail, password }).expect(200);
    outsiderToken = outLogin.body.token as string;

    const ws = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Snap WS ${stamp}` })
      .expect(201);
    workspaceId = (ws.body.workspace?.id ?? ws.body.id) as string;

    const topic = await prisma.topic.create({
      data: { workspaceId, name: 'Snapshot topic', canonicalName: `snap-topic-${stamp}` },
    });
    await prisma.contentOpportunity.create({
      data: {
        workspaceId, topicId: topic.id, title: 'Snapshot opportunity', thesis: 'T.',
        problem: 'P.', audience: 'A.', angle: 'Practical.', objective: 'TEACH_PRACTICAL',
        opportunityScore: 0.7, status: 'NEW', sourceIds: [], claimIds: [], trendSignalIds: [],
        reasoning: 'Seeded.', evidenceSummary: 'Seeded.',
      },
    });
    const idea = await prisma.contentIdea.create({
      data: { workspaceId, authorId: owner!.id, title: 'Snapshot idea', status: 'DRAFT', tags: [] },
    });
    const draft = await prisma.contentDraft.create({
      data: { workspaceId, contentIdeaId: idea.id, authorId: owner!.id, body: 'Snapshot draft body with enough length to be valid.', version: 3 },
    });
    const review = await prisma.contentReview.create({
      data: { workspaceId, draftId: draft.id, status: 'SUBMITTED', requestedBy: owner!.id },
    });
    contentReviewId = review.id;

    const lead = await prisma.lead.create({
      data: { workspaceId, linkedinUrl: `https://linkedin.com/in/snap-lead-${stamp}`, name: 'Snap Lead' },
    });
    const strategy = await prisma.outreachStrategy.create({
      data: {
        workspaceId, leadId: lead.id, objective: 'Intro', audience: 'Leads',
        relationshipStage: 'COLD', angle: 'problem-led', reasonForContact: 'Seeded.',
        personalizationLevel: 'LIGHT', status: 'DRAFT', createdBy: owner!.id,
      },
    });
    const outreachDraft = await prisma.outreachDraft.create({
      data: {
        workspaceId, strategyId: strategy.id, leadId: lead.id, draftType: 'FIRST_MESSAGE',
        opening: 'Hi.', relevance: 'Seeded.', value: 'Seeded.',
        body: 'Hi, seeded outreach body with enough length to be valid.',
        version: 2, createdBy: owner!.id,
      },
    });
    const outReview = await prisma.outreachReview.create({
      data: { workspaceId, draftId: outreachDraft.id, status: 'SUBMITTED', requestedBy: owner!.id },
    });
    outreachReviewId = outReview.id;
  });

  it('captures exact items with versions and scores on the daily run', async () => {
    const result = await runDailyLoop(workspaceId, '2026-11-10');
    expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);
    runId = result.runId;
    const stage = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRunId: runId, stage: 'APPROVAL_SNAPSHOT' },
    });
    expect(stage?.status).toBe('SUCCEEDED');

    const res = await request(app).get(`/api/v1/runs/${runId}/approval-snapshot`).set(auth()).expect(200);
    const snap = res.body.snapshot;
    expect(snap.workspaceId).toBe(workspaceId);
    expect(snap.dailyRunId).toBe(runId);
    const items = snap.items as {
      runId: string; capturedAt: string;
      actions: Array<{ actionId: string; kind: string; score: number; reasons: string[] }>;
      contentReviews: Array<{ reviewId: string; draftId: string; draftVersion: number; waitingDays: number }>;
      outreachReviews: Array<{ reviewId: string; draftId: string; draftVersion: number; leadId: string }>;
    };
    expect(items.runId).toBe(runId);
    expect(items.capturedAt).toBeTruthy();
    expect(items.actions.length).toBeGreaterThan(0);
    const oppAction = items.actions.find((a) => a.kind === 'content_opportunity');
    expect(oppAction).toBeDefined();
    actionId = oppAction!.actionId;
    expect(typeof oppAction!.score).toBe('number');
    expect(oppAction!.reasons.length).toBeGreaterThan(0);
    const content = items.contentReviews.find((r) => r.reviewId === contentReviewId);
    expect(content).toBeDefined();
    expect(content!.draftVersion).toBe(3);
    const outreach = items.outreachReviews.find((r) => r.reviewId === outreachReviewId);
    expect(outreach).toBeDefined();
    expect(outreach!.draftVersion).toBe(2);
    expect(outreach!.leadId).toBeTruthy();
  });

  it('stays frozen after live human decisions move on', async () => {
    // Human dismisses the action and decides the review AFTER the snapshot.
    await request(app).post(`/api/v1/operator/actions/${actionId}/dismiss`).set(auth()).send({ reason: 'Not now.' }).expect(200);
    const before = await request(app).get(`/api/v1/runs/${runId}/approval-snapshot`).set(auth()).expect(200);
    const items = before.body.snapshot.items as { actions: Array<{ actionId: string; status: string }> };
    // Frozen copy still shows the action as it was (PENDING at capture).
    expect(items.actions.some((a) => a.actionId === actionId)).toBe(true);
  });

  it('writes exactly one row per run even across resume (idempotent)', async () => {
    // Simulate a crash after the snapshot: drop two later stages, rewind.
    const run = await prisma.dailyRun.findUnique({ where: { id: runId } });
    expect(run).toBeDefined();
    await prisma.runStage.deleteMany({
      where: { dailyRunId: runId, stage: { in: ['OBSERVE_LEARN', 'DIGEST'] } },
    });
    await prisma.dailyRun.update({ where: { id: runId }, data: { status: 'RUNNING', finishedAt: null } });
    const resumed = await runDailyLoop(workspaceId, '2026-11-10');
    expect(resumed.runId).toBe(runId);
    expect(resumed.resumed).toBe(true);
    const count = await prisma.approvalSnapshot.count({ where: { workspaceId, dailyRunId: runId } });
    expect(count).toBe(1);
  });

  it('isolates snapshots by workspace and 404s cleanly', async () => {
    const outsiderWs = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: `Snap Out WS ${stamp}` })
      .expect(201);
    const outsiderWsId = (outsiderWs.body.workspace?.id ?? outsiderWs.body.id) as string;
    const headers = { Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': outsiderWsId };
    await request(app).get(`/api/v1/runs/${runId}/approval-snapshot`).set(headers).expect(404);
    await request(app).get('/api/v1/runs/missing-run-id/approval-snapshot').set(auth()).expect(404);
    await cleanupTestData({ workspaceIds: [outsiderWsId], userEmails: [] });
  });
});

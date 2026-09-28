import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `phase14-owner-${stamp}@example.com`;
const outsiderEmail = `phase14-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let outsiderToken = '';
let workspaceId = '';
let otherWorkspaceId = '';
let oppAId = '';
let oppBId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase14 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

interface RankedAction {
  id: string;
  kind: string;
  subjectId: string | null;
  score: number;
}

async function opportunityActions(): Promise<RankedAction[]> {
  const res = await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
  return (res.body.actions as RankedAction[]).filter((a) => a.kind === 'content_opportunity');
}

async function vote(opportunityId: string, feedback: string, reason?: string) {
  return request(app)
    .post(`/api/v1/intelligence/opportunities/${opportunityId}/feedback`)
    .set(authOwner())
    .send(reason ? { feedback, reason } : { feedback })
    .expect(201);
}

describe('Phase 14 setup', () => {
  it('registers users and seeds two opportunities', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase14 WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;

    const topic = await prisma.topic.create({
      data: {
        workspaceId,
        name: `Feedback topic ${stamp}`,
        canonicalName: `feedback-topic-${stamp}`,
        description: 'Topic for feedback ranking tests',
      },
    });
    const mkOpp = (title: string, score: number) =>
      prisma.contentOpportunity.create({
        data: {
          workspaceId, topicId: topic.id, title, thesis: `${title} thesis.`,
          problem: 'Problem.', audience: 'Audience.', angle: 'Angle.',
          objective: 'TEACH_PRACTICAL', opportunityScore: score,
          sourceIds: [], claimIds: [], trendSignalIds: [],
          reasoning: 'Seeded.', evidenceSummary: 'Seeded.',
        },
      });
    oppAId = (await mkOpp(`Opportunity Alpha ${stamp}`, 0.8)).id;
    oppBId = (await mkOpp(`Opportunity Beta ${stamp}`, 0.75)).id;
  }, 60000);
});

describe('Opportunity-feedback-driven ranking', () => {
  it('detail returns an honest empty summary with zero feedback', async () => {
    const res = await request(app).get(`/api/v1/intelligence/opportunities/${oppAId}`).set(authOwner()).expect(200);
    expect(res.body.feedbackSummary).toEqual({
      total: 0,
      counts: { USEFUL: 0, NOT_USEFUL: 0, ALREADY_COVERED: 0, WRONG_AUDIENCE: 0, WEAK_EVIDENCE: 0, NOT_TIMELY: 0 },
      reasons: [],
    });
  });

  it('votes appear with correct counts and reasons', async () => {
    await vote(oppAId, 'useful');
    await vote(oppAId, 'wrong_audience', 'Too generic for our niche.');
    const res = await request(app).get(`/api/v1/intelligence/opportunities/${oppAId}`).set(authOwner()).expect(200);
    const summary = res.body.feedbackSummary as { total: number; counts: Record<string, number>; reasons: Array<{ feedback: string; reason: string }> };
    expect(summary.total).toBe(2);
    expect(summary.counts).toMatchObject({ USEFUL: 1, WRONG_AUDIENCE: 1, NOT_USEFUL: 0 });
    expect(summary.reasons).toHaveLength(1);
    expect(summary.reasons[0]).toMatchObject({ feedback: 'WRONG_AUDIENCE', reason: 'Too generic for our niche.' });
  });

  it('score view exposes ranked overall beside the untouched base', async () => {
    const res = await request(app).get(`/api/v1/intelligence/opportunities/${oppAId}/score`).set(authOwner()).expect(200);
    expect(typeof res.body.scoring.overallScore).toBe('number');
    expect(res.body.rankedOverallScore).toBeLessThanOrEqual(res.body.scoring.overallScore);
    expect(res.body.feedbackPenalty).toBeGreaterThan(0);
    expect(res.body.feedbackSummary.total).toBe(2);
    // Base dimensions are recomputed, never rewritten by feedback.
    expect(Array.isArray(res.body.scoring.dimensions)).toBe(true);
  });

  it('ranked operator actions demote the down-voted opportunity', async () => {
    const before = await opportunityActions();
    const rankOf = (list: RankedAction[], id: string) => list.findIndex((a) => a.subjectId === id);
    expect(rankOf(before, oppAId)).toBeGreaterThanOrEqual(0);
    expect(rankOf(before, oppBId)).toBeGreaterThanOrEqual(0);
    expect(rankOf(before, oppAId)).toBeLessThan(rankOf(before, oppBId));

    await vote(oppAId, 'not_useful', 'Covered last month.');
    const after = await opportunityActions();
    // A: 0.80 − 2×0.05 = 0.70 relevance vs B: 0.75 → order flips, neither deleted.
    expect(rankOf(after, oppAId)).toBeGreaterThan(rankOf(after, oppBId));
    expect(after.map((a) => a.subjectId)).toContain(oppAId);
  });

  it('zero-feedback opportunities keep existing ranking exactly', async () => {
    const first = await opportunityActions();
    const second = await opportunityActions();
    const scoreOf = (list: RankedAction[], id: string) => list.find((a) => a.subjectId === id)!.score;
    expect(scoreOf(first, oppBId)).toBe(scoreOf(second, oppBId));
  });

  it('foreign workspace feedback stays invisible', async () => {
    const other = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase14 Other WS ${stamp}` })
      .expect(201);
    otherWorkspaceId = (other.body.workspace?.id ?? other.body.id) as string;
    const otherTopic = await prisma.topic.create({
      data: { workspaceId: otherWorkspaceId, name: `Other topic ${stamp}`, canonicalName: `other-topic-${stamp}` },
    });
    const otherOpp = await prisma.contentOpportunity.create({
      data: {
        workspaceId: otherWorkspaceId, topicId: otherTopic.id, title: `Other opp ${stamp}`,
        thesis: 'T.', problem: 'P.', audience: 'A.', angle: 'A.', objective: 'TEACH_PRACTICAL',
        opportunityScore: 0.9, sourceIds: [], claimIds: [], trendSignalIds: [],
        reasoning: 'S.', evidenceSummary: 'S.',
      },
    });
    await request(app)
      .post(`/api/v1/intelligence/opportunities/${otherOpp.id}/feedback`)
      .set({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': otherWorkspaceId })
      .send({ feedback: 'not_useful', reason: 'Foreign vote.' })
      .expect(201);

    const res = await request(app).get(`/api/v1/intelligence/opportunities/${oppAId}`).set(authOwner()).expect(200);
    expect(res.body.feedbackSummary.total).toBe(3);
    // The foreign opportunity itself is unreachable from this workspace.
    await request(app).get(`/api/v1/intelligence/opportunities/${otherOpp.id}`).set(authOwner()).expect(404);
  });

  it('denies outsiders on feedback and detail', async () => {
    await request(app)
      .post(`/api/v1/intelligence/opportunities/${oppAId}/feedback`)
      .set(authOutsider())
      .send({ feedback: 'useful' })
      .expect(403);
    await request(app).get(`/api/v1/intelligence/opportunities/${oppAId}`).set(authOutsider()).expect(403);
  });

  it('orphaned feedback is ignored', async () => {
    const temp = await prisma.contentOpportunity.create({
      data: {
        workspaceId, topicId: (await prisma.topic.findFirst({ where: { workspaceId } }))!.id,
        title: `Temp opp ${stamp}`, thesis: 'T.', problem: 'P.', audience: 'A.', angle: 'A.',
        objective: 'TEACH_PRACTICAL', opportunityScore: 0.5, sourceIds: [], claimIds: [],
        trendSignalIds: [], reasoning: 'S.', evidenceSummary: 'S.',
      },
    });
    await vote(temp.id, 'not_useful', 'Orphan me.');
    await prisma.contentOpportunity.delete({ where: { id: temp.id } });

    await request(app).get(`/api/v1/intelligence/opportunities/${temp.id}`).set(authOwner()).expect(404);
    const actions = await opportunityActions();
    expect(actions.map((a) => a.subjectId)).not.toContain(temp.id);
  });

  it('convert flow remains unchanged', async () => {
    const res = await request(app)
      .post(`/api/v1/intelligence/opportunities/${oppBId}/convert`)
      .set(authOwner())
      .send({})
      .expect(201);
    expect(res.body.contentIdea.status).toBe('DRAFT');
    const opp = await prisma.contentOpportunity.findFirst({ where: { id: oppBId } });
    expect(opp!.status).toBe('CONVERTED');
  });
});

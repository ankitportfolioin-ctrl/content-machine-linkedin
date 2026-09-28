import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `phase15-owner-${stamp}@example.com`;
const outsiderEmail = `phase15-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let outsiderToken = '';
let workspaceId = '';
let oppNewId = '';
let oppReviewId = '';
let oppDismissId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase15 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

async function mkOpp(title: string, score: number): Promise<string> {
  const topic = await prisma.topic.create({
    data: {
      workspaceId,
      name: `Triage topic ${title} ${stamp}`,
      canonicalName: `triage-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}`,
      description: 'Topic for triage tests',
    },
  });
  const opp = await prisma.contentOpportunity.create({
    data: {
      workspaceId, topicId: topic.id, title: `${title} ${stamp}`, thesis: `${title} thesis.`,
      problem: 'Problem.', audience: 'Audience.', angle: 'Angle.', objective: 'TEACH_PRACTICAL',
      opportunityScore: score, sourceIds: [], claimIds: [], trendSignalIds: [],
      reasoning: 'Seeded.', evidenceSummary: 'Seeded.',
    },
  });
  return opp.id;
}

interface RankedAction {
  id: string;
  kind: string;
  subjectId: string | null;
}

async function opportunityActionIds(): Promise<string[]> {
  const res = await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
  return (res.body.actions as RankedAction[])
    .filter((a) => a.kind === 'content_opportunity')
    .map((a) => a.subjectId as string);
}

describe('Phase 15 setup', () => {
  it('registers users and seeds three NEW opportunities', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase15 WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;

    oppNewId = await mkOpp('Alpha', 0.8);
    oppReviewId = await mkOpp('Beta', 0.75);
    oppDismissId = await mkOpp('Gamma', 0.7);
  }, 60000);
});

describe('Opportunity triage transitions', () => {
  it('1. NEW → REVIEWED succeeds', async () => {
    const res = await request(app)
      .patch(`/api/v1/intelligence/opportunities/${oppReviewId}/status`)
      .set(authOwner())
      .send({ status: 'REVIEWED' })
      .expect(200);
    expect(res.body.opportunity.id).toBe(oppReviewId);
    expect(res.body.opportunity.status).toBe('REVIEWED');
  });

  it('2. NEW → DISMISSED succeeds', async () => {
    const res = await request(app)
      .patch(`/api/v1/intelligence/opportunities/${oppDismissId}/status`)
      .set(authOwner())
      .send({ status: 'DISMISSED' })
      .expect(200);
    expect(res.body.opportunity.status).toBe('DISMISSED');
  });

  it('3-4. reviewed and dismissed leave the active operator queue', async () => {
    const ids = await opportunityActionIds();
    expect(ids).toContain(oppNewId);
    expect(ids).not.toContain(oppReviewId);
    expect(ids).not.toContain(oppDismissId);
  });

  it('5-6. reviewed/dismissed appear under their filters', async () => {
    const reviewed = await request(app)
      .get('/api/v1/intelligence/opportunities?status=REVIEWED')
      .set(authOwner())
      .expect(200);
    expect((reviewed.body.opportunities as Array<{ id: string }>).map((o) => o.id)).toContain(oppReviewId);
    const dismissed = await request(app)
      .get('/api/v1/intelligence/opportunities?status=DISMISSED')
      .set(authOwner())
      .expect(200);
    expect((dismissed.body.opportunities as Array<{ id: string }>).map((o) => o.id)).toContain(oppDismissId);
  });

  it('7-8. default NEW query excludes reviewed and dismissed', async () => {
    const res = await request(app).get('/api/v1/intelligence/opportunities?status=NEW').set(authOwner()).expect(200);
    const ids = (res.body.opportunities as Array<{ id: string }>).map((o) => o.id);
    expect(ids).toContain(oppNewId);
    expect(ids).not.toContain(oppReviewId);
    expect(ids).not.toContain(oppDismissId);
  });

  it('10. invalid transitions return 422 and change nothing', async () => {
    // REVIEWED → DISMISSED / NEW, DISMISSED → REVIEWED, unknown destination.
    for (const [id, status] of [
      [oppReviewId, 'DISMISSED'],
      [oppReviewId, 'NEW'],
      [oppDismissId, 'REVIEWED'],
      [oppNewId, 'ARCHIVED'],
    ] as Array<[string, string]>) {
      const res = await request(app)
        .patch(`/api/v1/intelligence/opportunities/${id}/status`)
        .set(authOwner())
        .send({ status })
        .expect(422);
      expect(res.body.error.code).toBe('INVALID_TRANSITION');
    }
    expect((await prisma.contentOpportunity.findFirst({ where: { id: oppReviewId } }))!.status).toBe('REVIEWED');
    expect((await prisma.contentOpportunity.findFirst({ where: { id: oppDismissId } }))!.status).toBe('DISMISSED');
    expect((await prisma.contentOpportunity.findFirst({ where: { id: oppNewId } }))!.status).toBe('NEW');
  });

  it('11. nonexistent opportunity returns 404', async () => {
    await request(app)
      .patch('/api/v1/intelligence/opportunities/00000000-0000-4000-8000-000000000000/status')
      .set(authOwner())
      .send({ status: 'DISMISSED' })
      .expect(404);
  });

  it('12. foreign workspace opportunity cannot be changed', async () => {
    const other = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase15 Other WS ${stamp}` })
      .expect(201);
    const otherWs = (other.body.workspace?.id ?? other.body.id) as string;
    const otherTopic = await prisma.topic.create({
      data: { workspaceId: otherWs, name: `Other ${stamp}`, canonicalName: `other-${stamp}` },
    });
    const otherOpp = await prisma.contentOpportunity.create({
      data: {
        workspaceId: otherWs, topicId: otherTopic.id, title: `Other ${stamp}`, thesis: 'T.',
        problem: 'P.', audience: 'A.', angle: 'A.', objective: 'TEACH_PRACTICAL',
        opportunityScore: 0.9, sourceIds: [], claimIds: [], trendSignalIds: [],
        reasoning: 'S.', evidenceSummary: 'S.',
      },
    });
    await request(app)
      .patch(`/api/v1/intelligence/opportunities/${otherOpp.id}/status`)
      .set(authOwner())
      .send({ status: 'DISMISSED' })
      .expect(404);
    expect((await prisma.contentOpportunity.findFirst({ where: { id: otherOpp.id } }))!.status).toBe('NEW');
  });

  it('13. outsider receives 403', async () => {
    await request(app)
      .patch(`/api/v1/intelligence/opportunities/${oppNewId}/status`)
      .set(authOutsider())
      .send({ status: 'DISMISSED' })
      .expect(403);
    expect((await prisma.contentOpportunity.findFirst({ where: { id: oppNewId } }))!.status).toBe('NEW');
  });

  it('9/14/15/16/17. convert, feedback, scoring, and learning paths unchanged', async () => {
    const converted = await request(app)
      .post(`/api/v1/intelligence/opportunities/${oppNewId}/convert`)
      .set(authOwner())
      .send({})
      .expect(201);
    expect(converted.body.contentIdea.status).toBe('DRAFT');

    await request(app)
      .post(`/api/v1/intelligence/opportunities/${oppReviewId}/feedback`)
      .set(authOwner())
      .send({ feedback: 'useful' })
      .expect(201);
    const detail = await request(app).get(`/api/v1/intelligence/opportunities/${oppReviewId}`).set(authOwner()).expect(200);
    expect(detail.body.feedbackSummary.total).toBe(1);

    const score = await request(app).get(`/api/v1/intelligence/opportunities/${oppReviewId}/score`).set(authOwner()).expect(200);
    expect(typeof score.body.scoring.overallScore).toBe('number');
    expect(typeof score.body.rankedOverallScore).toBe('number');
  });
});

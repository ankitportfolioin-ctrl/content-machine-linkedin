/**
 * WP4: content calendar is a planning-only read model over existing rows.
 * It sequences approved/draft/reviewed/published work, reports mix
 * distribution, and flags repetition/bottleneck/over-posting conflicts.
 * It never schedules or dispatches anything.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const password = 'testpassword123';

let tokenA = '';
let workspaceA = '';
let userIdA = '';
let tokenB = '';
let workspaceB = '';

async function registerAndLogin(email: string): Promise<{ token: string; userId: string }> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Calendar User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return { token: login.body.token as string, userId: login.body.user.id as string };
}

const authA = () => ({ Authorization: `Bearer ${tokenA}`, 'X-Workspace-ID': workspaceA });
const authB = () => ({ Authorization: `Bearer ${tokenB}`, 'X-Workspace-ID': workspaceB });

describe('content calendar (planning-only read model)', () => {
  it('bootstraps two isolated workspaces', async () => {
    const a = await registerAndLogin(`cal-a-${stamp}@example.com`);
    tokenA = a.token;
    userIdA = a.userId;
    const b = await registerAndLogin(`cal-b-${stamp}@example.com`);
    tokenB = b.token;
    const wa = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `Cal WS A ${stamp}` })
      .expect(201);
    workspaceA = (wa.body.workspace?.id ?? wa.body.id) as string;
    const wb = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: `Cal WS B ${stamp}` })
      .expect(201);
    workspaceB = (wb.body.workspace?.id ?? wb.body.id) as string;
  });

  it('returns an honest empty calendar with a planning-only policy note', async () => {
    const res = await request(app).get('/api/v1/calendar?days=30').set(authA()).expect(200);
    expect(res.body.calendar.items).toEqual([]);
    expect(res.body.calendar.conflicts).toEqual([]);
    expect(res.body.calendar.counts).toEqual({ plans: 0, reviews: 0, drafts: 0, published: 0, experiments: 0 });
    expect(res.body.calendar.policy.schedulingNote).toMatch(/planning-only/i);
  });

  it('sequences plans, reviews, drafts, publications, and experiments', async () => {
    const idea = await prisma.contentIdea.create({
      data: { workspaceId: workspaceA, authorId: userIdA, title: `Cal idea ${stamp}` },
    });
    const plan = await prisma.contentPlan.create({
      data: {
        workspaceId: workspaceA,
        contentIdeaId: idea.id,
        thesis: 'Thesis for the calendar.',
        audience: 'Founders',
        objective: 'EDUCATE',
        angle: 'EDUCATIONAL',
        format: 'TEXT_POST',
        narrativeStructure: 'PROBLEM_WHY_SOLUTION',
        keyPoints: ['p1'],
        evidenceMap: [],
        status: 'APPROVED',
      },
    });
    const draft = await prisma.contentDraft.create({
      data: { workspaceId: workspaceA, contentIdeaId: idea.id, planId: plan.id, authorId: userIdA, body: 'Body text for the calendar draft.' },
    });
    await prisma.contentReview.create({
      data: { workspaceId: workspaceA, draftId: draft.id, status: 'SUBMITTED', requestedBy: userIdA },
    });
    await prisma.publishRecord.create({
      data: { workspaceId: workspaceA, channel: 'manual', recordedBy: userIdA },
    });

    const res = await request(app).get('/api/v1/calendar?days=30').set(authA()).expect(200);
    const kinds = new Set((res.body.calendar.items as Array<{ kind: string }>).map((i) => i.kind));
    for (const expected of ['plan', 'review', 'draft', 'published']) {
      expect(kinds.has(expected), expected).toBe(true);
    }
    expect(res.body.calendar.counts.plans).toBe(1);
    expect(res.body.calendar.distribution.objective).toEqual({ EDUCATE: 1 });
    expect(res.body.calendar.distribution.format).toEqual({ TEXT_POST: 1 });
  });

  it('flags topic repetition across two plans on one topic', async () => {
    const topic = await prisma.topic.create({
      data: { workspaceId: workspaceA, name: `Cal topic ${stamp}`, canonicalName: `cal-topic-${stamp}` },
    });
    for (let i = 0; i < 2; i += 1) {
      const idea = await prisma.contentIdea.create({
        data: { workspaceId: workspaceA, authorId: userIdA, title: `Cal repeat idea ${stamp}-${i}` },
      });
      await prisma.contentPlan.create({
        data: {
          workspaceId: workspaceA,
          contentIdeaId: idea.id,
          topicId: topic.id,
          thesis: `Thesis ${i}.`,
          audience: 'Founders',
          objective: 'EDUCATE',
          angle: 'EDUCATIONAL',
          format: 'TEXT_POST',
          narrativeStructure: 'PROBLEM_WHY_SOLUTION',
          keyPoints: ['p1'],
          evidenceMap: [],
          status: 'APPROVED',
        },
      });
    }
    const res = await request(app).get('/api/v1/calendar?days=30').set(authA()).expect(200);
    const repetition = (res.body.calendar.conflicts as Array<{ type: string }>).filter(
      (c) => c.type === 'topic_repetition'
    );
    expect(repetition.length).toBeGreaterThanOrEqual(1);
  });

  it('isolates workspaces: B sees none of A’s calendar', async () => {
    const res = await request(app).get('/api/v1/calendar?days=30').set(authB()).expect(200);
    expect(res.body.calendar.items).toEqual([]);
    expect(res.body.calendar.counts).toEqual({ plans: 0, reviews: 0, drafts: 0, published: 0, experiments: 0 });
  });

  it('rejects unauthenticated access and clamps the window', async () => {
    await request(app).get('/api/v1/calendar').expect(401);
    const res = await request(app).get('/api/v1/calendar?days=9999').set(authA()).expect(200);
    expect(res.body.calendar.windowDays).toBe(90);
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from './index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const password = 'testpassword123';

let tokenA = '';
let workspaceA = '';
let tokenB = '';
let workspaceB = '';

async function registerAndLogin(email: string): Promise<{ token: string; userId: string }> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Comment User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return { token: login.body.token as string, userId: login.body.user.id as string };
}

const authA = () => ({ Authorization: `Bearer ${tokenA}`, 'X-Workspace-ID': workspaceA });
const authB = () => ({ Authorization: `Bearer ${tokenB}`, 'X-Workspace-ID': workspaceB });

describe('comment ingestion + audience brain (integration)', () => {
  beforeAll(async () => {
    const a = await registerAndLogin(`comment-a-${stamp}@example.com`);
    tokenA = a.token;
    const b = await registerAndLogin(`comment-b-${stamp}@example.com`);
    tokenB = b.token;
    const wa = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: `Comment WS A ${stamp}` })
      .expect(201);
    workspaceA = (wa.body.workspace?.id ?? wa.body.id) as string;
    const wb = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: `Comment WS B ${stamp}` })
      .expect(201);
    workspaceB = (wb.body.workspace?.id ?? wb.body.id) as string;
  });

  it('ingests a comment with classification and suggested response', async () => {
    const res = await request(app)
      .post('/api/v1/comments')
      .set(authA())
      .send({
        text: 'What is the best way to learn something new?',
        platform: 'linkedin',
        authorName: 'Test Reader',
      })
      .expect(201);

    expect(res.body.comment).toBeDefined();
    expect(res.body.comment.text).toBe('What is the best way to learn something new?');
    expect(res.body.classification).toBeDefined();
    expect(res.body.classification.type).toBe('QUESTION');
    expect(res.body.suggestedResponse).toBeDefined();
    expect(res.body.suggestedResponse).toContain('short answer');
  });

  it('ingests a LEAD_SIGNAL comment and creates audience + sales signals', async () => {
    const res = await request(app)
      .post('/api/v1/comments')
      .set(authA())
      .send({
        text: 'What is the pricing? I want a demo call.',
        platform: 'linkedin',
        authorName: 'Interested Buyer',
      })
      .expect(201);

    expect(res.body.comment.isLeadSignal).toBe(true);
    expect(res.body.classification.type).toBe('LEAD_SIGNAL');
    expect(res.body.audienceSignalId).toBeDefined();
    expect(res.body.salesSignalId).toBeDefined();

    // Verify audience signal was created
    const signals = await request(app).get('/api/v1/comments/signals').set(authA()).expect(200);
    const leadSignal = signals.body.signals.find((s: any) => s.signalType === 'COMMENT_LEAD_SIGNAL');
    expect(leadSignal).toBeDefined();
    expect(leadSignal.strength).toBe(0.9);

    // Verify sales signal was created with PENDING_REVIEW
    const salesSignals = await request(app).get('/api/v1/comments/sales-signals').set(authA()).expect(200);
    const salesSignal = salesSignals.body.signals.find((s: any) => s.id === res.body.salesSignalId);
    expect(salesSignal).toBeDefined();
    expect(salesSignal.status).toBe('PENDING_REVIEW');
  });

  it('lists comments with filters', async () => {
    const res = await request(app).get('/api/v1/comments').set(authA()).expect(200);
    expect(res.body.comments).toBeInstanceOf(Array);
    expect(res.body.comments.length).toBeGreaterThanOrEqual(2);

    // Filter by type
    const filtered = await request(app).get('/api/v1/comments?type=LEAD_SIGNAL').set(authA()).expect(200);
    expect(filtered.body.comments.every((c: any) => c.type === 'LEAD_SIGNAL')).toBe(true);
  });

  it('links sales signals to comment', async () => {
    const res = await request(app)
      .post('/api/v1/comments')
      .set(authA())
      .send({ text: 'What is the pricing? I want a demo call.' })
      .expect(201);

    const signals = await request(app).get(`/api/v1/comments/${res.body.comment.id}/sales-signals`).set(authA()).expect(200);
    expect(signals.body.signals).toBeInstanceOf(Array);
    expect(signals.body.signals.length).toBeGreaterThanOrEqual(1);
  });

  it('reviews a sales signal (REVIEWED then DISMISSED)', async () => {
    const comment = await request(app)
      .post('/api/v1/comments')
      .set(authA())
      .send({ text: 'What is the pricing? I want a demo call.' })
      .expect(201);

    const signalId = comment.body.salesSignalId;
    expect(signalId).toBeDefined();

    // REVIEWED
    const reviewed = await request(app)
      .post(`/api/v1/comments/sales-signals/${signalId}/review`)
      .set(authA())
      .send({ decision: 'REVIEWED' })
      .expect(200);
    expect(reviewed.body.signal.status).toBe('REVIEWED');
    expect(reviewed.body.signal.reviewedBy).toBeDefined();

    // DISMISSED
    const dismissed = await request(app)
      .post(`/api/v1/comments/sales-signals/${signalId}/review`)
      .set(authA())
      .send({ decision: 'DISMISSED' })
      .expect(200);
    expect(dismissed.body.signal.status).toBe('DISMISSED');
  });

  it('enforces workspace isolation for comments', async () => {
    const commentA = await request(app)
      .post('/api/v1/comments')
      .set(authA())
      .send({ text: 'Question from A?' })
      .expect(201);

    // B cannot see A's comment
    const listB = await request(app).get('/api/v1/comments').set(authB()).expect(200);
    expect(listB.body.comments.find((c: any) => c.id === commentA.body.comment.id)).toBeUndefined();

    // B cannot access A's comment sales signals (returns empty, not 404)
    const signalsB = await request(app).get(`/api/v1/comments/${commentA.body.comment.id}/sales-signals`).set(authB()).expect(200);
    expect(signalsB.body.signals).toEqual([]);
  });

  it('audience segment CRUD + seed defaults', async () => {
    // Empty list initially
    let list = await request(app).get('/api/v1/audience').set(authA()).expect(200);
    expect(list.body.segments).toEqual([]);

    // Seed defaults
    const seeded = await request(app).post('/api/v1/audience/seed-defaults').set(authA()).expect(201);
    expect(seeded.body.segments.length).toBeGreaterThanOrEqual(7);

    // List shows seeded
    list = await request(app).get('/api/v1/audience').set(authA()).expect(200);
    expect(list.body.segments.length).toBeGreaterThanOrEqual(7);

    // Create custom segment
    const created = await request(app)
      .post('/api/v1/audience')
      .set(authA())
      .send({
        name: 'Custom Segment',
        type: 'CUSTOM',
        description: 'My custom audience',
        problems: ['problem 1'],
        goals: ['goal 1'],
      })
      .expect(201);
    expect(created.body.segment.id).toBeDefined();
    expect(created.body.segment.name).toBe('Custom Segment');

    // Update segment
    const updated = await request(app)
      .put(`/api/v1/audience/${created.body.segment.id}`)
      .set(authA())
      .send({ name: 'Updated Custom', description: 'Updated desc', type: 'CUSTOM' })
      .expect(200);
    expect(updated.body.segment.name).toBe('Updated Custom');

    // who-why endpoint (after update)
    const whoWhy = await request(app).get(`/api/v1/audience/${created.body.segment.id}/who-why`).set(authA()).expect(200);
    expect(whoWhy.body.who).toContain('Updated Custom');
    expect(whoWhy.body.whyCare).toContain('Problems:');
  });

  it('enforces workspace isolation for audience segments', async () => {
    const created = await request(app)
      .post('/api/v1/audience')
      .set(authA())
      .send({ name: 'A Segment', type: 'CUSTOM' })
      .expect(201);

    // B cannot see A's segment
    const listB = await request(app).get('/api/v1/audience').set(authB()).expect(200);
    expect(listB.body.segments.find((s: any) => s.id === created.body.segment.id)).toBeUndefined();

    // B cannot update A's segment (404 because segment doesn't exist in B's workspace)
    await request(app)
      .put(`/api/v1/audience/${created.body.segment.id}`)
      .set(authB())
      .send({ name: 'Hacked', type: 'CUSTOM' })
      .expect(404);

    // B cannot access A's who-why
    await request(app).get(`/api/v1/audience/${created.body.segment.id}/who-why`).set(authB()).expect(404);
  });

  it('audience signals are listed per workspace', async () => {
    // A's signal from earlier comment
    const signalsA = await request(app).get('/api/v1/comments/signals').set(authA()).expect(200);
    expect(signalsA.body.signals.length).toBeGreaterThanOrEqual(1);

    // B has no signals
    const signalsB = await request(app).get('/api/v1/comments/signals').set(authB()).expect(200);
    expect(signalsB.body.signals).toEqual([]);
  });
});
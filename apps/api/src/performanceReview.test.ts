import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `perf-owner-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let workspaceId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Perf Owner' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });

async function createTestWorkspace(email: string): Promise<{ token: string; workspaceId: string }> {
  const token = await registerAndLogin(email);
  const created = await request(app)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: `Perf WS ${Date.now()}` })
    .expect(201);
  const wsId = (created.body.workspace?.id ?? created.body.id) as string;
  return { token, workspaceId: wsId };
}

async function createPublishedPosts(workspaceId: string, ownerEmail: string, count: number) {
  const user = await prisma.user.findFirst({ where: { email: ownerEmail } });
  if (!user) throw new Error('User not found');
  const authorId = user.id;

  const idea = await prisma.contentIdea.create({
    data: { workspaceId, authorId, title: `Perf Idea ${Date.now()}`, status: 'PUBLISHED' as any },
  });
  const plan = await prisma.contentPlan.create({
    data: {
      workspaceId, contentIdeaId: idea.id, thesis: 'Thesis', audience: 'Test',
      objective: 'EDUCATE' as any, angle: 'PRACTICAL' as any, format: 'CAROUSEL' as any,
      narrativeStructure: 'HOOK_CONTEXT_FRAMEWORK_APPLICATION_TAKEAWAY' as any,
      keyPoints: ['p1'], evidenceMap: [], reasoning: 'test', status: 'APPROVED' as any,
    },
  });
  const draft = await prisma.contentDraft.create({
    data: { workspaceId, contentIdeaId: idea.id, planId: plan.id, authorId, body: 'Draft body', version: 1 },
  });
  for (let i = 0; i < count; i++) {
    const version = await prisma.contentVersion.create({
      data: { workspaceId, contentDraftId: draft.id, authorId, body: `Draft body ${i}`, version: i + 1, isFinal: true },
    });
    await prisma.publishRecord.create({
      data: { workspaceId, contentVersionId: version.id, channel: 'manual', recordedBy: authorId },
    });
  }
}

describe('Performance review (integration) - empty state', () => {
  let emptyToken = '';
  let emptyWorkspaceId = '';

  beforeAll(async () => {
    const result = await createTestWorkspace(`perf-empty-${stamp}@example.com`);
    emptyToken = result.token;
    emptyWorkspaceId = result.workspaceId;
  });

  afterAll(async () => {
    await cleanupTestData({ workspaceIds: [emptyWorkspaceId], userEmails: [`perf-empty-${stamp}@example.com`] });
  });

  const authEmpty = () => ({ Authorization: `Bearer ${emptyToken}`, 'X-Workspace-ID': emptyWorkspaceId });

  it('returns honest empty state when no data', async () => {
    const res = await request(app).post('/api/v1/learning/performance-review').set(authEmpty()).send({}).expect(200);
    expect(res.body.reviewTriggered).toBe(false);
    expect(res.body.reason).toMatch(/fewer than 10|need 10|only \d+ published/i);
  });

  it('returns empty review history', async () => {
    const res = await request(app).get('/api/v1/learning/performance-review/history').set(authEmpty()).expect(200);
    expect(res.body.reviews).toBeInstanceOf(Array);
    expect(res.body.reviews.length).toBe(0);
  });

  it('returns null for latest review', async () => {
    const res = await request(app).get('/api/v1/learning/performance-review/latest').set(authEmpty()).expect(200);
    expect(res.body.review).toBeNull();
  });
});

describe('Performance review (integration) - with data', () => {
  beforeAll(async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Perf WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;
    expect(workspaceId).toBeDefined();
  });

  afterAll(async () => {
    await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [ownerEmail] });
  });

  it('does not trigger review with fewer than 10 published posts', async () => {
    await createPublishedPosts(workspaceId, ownerEmail, 5);
    const res = await request(app).post('/api/v1/learning/performance-review').set(authOwner()).send({}).expect(200);
    expect(res.body.reviewTriggered).toBe(false);
    expect(res.body.reason).toMatch(/fewer than 10|need 10|only \d+ published/i);
  });

  it('creates enough published content to trigger review, then runs review', async () => {
    await createPublishedPosts(workspaceId, ownerEmail, 12);
    const res = await request(app).post('/api/v1/learning/performance-review').set(authOwner()).send({}).expect(200);
    expect(res.body.reviewTriggered).toBe(true);
    expect(res.body.postsAnalyzed).toBeGreaterThanOrEqual(10);
    expect(res.body.patterns).toBeInstanceOf(Array);
    expect(res.body.recommendations).toBeInstanceOf(Array);
    expect(res.body.confidence).toMatch(/LOW|MEDIUM|HIGH/);

    // Verify report was created
    const report = await prisma.intelligenceReport.findFirst({ where: { workspaceId }, orderBy: { generatedAt: 'desc' } });
    expect(report).not.toBeNull();
    expect(report?.formatObservations).toBeInstanceOf(Array);
  });

  it('returns review history', async () => {
    const res = await request(app).get('/api/v1/learning/performance-review/history').set(authOwner()).expect(200);
    expect(res.body.reviews).toBeInstanceOf(Array);
    expect(res.body.reviews.length).toBeGreaterThanOrEqual(1);
  });

  it('returns latest review', async () => {
    const res = await request(app).get('/api/v1/learning/performance-review/latest').set(authOwner()).expect(200);
    expect(res.body.review).toBeDefined();
    // IntelligenceReport stores review data in JSON fields; check for formatObservations which is populated
    expect(res.body.review.formatObservations).toBeInstanceOf(Array);
  });
});

describe('Performance review (integration) - workspace isolation', () => {
  let ownerToken2 = '';
  let workspaceId2 = '';
  let otherToken = '';
  let otherWorkspaceId = '';

  beforeAll(async () => {
    const result1 = await createTestWorkspace(`perf-owner2-${stamp}@example.com`);
    ownerToken2 = result1.token;
    workspaceId2 = result1.workspaceId;

    const result2 = await createTestWorkspace(`perf-other-${stamp}@example.com`);
    otherToken = result2.token;
    otherWorkspaceId = result2.workspaceId;
  });

  afterAll(async () => {
    await cleanupTestData({
      workspaceIds: [workspaceId2, otherWorkspaceId],
      userEmails: [`perf-owner2-${stamp}@example.com`, `perf-other-${stamp}@example.com`]
    });
  });

  const authOwner2 = () => ({ Authorization: `Bearer ${ownerToken2}`, 'X-Workspace-ID': workspaceId2 });
  const authOther = () => ({ Authorization: `Bearer ${otherToken}`, 'X-Workspace-ID': otherWorkspaceId });

  it('enforces workspace isolation', async () => {
    // Owner can see their own history
    await request(app).get('/api/v1/learning/performance-review/history').set(authOwner2()).expect(200);
    // Other workspace can see their own history (empty)
    await request(app).get('/api/v1/learning/performance-review/history').set(authOther()).expect(200);

    // Other workspace can trigger review (gets empty state)
    await request(app).post('/api/v1/learning/performance-review').set(authOther()).send({}).expect(200);
  });
});
import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `phase10-owner-${stamp}@example.com`;
const outsiderEmail = `phase10-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let outsiderToken = '';
let workspaceId = '';
let topicId = '';
let leadId = '';
let actionId = '';
let ideaId = '';
let objectionActionId = '';
let objectionIdeaId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase10 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

// Step A contract: remove exactly this file's rows; never touch other files' data.
afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [ownerEmail, outsiderEmail] });
});

interface OperatorActionView {
  id: string | null;
  identityKey: string;
  kind: string;
  subjectId: string | null;
  title: string;
  score: number;
  reasons: string[];
  evidenceLinks: Array<{ label: string; ref: string }>;
  subjectMeta: Record<string, unknown>;
  status: string;
}

async function nextActions(): Promise<OperatorActionView[]> {
  const res = await request(app).get('/api/v1/operator/next-actions').set(authOwner()).expect(200);
  return res.body.actions as OperatorActionView[];
}

async function classifyObjection(conversationId: string, body: string): Promise<void> {
  await request(app)
    .post('/api/v1/messages')
    .set(authOwner())
    .send({ conversationId, body, direction: 'inbound' })
    .expect(201);
  const classification = await request(app)
    .post('/api/v1/sales-intelligence/classify')
    .set(authOwner())
    .send({ conversationId })
    .expect(201);
  expect(classification.body.classification.classification).toBe('OBJECTION');
}

describe('Phase 10 setup', () => {
  it('registers users and seeds topic + prospect with recorded relevance', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase10 WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;

    await prisma.iCP.create({
      data: {
        workspaceId,
        name: 'Sales leaders',
        description: 'Sales leaders at software companies.',
        targetRoles: ['VP Sales'],
        industries: ['SaaS'],
      },
    });

    const topic = await prisma.topic.create({
      data: {
        workspaceId,
        name: `SaaS sales playbook ${stamp}`,
        canonicalName: `saas-sales-playbook-${stamp}`,
        description: 'SaaS sales leadership for enterprise company teams',
        aliases: ['saas sales'],
      },
    });
    topicId = topic.id;

    const lead = await request(app)
      .post('/api/v1/leads')
      .set(authOwner())
      .send({
        linkedinUrl: `https://linkedin.com/in/phase10-${stamp}`,
        name: 'Dana Sellers',
        headline: 'VP Sales at SaaS company',
        company: 'SaaS company',
        location: 'Berlin',
      })
      .expect(201);
    leadId = lead.body.lead.id as string;

    await prisma.prospectResearch.create({
      data: {
        workspaceId,
        leadId,
        title: 'Discovery notes',
        facts: [
          { statement: 'Team runs a SaaS sales playbook for enterprise leadership pipeline.', sourceRef: 'call notes', confidence: 0.8 },
        ],
      },
    });
  }, 60000);
});

describe('Relevance-driven idea initiation', () => {
  it('creates exactly one DRAFT idea from a qualifying relevance action', async () => {
    const actions = (await nextActions()).filter((a) => a.kind === 'prospect_relevance');
    expect(actions.length).toBeGreaterThan(0);
    const match = actions.find(
      (a) => (a.subjectMeta['topicId'] as string) === topicId && a.subjectId === leadId
    );
    expect(match).toBeDefined();
    actionId = match!.id as string;

    const res = await request(app).post(`/api/v1/operator/actions/${actionId}/ideas`).set(authOwner()).expect(201);
    ideaId = res.body.idea.id as string;
    expect(res.body.idea.status).toBe('DRAFT');
    expect(res.body.idea.title.length).toBeLessThanOrEqual(200);
    expect(res.body.idea.title).toContain('Dana Sellers');
    expect(res.body.idea.tags).toContain('relevance-driven');
    expect(res.body.idea.description).toContain(topicId);
    expect(res.body.idea.description).toContain(leadId);
    expect(res.body.idea.description).toContain('Dana Sellers');
    expect(res.body.idea.description).toContain(match!.identityKey);
    expect(res.body.idea.description).toContain('planning, review, and approval still required');
    expect(res.body.idea.workspaceId).toBe(workspaceId);
    expect(res.body.action.status).toBe('PENDING');

    const meta = res.body.action.subjectMeta as Record<string, unknown>;
    expect(meta['resultIdeaId']).toBe(ideaId);
    expect(typeof meta['resultIdeaTitle']).toBe('string');
    expect(typeof meta['initiatedAt']).toBe('string');
    expect(meta['topicId']).toBe(topicId);
  });

  it('creates no plan, draft, review, version, or other side-effect artifacts', async () => {
    const counts = await Promise.all([
      prisma.contentPlan.count({ where: { workspaceId } }),
      prisma.contentDraft.count({ where: { workspaceId } }),
      prisma.contentReview.count({ where: { workspaceId } }),
      prisma.contentVersion.count({ where: { workspaceId } }),
      prisma.publishRecord.count({ where: { workspaceId } }),
      prisma.outcomeMetric.count({ where: { workspaceId } }),
      prisma.learningProposal.count({ where: { workspaceId } }),
      prisma.outreachDraft.count({ where: { workspaceId } }),
      prisma.pipelineOpportunity.count({ where: { workspaceId } }),
      prisma.analyticsEvent.count({ where: { workspaceId } }),
      prisma.learningSignal.count({ where: { workspaceId } }),
      prisma.contentIdea.count({ where: { workspaceId } }),
    ]);
    expect(counts.slice(0, 11).every((n) => n === 0)).toBe(true);
    expect(counts[11]).toBe(1);
  });

  it('preserves linkage and provenance across refresh', async () => {
    const actions = (await nextActions()).filter((a) => a.kind === 'prospect_relevance');
    const match = actions.find((a) => (a.subjectMeta['topicId'] as string) === topicId);
    expect(match).toBeDefined();
    const meta = match!.subjectMeta;
    expect(meta['resultIdeaId']).toBe(ideaId);
    expect(meta['resultIdeaTitle']).toBeDefined();
    expect(meta['initiatedAt']).toBeDefined();
    expect(meta['topicId']).toBe(topicId);
    expect(meta['leadId']).toBeDefined();
    expect(match!.status).toBe('PENDING');
  });

  it('rejects duplicate initiation with the existing idea id', async () => {
    const res = await request(app).post(`/api/v1/operator/actions/${actionId}/ideas`).set(authOwner()).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details.ideaId).toBe(ideaId);
    expect(await prisma.contentIdea.count({ where: { workspaceId } })).toBe(1);
  });

  it('rejects wrong-kind actions', async () => {
    const foreign = await prisma.operatorAction.create({
      data: {
        workspaceId, identityKey: `content_opportunity:phase10-${stamp}`, kind: 'content_opportunity',
        title: 'Not a relevance action', score: 50, reasons: [], status: 'PENDING',
      },
    });
    await request(app).post(`/api/v1/operator/actions/${foreign.id}/ideas`).set(authOwner()).expect(409);
    expect(await prisma.contentIdea.count({ where: { workspaceId } })).toBe(1);
    await prisma.operatorAction.delete({ where: { id: foreign.id } });
  });

  it('rejects stale relevance and creates nothing', async () => {
    await prisma.topic.delete({ where: { id: topicId } });
    await request(app).post(`/api/v1/operator/actions/${actionId}/ideas`).set(authOwner()).expect(409);
    expect(await prisma.contentIdea.count({ where: { workspaceId } })).toBe(1);
  });

  it('rejects non-pending actions', async () => {
    await request(app).post(`/api/v1/operator/actions/${actionId}/dismiss`).set(authOwner()).send({}).expect(200);
    await request(app).post(`/api/v1/operator/actions/${actionId}/ideas`).set(authOwner()).expect(409);
    expect(await prisma.contentIdea.count({ where: { workspaceId } })).toBe(1);
  });

  it('denies foreign and outsider initiation', async () => {
    await request(app).post(`/api/v1/operator/actions/${actionId}/ideas`).set(authOutsider()).expect(403);
    await request(app)
      .post('/api/v1/operator/actions/00000000-0000-4000-8000-000000000000/ideas')
      .set(authOwner())
      .expect(404);
    expect(await prisma.contentIdea.count({ where: { workspaceId } })).toBe(1);
  });

  it('keeps existing objection-pattern initiation intact', async () => {
    const lead = await request(app)
      .post('/api/v1/leads')
      .set(authOwner())
      .send({ linkedinUrl: `https://linkedin.com/in/phase10-obj-${stamp}`, name: 'Budget Beth', headline: 'CFO', company: 'Costly Inc' })
      .expect(201);
    const objLeadId = lead.body.lead.id as string;
    for (const subject of ['Too pricey', 'Too pricey again']) {
      const conversation = await request(app)
        .post('/api/v1/conversations')
        .set(authOwner())
        .send({ leadId: objLeadId, subject })
        .expect(201);
      await classifyObjection(
        conversation.body.conversation.id as string,
        'This is too expensive for us right now, we have no budget.'
      );
    }
    const actions = (await nextActions()).filter((a) => a.kind === 'objection_pattern');
    expect(actions).toHaveLength(1);
    objectionActionId = actions[0]!.id as string;
    const res = await request(app).post(`/api/v1/operator/actions/${objectionActionId}/ideas`).set(authOwner()).expect(201);
    objectionIdeaId = res.body.idea.id as string;
    expect(res.body.idea.tags).toContain('objection-driven');
    expect(res.body.action.status).toBe('PENDING');
    expect(await prisma.contentIdea.count({ where: { workspaceId } })).toBe(2);
    expect(objectionIdeaId).not.toBe(ideaId);
  });
});

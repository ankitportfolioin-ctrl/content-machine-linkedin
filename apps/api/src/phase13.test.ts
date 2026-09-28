import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `phase13-owner-${stamp}@example.com`;
const outsiderEmail = `phase13-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let outsiderToken = '';
let workspaceId = '';
let signalId = '';
let actionId = '';
let ideaId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase13 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

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

describe('Phase 13 setup', () => {
  it('registers users and records a sales content signal', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase13 WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;

    const lead = await request(app)
      .post('/api/v1/leads')
      .set(authOwner())
      .send({ linkedinUrl: `https://linkedin.com/in/phase13-${stamp}`, name: 'Cycle Carl', headline: 'VP Sales', company: 'Haste Inc' })
      .expect(201);
    const leadId = lead.body.lead.id as string;

    const conversationIds: string[] = [];
    for (const subject of ['Cycle talk once', 'Cycle talk twice']) {
      const conversation = await request(app)
        .post('/api/v1/conversations')
        .set(authOwner())
        .send({ leadId, subject })
        .expect(201);
      conversationIds.push(conversation.body.conversation.id as string);
    }

    const signal = await request(app)
      .post('/api/v1/sales-intelligence/content-signals')
      .set(authOwner())
      .send({
        signalType: 'problem_content',
        sourceConversationIds: conversationIds,
        evidence: 'Prospects keep asking how to shorten the sales cycle.',
        recommendedAngle: 'Playbook for shorter cycles',
        reasoning: 'Two recorded conversations raise cycle length.',
      })
      .expect(201);
    signalId = signal.body.signal.id as string;
    expect(signal.body.signal.frequency).toBe(2);
  }, 60000);
});

describe('Sales-signal-driven idea initiation', () => {
  it('creates exactly one DRAFT idea from a qualifying signal action', async () => {
    const actions = (await nextActions()).filter((a) => a.kind === 'sales_content_signal');
    expect(actions).toHaveLength(1);
    expect(actions[0]!.subjectId).toBe(signalId);
    actionId = actions[0]!.id as string;

    const res = await request(app).post(`/api/v1/operator/actions/${actionId}/ideas`).set(authOwner()).expect(201);
    ideaId = res.body.idea.id as string;
    expect(res.body.idea.status).toBe('DRAFT');
    expect(res.body.idea.title.length).toBeLessThanOrEqual(200);
    expect(res.body.idea.title).toContain('Playbook for shorter cycles');
    expect(res.body.idea.tags).toContain('signal-driven');
    expect(res.body.idea.description).toContain('problem_content');
    expect(res.body.idea.description).toContain(signalId);
    expect(res.body.idea.description).toContain('2 conversation(s)');
    expect(res.body.idea.description).toContain(actions[0]!.identityKey);
    expect(res.body.idea.workspaceId).toBe(workspaceId);
    expect(res.body.action.status).toBe('PENDING');

    const meta = res.body.action.subjectMeta as Record<string, unknown>;
    expect(meta['resultIdeaId']).toBe(ideaId);
    expect(typeof meta['resultIdeaTitle']).toBe('string');
    expect(typeof meta['initiatedAt']).toBe('string');
    expect(meta['signalId']).toBe(signalId);
  });

  it('creates no plan, draft, review, or other side-effect artifacts', async () => {
    const counts = await Promise.all([
      prisma.contentPlan.count({ where: { workspaceId } }),
      prisma.contentDraft.count({ where: { workspaceId } }),
      prisma.contentReview.count({ where: { workspaceId } }),
      prisma.publishRecord.count({ where: { workspaceId } }),
      prisma.outcomeMetric.count({ where: { workspaceId } }),
      prisma.learningProposal.count({ where: { workspaceId } }),
      prisma.outreachDraft.count({ where: { workspaceId } }),
      prisma.pipelineOpportunity.count({ where: { workspaceId } }),
      prisma.analyticsEvent.count({ where: { workspaceId } }),
      prisma.learningSignal.count({ where: { workspaceId } }),
      prisma.prospectResearch.count({ where: { workspaceId } }),
      prisma.contentIdea.count({ where: { workspaceId } }),
    ]);
    expect(counts.slice(0, 11).every((n) => n === 0)).toBe(true);
    expect(counts[11]).toBe(1);
  });

  it('preserves linkage and provenance across refresh', async () => {
    const actions = (await nextActions()).filter((a) => a.kind === 'sales_content_signal');
    expect(actions).toHaveLength(1);
    const meta = actions[0]!.subjectMeta;
    expect(meta['resultIdeaId']).toBe(ideaId);
    expect(meta['resultIdeaTitle']).toBeDefined();
    expect(meta['initiatedAt']).toBeDefined();
    expect(meta['signalId']).toBe(signalId);
    expect(meta['signalType']).toBe('problem_content');
    expect(actions[0]!.status).toBe('PENDING');
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
        workspaceId, identityKey: `content_opportunity:phase13-${stamp}`, kind: 'content_opportunity',
        title: 'Not a signal', score: 50, reasons: [], status: 'PENDING',
      },
    });
    await request(app).post(`/api/v1/operator/actions/${foreign.id}/ideas`).set(authOwner()).expect(409);
    expect(await prisma.contentIdea.count({ where: { workspaceId } })).toBe(1);
    await prisma.operatorAction.delete({ where: { id: foreign.id } });
  });

  it('rejects non-pending actions', async () => {
    await request(app).post(`/api/v1/operator/actions/${actionId}/dismiss`).set(authOwner()).send({}).expect(200);
    await request(app).post(`/api/v1/operator/actions/${actionId}/ideas`).set(authOwner()).expect(409);
    expect(await prisma.contentIdea.count({ where: { workspaceId } })).toBe(1);
  });

  it('rejects stale signals and creates nothing', async () => {
    const signal = await request(app)
      .post('/api/v1/sales-intelligence/content-signals')
      .set(authOwner())
      .send({ signalType: 'problem_content', evidence: 'Temporary signal evidence.' })
      .expect(201);
    const tempSignalId = signal.body.signal.id as string;
    const fresh = (await nextActions()).filter((a) => a.kind === 'sales_content_signal');
    const row = fresh.find((a) => a.subjectId === tempSignalId);
    expect(row).toBeDefined();

    await prisma.salesContentSignal.delete({ where: { id: tempSignalId } });
    await request(app).post(`/api/v1/operator/actions/${row!.id as string}/ideas`).set(authOwner()).expect(409);
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
      .send({ linkedinUrl: `https://linkedin.com/in/phase13-obj-${stamp}`, name: 'Budget Beth', headline: 'CFO', company: 'Costly Inc' })
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
    const res = await request(app).post(`/api/v1/operator/actions/${actions[0]!.id as string}/ideas`).set(authOwner()).expect(201);
    expect(res.body.idea.tags).toContain('objection-driven');
    expect(res.body.action.status).toBe('PENDING');
  });

  it('keeps existing relevance initiation paths intact', async () => {
    const relevance = (await nextActions()).filter((a) => a.kind === 'prospect_relevance');
    // Workspace has no topics: relevance collector honestly emits nothing.
    expect(relevance).toHaveLength(0);
    // Research endpoint still rejects wrong kinds identically.
    await request(app).post(`/api/v1/operator/actions/${actionId}/research`).set(authOwner()).expect(409);
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `phase11-owner-${stamp}@example.com`;
const outsiderEmail = `phase11-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let outsiderToken = '';
let workspaceId = '';
let topicId = '';
let leadId = '';
let actionId = '';
let researchId = '';
let secondTopicId = '';
let secondLeadId = '';
let secondActionId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase11 User' }).expect(201);
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

async function seedRelevancePair(tag: string, leadName: string) {
  const topic = await prisma.topic.create({
    data: {
      workspaceId,
      name: `SaaS sales playbook ${tag}`,
      canonicalName: `saas-sales-playbook-${tag}`,
      description: 'SaaS sales leadership for enterprise company teams',
      aliases: ['saas sales'],
    },
  });
  const lead = await request(app)
    .post('/api/v1/leads')
    .set(authOwner())
    .send({
      linkedinUrl: `https://linkedin.com/in/phase11-${tag}`,
      name: leadName,
      headline: 'VP Sales at SaaS company',
      company: 'SaaS company',
      location: 'Berlin',
    })
    .expect(201);
  const lid = lead.body.lead.id as string;
  await prisma.prospectResearch.create({
    data: {
      workspaceId,
      leadId: lid,
      title: 'Discovery notes',
      facts: [
        { statement: 'Team runs a SaaS sales playbook for enterprise leadership pipeline.', sourceRef: 'call notes', confidence: 0.8 },
      ],
    },
  });
  return { topicId: topic.id, leadId: lid };
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

describe('Phase 11 setup', () => {
  it('registers users and seeds topic + prospect with recorded relevance', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase11 WS ${stamp}` })
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

    const pair = await seedRelevancePair(`${stamp}`, 'Dana Sellers');
    topicId = pair.topicId;
    leadId = pair.leadId;
  }, 60000);
});

describe('Relevance-driven sales research initiation', () => {
  it('records exactly one research row from a qualifying relevance action', async () => {
    const actions = (await nextActions()).filter((a) => a.kind === 'prospect_relevance');
    expect(actions.length).toBeGreaterThan(0);
    const match = actions.find(
      (a) => (a.subjectMeta['topicId'] as string) === topicId && a.subjectId === leadId
    );
    expect(match).toBeDefined();
    actionId = match!.id as string;

    const res = await request(app).post(`/api/v1/operator/actions/${actionId}/research`).set(authOwner()).expect(201);
    researchId = res.body.research.id as string;
    expect(res.body.research.leadId).toBe(leadId);
    expect(res.body.research.workspaceId).toBe(workspaceId);
    expect(res.body.action.status).toBe('PENDING');

    const facts = res.body.research.facts as Array<{ statement: string; sourceRef: string; confidence: number | null }>;
    expect(facts.length).toBeGreaterThanOrEqual(3);
    const blob = facts.map((f) => f.statement).join('\n');
    expect(blob).toContain(topicId);
    expect(blob).toContain(leadId);
    expect(blob).toContain('Dana Sellers');
    expect(blob).toContain(match!.identityKey);
    for (const fact of facts) {
      expect(fact.sourceRef).toBe(`operatorAction:${match!.identityKey}`);
      // Recorded evidence carries no legitimate per-statement confidence: null, never invented.
      expect(fact.confidence).toBeNull();
    }

    const meta = res.body.action.subjectMeta as Record<string, unknown>;
    expect(meta['resultResearchId']).toBe(researchId);
    expect(typeof meta['resultResearchTitle']).toBe('string');
    expect(typeof meta['initiatedResearchAt']).toBe('string');
    expect(meta['topicId']).toBe(topicId);
    expect(meta['resultIdeaId']).toBeUndefined();
  });

  it('creates no strategy, draft, review, prepared, brief, or other side-effect artifacts', async () => {
    const counts = await Promise.all([
      prisma.outreachStrategy.count({ where: { workspaceId } }),
      prisma.outreachDraft.count({ where: { workspaceId } }),
      prisma.outreachReview.count({ where: { workspaceId } }),
      prisma.preparedAction.count({ where: { workspaceId } }),
      prisma.prospectBrief.count({ where: { workspaceId } }),
      prisma.qualificationResult.count({ where: { workspaceId } }),
      prisma.contentIdea.count({ where: { workspaceId } }),
      prisma.outcomeMetric.count({ where: { workspaceId } }),
      prisma.learningProposal.count({ where: { workspaceId } }),
      prisma.analyticsEvent.count({ where: { workspaceId } }),
      prisma.learningSignal.count({ where: { workspaceId } }),
      prisma.prospectResearch.count({ where: { workspaceId } }),
    ]);
    expect(counts.slice(0, 11).every((n) => n === 0)).toBe(true);
    // seed row + initiated row
    expect(counts[11]).toBe(2);
  });

  it('preserves linkage and provenance across refresh', async () => {
    const actions = (await nextActions()).filter((a) => a.kind === 'prospect_relevance');
    const match = actions.find((a) => (a.subjectMeta['topicId'] as string) === topicId);
    expect(match).toBeDefined();
    const meta = match!.subjectMeta;
    expect(meta['resultResearchId']).toBe(researchId);
    expect(meta['resultResearchTitle']).toBeDefined();
    expect(meta['initiatedResearchAt']).toBeDefined();
    expect(meta['topicId']).toBe(topicId);
    expect(meta['leadId']).toBeDefined();
    expect(match!.status).toBe('PENDING');
  });

  it('rejects duplicate initiation with the existing research id', async () => {
    const res = await request(app).post(`/api/v1/operator/actions/${actionId}/research`).set(authOwner()).expect(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details.researchId).toBe(researchId);
    expect(await prisma.prospectResearch.count({ where: { workspaceId } })).toBe(2);
  });

  it('coexists with Phase 10 content initiation on the same action', async () => {
    const res = await request(app).post(`/api/v1/operator/actions/${actionId}/ideas`).set(authOwner()).expect(201);
    expect(res.body.idea.tags).toContain('relevance-driven');
    const meta = res.body.action.subjectMeta as Record<string, unknown>;
    expect(meta['resultIdeaId']).toBe(res.body.idea.id as string);
    expect(meta['resultResearchId']).toBe(researchId);
    expect(await prisma.contentIdea.count({ where: { workspaceId } })).toBe(1);
  });

  it('rejects wrong-kind actions', async () => {
    const foreign = await prisma.operatorAction.create({
      data: {
        workspaceId, identityKey: `content_opportunity:phase11-${stamp}`, kind: 'content_opportunity',
        title: 'Not a relevance action', score: 50, reasons: [], status: 'PENDING',
      },
    });
    await request(app).post(`/api/v1/operator/actions/${foreign.id}/research`).set(authOwner()).expect(409);
    expect(await prisma.prospectResearch.count({ where: { workspaceId } })).toBe(2);
    await prisma.operatorAction.delete({ where: { id: foreign.id } });
  });

  it('rejects missing leads and creates nothing', async () => {
    const pair = await seedRelevancePair(`second-${stamp}`, 'Evan Prospect');
    secondTopicId = pair.topicId;
    secondLeadId = pair.leadId;
    const actions = (await nextActions()).filter((a) => a.kind === 'prospect_relevance');
    const match = actions.find(
      (a) => (a.subjectMeta['topicId'] as string) === secondTopicId && a.subjectId === secondLeadId
    );
    expect(match).toBeDefined();
    secondActionId = match!.id as string;

    await prisma.lead.delete({ where: { id: secondLeadId } });
    await request(app).post(`/api/v1/operator/actions/${secondActionId}/research`).set(authOwner()).expect(409);
    expect(await prisma.prospectResearch.count({ where: { workspaceId } })).toBe(3);
  });

  it('rejects stale relevance and creates nothing', async () => {
    await prisma.topic.delete({ where: { id: topicId } });
    await request(app).post(`/api/v1/operator/actions/${actionId}/research`).set(authOwner()).expect(409);
    expect(await prisma.prospectResearch.count({ where: { workspaceId } })).toBe(3);
  });

  it('rejects non-pending actions', async () => {
    await request(app).post(`/api/v1/operator/actions/${actionId}/dismiss`).set(authOwner()).send({}).expect(200);
    await request(app).post(`/api/v1/operator/actions/${actionId}/research`).set(authOwner()).expect(409);
    expect(await prisma.prospectResearch.count({ where: { workspaceId } })).toBe(3);
  });

  it('denies foreign and outsider initiation', async () => {
    await request(app).post(`/api/v1/operator/actions/${actionId}/research`).set(authOutsider()).expect(403);
    await request(app)
      .post('/api/v1/operator/actions/00000000-0000-4000-8000-000000000000/research')
      .set(authOwner())
      .expect(404);
    expect(await prisma.prospectResearch.count({ where: { workspaceId } })).toBe(3);
  });

  it('keeps existing objection-pattern initiation intact', async () => {
    const lead = await request(app)
      .post('/api/v1/leads')
      .set(authOwner())
      .send({ linkedinUrl: `https://linkedin.com/in/phase11-obj-${stamp}`, name: 'Budget Beth', headline: 'CFO', company: 'Costly Inc' })
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
});

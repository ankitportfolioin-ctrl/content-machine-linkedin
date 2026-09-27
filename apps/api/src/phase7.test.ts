import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `phase7-owner-${stamp}@example.com`;
const viewerEmail = `phase7-viewer-${stamp}@example.com`;
const outsiderEmail = `phase7-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let viewerToken = '';
let outsiderToken = '';
let workspaceId = '';
let leadId = '';
let topicId = '';
let proposalId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase7 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authViewer = () => ({ Authorization: `Bearer ${viewerToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

describe('Phase 7 setup', () => {
  it('registers users and creates an isolated workspace', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    viewerToken = await registerAndLogin(viewerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase7 WS ${stamp}` })
      .expect(201);
    workspaceId = (created.body.workspace?.id ?? created.body.id) as string;
    expect(workspaceId).toBeDefined();

    const viewer = await prisma.user.findUnique({ where: { email: viewerEmail } });
    await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Workspace-ID', workspaceId)
      .send({ userId: viewer!.id, role: 'viewer' })
      .expect(201);

    const lead = await request(app)
      .post('/api/v1/leads')
      .set(authOwner())
      .send({ linkedinUrl: `https://linkedin.com/in/phase7-prospect-${stamp}`, name: 'Prospector', headline: 'VP Sales at prospecting software company', company: 'Acme prospecting software' })
      .expect(201);
    leadId = lead.body.lead.id as string;

    await request(app)
      .post('/api/v1/icps')
      .set(authOwner())
      .send({ name: 'Sales leaders', description: 'Sales leaders at software companies.', targetRoles: ['VP Sales'], industries: ['software'] })
      .expect(201);

    const topic = await prisma.topic.create({
      data: {
        workspaceId,
        name: 'AI sales prospecting',
        canonicalName: `ai-sales-prospecting-${stamp}`,
        description: 'Using AI agents for outbound prospecting automation',
      },
    });
    topicId = topic.id;
  });
});

describe('Objection aggregation (sales -> content input)', () => {
  const objectionBody = 'This is too expensive for us right now, we have no budget.';

  beforeAll(async () => {
    for (const subject of ['Budget pushback', 'Budget pushback again']) {
      const conversation = await request(app)
        .post('/api/v1/conversations')
        .set(authOwner())
        .send({ leadId, subject })
        .expect(201);
      const conversationId = conversation.body.conversation.id as string;
      await request(app)
        .post('/api/v1/messages')
        .set(authOwner())
        .send({ conversationId, body: objectionBody, direction: 'inbound' })
        .expect(201);
      const classification = await request(app)
        .post('/api/v1/sales-intelligence/classify')
        .set(authOwner())
        .send({ conversationId })
        .expect(201);
      expect(classification.body.classification.classification).toBe('OBJECTION');
    }
  });

  it('groups repeated recorded objections into evidence-backed patterns', async () => {
    const res = await request(app).get('/api/v1/sales-intelligence/objections').set(authOwner()).expect(200);
    expect(res.body.objections.totalObjections).toBe(2);
    expect(res.body.objections.patterns).toHaveLength(1);
    expect(res.body.objections.patterns[0].count).toBe(2);
    expect(res.body.objections.patterns[0].sampleEvidence.length).toBeGreaterThan(0);
    expect(res.body.objections.rawEvidence).toHaveLength(2);
  });

  it('keeps sub-threshold objections as raw evidence, never as patterns', async () => {
    const res = await request(app)
      .get('/api/v1/sales-intelligence/objections?minSampleSize=5')
      .set(authOwner())
      .expect(200);
    expect(res.body.objections.patterns).toHaveLength(0);
    expect(res.body.objections.totalObjections).toBe(2);
  });

  it('denies cross-workspace access', async () => {
    await request(app).get('/api/v1/sales-intelligence/objections').set(authOutsider()).expect(403);
  });
});

describe('Topic relevance (intelligence -> prospect)', () => {
  it('derives explained relevance from recorded rows only', async () => {
    const res = await request(app)
      .get(`/api/v1/sales-intelligence/topics/${topicId}/relevance?leadId=${leadId}`)
      .set(authOwner())
      .expect(200);
    expect(res.body.relevance.topicId).toBe(topicId);
    expect(res.body.relevance.leadId).toBe(leadId);
    expect(res.body.relevance.dimensions.map((d: { name: string }) => d.name)).toEqual([
      'topic_problem_overlap',
      'icp_fit',
      'role_company_fit',
      'research_support',
    ]);
    expect(res.body.relevance.relevance).toBeGreaterThanOrEqual(0);
    expect(res.body.relevance.relevance).toBeLessThanOrEqual(1);
    expect(res.body.relevance.explanation.length).toBeGreaterThan(0);
    expect(res.body.icpUsed).not.toBeNull();
  });

  it('assesses topics without a prospect honestly', async () => {
    const res = await request(app)
      .get(`/api/v1/sales-intelligence/topics/${topicId}/relevance`)
      .set(authOwner())
      .expect(200);
    expect(res.body.relevance.leadId).toBeNull();
  });

  it('returns 404 for unknown topics and leads', async () => {
    await request(app)
      .get(`/api/v1/sales-intelligence/topics/00000000-0000-4000-8000-000000000000/relevance?leadId=${leadId}`)
      .set(authOwner())
      .expect(404);
    await request(app)
      .get(`/api/v1/sales-intelligence/topics/${topicId}/relevance?leadId=00000000-0000-4000-8000-000000000000`)
      .set(authOwner())
      .expect(404);
  });

  it('denies cross-workspace access', async () => {
    await request(app)
      .get(`/api/v1/sales-intelligence/topics/${topicId}/relevance?leadId=${leadId}`)
      .set(authOutsider())
      .expect(403);
  });
});

describe('Content-outcome learning (content -> learning)', () => {
  async function buildVersionWithFormat(format: 'post' | 'article'): Promise<string> {
    const idea = await request(app)
      .post('/api/v1/content-ideas')
      .set(authOwner())
      .send({ title: `Phase7 ${format} idea ${stamp}` })
      .expect(201);
    const plan = await request(app)
      .post('/api/v1/content-plans')
      .set(authOwner())
      .send({
        contentIdeaId: idea.body.contentIdea.id,
        thesis: 'Workflows beat tools.',
        audience: 'SaaS founders drowning in tools',
        objective: 'teach_practical',
        angle: 'practical',
        format,
        narrativeStructure: 'problem_why_solution',
        keyPoints: ['Map one workflow', 'Remove one tool'],
        evidenceMap: [{ claimRef: 'Map one workflow first' }],
        mustNotClaim: [],
      })
      .expect(201);
    const draft = await request(app)
      .post('/api/v1/content-drafts')
      .set(authOwner())
      .send({ contentIdeaId: idea.body.contentIdea.id, body: 'Phase7 draft body with enough length to be valid content here.', version: 1 })
      .expect(201);
    await prisma.contentDraft.update({ where: { id: draft.body.contentDraft.id }, data: { planId: plan.body.plan.id } });
    const version = await request(app)
      .post('/api/v1/content-versions')
      .set(authOwner())
      .send({ contentDraftId: draft.body.contentDraft.id, body: draft.body.contentDraft.body, version: 1 })
      .expect(201);
    await prisma.contentVersion.update({ where: { id: version.body.contentVersion.id }, data: { isFinal: true } });
    return version.body.contentVersion.id as string;
  }

  beforeAll(async () => {
    const postVersions = [await buildVersionWithFormat('post'), await buildVersionWithFormat('post'), await buildVersionWithFormat('post')];
    const articleVersions = [await buildVersionWithFormat('article'), await buildVersionWithFormat('article'), await buildVersionWithFormat('article')];
    const postValues = [20, 22, 24];
    const articleValues = [4, 5, 6];
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/v1/outcomes')
        .set(authOwner())
        .send({ contentVersionId: postVersions[i], metricName: 'responses', metricValue: postValues[i], source: 'Weekly review notes', idempotencyKey: `phase7-${stamp}-post-${i}` })
        .expect(201);
      await request(app)
        .post('/api/v1/outcomes')
        .set(authOwner())
        .send({ contentVersionId: articleVersions[i], metricName: 'responses', metricValue: articleValues[i], source: 'Weekly review notes', idempotencyKey: `phase7-${stamp}-article-${i}` })
        .expect(201);
    }
  }, 60000);

  it('derives a PROPOSED content-outcome proposal grouped by format', async () => {
    const res = await request(app)
      .post('/api/v1/learning/derived/content-outcome')
      .set(authOwner())
      .send({ metricName: 'responses', attribute: 'format', minSampleSize: 3 })
      .expect(201);
    expect(res.body.proposal.status).toBe('PROPOSED');
    expect(res.body.proposal.dimension).toBe('actionability');
    expect(res.body.summary.groups).toHaveLength(2);
    proposalId = res.body.proposal.id as string;
  });

  it('refuses derivation without measured content-linked data', async () => {
    await request(app)
      .post('/api/v1/learning/derived/content-outcome')
      .set(authOwner())
      .send({ metricName: 'never-measured-metric', attribute: 'format', minSampleSize: 3 })
      .expect(422);
  });

  it('rejects unknown attributes', async () => {
    await request(app)
      .post('/api/v1/learning/derived/content-outcome')
      .set(authOwner())
      .send({ metricName: 'responses', attribute: 'bogus' })
      .expect(400);
  });

  it('denies MEMBER/VIEWER confirmation of content-outcome weights', async () => {
    await request(app).post(`/api/v1/learning/derived/${proposalId}/confirm`).set(authViewer()).send({}).expect(403);
  });
});

describe('Opportunity scoring seam (learning -> opportunity explanation)', () => {
  it('applies only CONFIRMED learning to opportunity scores with explanations', async () => {
    const before = await request(app)
      .post('/api/v1/intelligence/opportunities/score')
      .set(authOwner())
      .send({ topicId })
      .expect(200);
    expect(before.body.scoring.dimensions).toHaveLength(10);
    expect(before.body.scoring.learning.applied).toEqual([]);

    await request(app).post(`/api/v1/learning/derived/${proposalId}/confirm`).set(authOwner()).send({}).expect(200);

    const after = await request(app)
      .post('/api/v1/intelligence/opportunities/score')
      .set(authOwner())
      .send({ topicId })
      .expect(200);
    expect(after.body.scoring.learning.applied.length).toBeGreaterThan(0);
    expect(after.body.scoring.overallScore).not.toBe(after.body.scoring.baseOverallScore);
    const adjusted = (after.body.scoring.dimensions as Array<{ name: string; baseScore: number; appliedAdjustment: number; score: number; explanation: string }>).find((d) => d.appliedAdjustment !== 0)!;
    expect(adjusted).toBeDefined();
    expect(adjusted.explanation).toContain('Workspace-confirmed learning adjustment');
  });

  it('returns 404 for unknown topics and rejects invalid input', async () => {
    await request(app)
      .post('/api/v1/intelligence/opportunities/score')
      .set(authOwner())
      .send({ topicId: '00000000-0000-4000-8000-000000000000' })
      .expect(404);
    await request(app)
      .post('/api/v1/intelligence/opportunities/score')
      .set(authOwner())
      .send({ topicId: 'not-a-uuid' })
      .expect(400);
  });

  it('re-scores stored opportunities with confirmed learning and echoes the stored score', async () => {
    const stored = await prisma.contentOpportunity.create({
      data: {
        workspaceId,
        topicId,
        title: 'Phase7 stored opportunity',
        thesis: 'Recorded thesis.',
        problem: 'Recorded problem.',
        audience: 'Recorded audience.',
        angle: 'Recorded angle.',
        objective: 'Recorded objective.',
        opportunityScore: 0.55,
        sourceIds: [],
        claimIds: [],
        trendSignalIds: [],
        reasoning: 'Recorded reasoning.',
        evidenceSummary: 'Recorded evidence.',
      },
    });
    const res = await request(app)
      .get(`/api/v1/intelligence/opportunities/${stored.id}/score`)
      .set(authOwner())
      .expect(200);
    expect(res.body.storedScore).toBe(0.55);
    expect(res.body.scoring.learning.applied.length).toBeGreaterThan(0);
    await request(app)
      .get('/api/v1/intelligence/opportunities/00000000-0000-4000-8000-000000000000/score')
      .set(authOwner())
      .expect(404);
  });

  it('stops applying learning after the proposal is revoked', async () => {
    await request(app).post(`/api/v1/learning/derived/${proposalId}/revoke`).set(authOwner()).send({}).expect(200);
    const res = await request(app)
      .post('/api/v1/intelligence/opportunities/score')
      .set(authOwner())
      .send({ topicId })
      .expect(200);
    expect(res.body.scoring.learning.applied).toEqual([]);
    expect(res.body.scoring.overallScore).toBe(res.body.scoring.baseOverallScore);
  });

  it('denies cross-workspace access', async () => {
    await request(app)
      .post('/api/v1/intelligence/opportunities/score')
      .set(authOutsider())
      .send({ topicId })
      .expect(403);
  });
});

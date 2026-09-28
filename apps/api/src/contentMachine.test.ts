import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { TopicClusteringService } from '@growth-operator/intelligence';
import { TrendSignalService } from '@growth-operator/intelligence';
import { createDefaultRegistry } from '@growth-operator/ai';

const stamp = Date.now();
const ownerEmail = `phase3-owner-${stamp}@example.com`;
const viewerEmail = `phase3-viewer-${stamp}@example.com`;
const outsiderEmail = `phase3-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let viewerToken = '';
let outsiderToken = '';
let workspaceId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase3 User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const authOwner = () => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': workspaceId });
const authViewer = () => ({ Authorization: `Bearer ${viewerToken}`, 'X-Workspace-ID': workspaceId });
const authOutsider = () => ({ Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId });

// Step A contract: remove exactly this file's rows; never touch other files' data.
afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [ownerEmail, viewerEmail, outsiderEmail] });
});

describe('Phase 3 setup', () => {
  it('registers owner, viewer, outsider and creates an isolated workspace', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    viewerToken = await registerAndLogin(viewerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase3 WS ${stamp}` })
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
  });
});

describe('Phase 2 persistence defects (real database)', () => {
  it('TopicMention upsert works against the real unique constraint', async () => {
    const registry = createDefaultRegistry(undefined, undefined);
    const service = new TopicClusteringService(prisma, registry);

    const source = await prisma.intelligenceSource.create({
      data: {
        workspaceId,
        url: `https://example.com/phase3-${stamp}`,
        canonicalUrl: `https://example.com/phase3-${stamp}`,
        sourceType: 'ARTICLE',
        title: 'Phase3 source',
        contentHash: `phase3hash-${stamp}`,
        urlHash: `phase3url-${stamp}`,
      },
    });

    const understanding = {
      thesis: 'Workflows beat tools.',
      mainProblem: 'Tool sprawl.',
      observations: [],
      claims: [],
      evidence: [],
      implications: [],
      uncertainties: [],
      contradictions: [],
      audienceRelevance: ['AI agents'],
      possibleAngles: ['AI agents'],
    };

    const first = await service.normalizeTopics(workspaceId, [{ sourceId: source.id, understanding: understanding as never }]);
    expect(first.topics.length).toBeGreaterThan(0);
    const second = await service.normalizeTopics(workspaceId, [{ sourceId: source.id, understanding: understanding as never }]);
    expect(second.topics.length).toBeGreaterThan(0);

    const topic = await prisma.topic.findFirst({ where: { workspaceId, canonicalName: 'ai-agents' } });
    expect(topic).toBeDefined();
    const mentions = await prisma.topicMention.findMany({ where: { workspaceId, topicId: topic!.id, sourceId: source.id } });
    expect(mentions).toHaveLength(1);
  });

  it('TrendSignal upsert works against the real unique constraint', async () => {
    const service = new TrendSignalService(prisma);
    const topic = await prisma.topic.findFirst({ where: { workspaceId, canonicalName: 'ai-agents' } });
    const now = new Date();
    const mentions = [
      { sourceId: 's1', mentionStrength: 0.8, relevanceScore: 0.9, createdAt: new Date(now.getTime() - 10 * 86400000) },
      { sourceId: 's2', mentionStrength: 0.7, relevanceScore: 0.8, createdAt: new Date(now.getTime() - 8 * 86400000) },
    ];

    await service.updateTrendSignal(workspaceId, topic!.id, mentions);
    await service.updateTrendSignal(workspaceId, topic!.id, mentions);

    const rows = await prisma.trendSignal.findMany({ where: { workspaceId, topicId: topic!.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('EMERGING');
  });
});

describe('Opportunity → Idea provenance', () => {
  let opportunityId = '';
  let ideaId = '';

  it('convert stores full provenance on the idea', async () => {
    const topic = await prisma.topic.findFirst({ where: { workspaceId, canonicalName: 'ai-agents' } });
    const opportunity = await prisma.contentOpportunity.create({
      data: {
        workspaceId,
        topicId: topic!.id,
        title: 'Workflow opportunity',
        thesis: 'Workflows beat tools.',
        problem: 'Tool sprawl.',
        audience: 'SaaS founders',
        angle: 'Practical workflow guidance',
        objective: 'TEACH_PRACTICAL',
        contentFormat: 'TEXT_POST',
        opportunityScore: 0.8,
        sourceIds: ['source-1'],
        claimIds: ['claim-1'],
        trendSignalIds: ['trend-1'],
        reasoning: 'Evidence supports workflow-first guidance.',
        evidenceSummary: 'Two sources agree.',
      },
    });
    opportunityId = opportunity.id;

    const response = await request(app)
      .post(`/api/v1/intelligence/opportunities/${opportunityId}/convert`)
      .set(authOwner())
      .send({})
      .expect(201);

    ideaId = response.body.contentIdea.id as string;
    expect(response.body.provenance).toMatchObject({
      opportunityId,
      topicId: topic!.id,
      sourceIds: ['source-1'],
      claimIds: ['claim-1'],
      trendSignalIds: ['trend-1'],
    });

    const idea = await prisma.contentIdea.findUnique({ where: { id: ideaId } });
    expect(idea?.opportunityId).toBe(opportunityId);
    expect(idea?.thesis).toBe('Workflows beat tools.');
    expect(idea?.audience).toBe('SaaS founders');
    expect(idea?.reasoning).toContain('workflow-first');
    expect(idea?.sourceIds).toEqual(['source-1']);
  });

  it('denies cross-workspace conversion', async () => {
    await request(app)
      .post(`/api/v1/intelligence/opportunities/${opportunityId}/convert`)
      .set(authOutsider())
      .send({})
      .expect(403);
  });
});

describe('Plan → Draft → Validate → Review → Approve → Finalize', () => {
  let ideaId = '';
  let planId = '';
  let draftId = '';
  let claimId = '';

  it('creates and approves a content plan', async () => {
    const created = await request(app)
      .post('/api/v1/content-ideas')
      .set(authOwner())
      .send({ title: 'Workflow idea' })
      .expect(201);
    ideaId = created.body.contentIdea.id as string;

    const planRes = await request(app)
      .post('/api/v1/content-plans')
      .set(authOwner())
      .send({
        contentIdeaId: ideaId,
        thesis: 'Workflows beat tools.',
        audience: 'SaaS founders drowning in tools',
        objective: 'teach_practical',
        angle: 'practical',
        format: 'checklist',
        narrativeStructure: 'problem_why_solution',
        keyPoints: ['Map one workflow', 'Remove one tool', 'Measure the difference'],
        evidenceMap: [{ claimRef: 'Map one workflow first' }],
        mustNotClaim: [],
      })
      .expect(201);
    planId = planRes.body.plan.id as string;

    const approved = await request(app)
      .post(`/api/v1/content-plans/${planId}/approve`)
      .set(authOwner())
      .send({})
      .expect(200);
    expect(approved.body.plan.status).toBe('APPROVED');
  });

  it('rejects invalid plans (contrarian without evidence)', async () => {
    await request(app)
      .post('/api/v1/content-plans')
      .set(authOwner())
      .send({
        contentIdeaId: ideaId,
        thesis: 'Everything you know is wrong.',
        audience: 'SaaS founders',
        objective: 'challenge',
        angle: 'contrarian',
        format: 'contrarian',
        narrativeStructure: 'thesis_evidence_tradeoff_conclusion',
        keyPoints: ['Hot take'],
        evidenceMap: [],
        mustNotClaim: [],
      })
      .expect(422);
  });

  it('returns AI_UNAVAILABLE for generate and compose without providers', async () => {
    await request(app).post('/api/v1/content-plans/generate').set(authOwner()).send({ contentIdeaId: ideaId }).expect(503);
    await request(app).post('/api/v1/content-drafts/compose').set(authOwner()).send({ planId }).expect(503);
  });

  it('creates a draft, binds evidence, and validates with BLOCKED fixture', async () => {
    const source = await prisma.intelligenceSource.create({
      data: {
        workspaceId,
        url: `https://example.com/evidence-${stamp}`,
        canonicalUrl: `https://example.com/evidence-${stamp}`,
        sourceType: 'ARTICLE',
        title: 'Evidence source',
        contentHash: `evidence-hash-${stamp}`,
        urlHash: `evidence-url-${stamp}`,
      },
    });
    const document = await prisma.sourceDocument.create({
      data: {
        workspaceId,
        sourceId: source.id,
        rawContent: 'Raw evidence content.',
        cleanContent: 'Clean evidence content about workflows.',
        contentType: 'HTML',
        wordCount: 6,
        extractionMethod: 'HTML',
        extractionStatus: 'SUCCESS',
        extractionWarnings: [],
      },
    });
    const claim = await prisma.sourceClaim.create({
      data: {
        workspaceId,
        sourceId: source.id,
        documentId: document.id,
        claimText: 'Teams adopt tools without changing workflows.',
        claimType: 'OBSERVATION',
        evidenceText: 'Interview notes suggest teams may benefit from mapping workflows.',
        confidence: 0.8,
      },
    });
    claimId = claim.id;
    expect(claimId).toBeDefined();

    const draftRes = await request(app)
      .post('/api/v1/content-drafts')
      .set(authOwner())
      .send({ contentIdeaId: ideaId, body: 'Workflows beat tools. Map one workflow before buying software, then measure the difference carefully over time.', version: 1 })
      .expect(201);
    draftId = draftRes.body.contentDraft.id as string;
    await prisma.contentDraft.update({ where: { id: draftId }, data: { planId } });

    const bindings = await request(app)
      .post(`/api/v1/content-drafts/${draftId}/bindings`)
      .set(authOwner())
      .send({ bindings: [{ span: 'Workflows beat tools.', sourceClaimId: claimId }] })
      .expect(201);
    expect(bindings.body.bindings).toHaveLength(1);
    expect(bindings.body.bindings[0].evidenceStatus).toBe('SUPPORTED');

    const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
    await prisma.voiceProfile.create({
      data: { workspaceId, userId: owner!.id, bannedWords: ['leverage'], preferredVocabulary: [], contentPillars: [] },
    });
    await prisma.contentDraft.update({ where: { id: draftId }, data: { body: 'Workflows beat tools. Teams must leverage synergies to scale. Customers report 91% improvement overnight.' } });

    const validation = await request(app)
      .post(`/api/v1/content-drafts/${draftId}/validate`)
      .set(authOwner())
      .send({})
      .expect(200);

    expect(typeof validation.body.validation.overallScore).toBe('number');
    expect(validation.body.validation.finalStatus).toBe('BLOCKED');
    const gates = validation.body.validation.results as Array<{ gate: string; status: string }>;
    expect(gates.find((g) => g.gate === 'voice_compliance')?.status).toBe('BLOCKED');
    expect(gates.find((g) => g.gate === 'statistics_grounding')?.status).toBe('BLOCKED');
  });

  it('blocks approval while gates are BLOCKED, even for owners', async () => {
    const submitted = await request(app)
      .post('/api/v1/content-reviews')
      .set(authOwner())
      .send({ draftId })
      .expect(201);

    await request(app)
      .post(`/api/v1/content-reviews/${submitted.body.review.id}/decision`)
      .set(authOwner())
      .send({ action: 'approve' })
      .expect(422);
  });

  it('rejects unauthorized approval by viewers', async () => {
    const reviews = await request(app).get(`/api/v1/content-reviews?draftId=${draftId}`).set(authOwner()).expect(200);
    const reviewId = reviews.body.reviews[0].id as string;

    await request(app)
      .post(`/api/v1/content-reviews/${reviewId}/decision`)
      .set(authViewer())
      .send({ action: 'approve' })
      .expect(403);
  });

  it('denies cross-workspace review access', async () => {
    const reviews = await request(app).get(`/api/v1/content-reviews?draftId=${draftId}`).set(authOwner()).expect(200);
    const reviewId = reviews.body.reviews[0].id as string;

    await request(app)
      .post(`/api/v1/content-reviews/${reviewId}/decision`)
      .set(authOutsider())
      .send({ action: 'approve' })
      .expect(403);
  });

  it('approves clean drafts, finalizes immutable versions, and renders identical previews', async () => {
    await prisma.contentDraft.update({ where: { id: draftId }, data: { body: 'Workflows beat tools. Map one workflow before buying software, then measure the difference carefully over time.' } });
    await prisma.contentQualityGateResult.deleteMany({ where: { workspaceId, draftId } });
    await prisma.voiceProfile.deleteMany({ where: { workspaceId } });

    const validation = await request(app)
      .post(`/api/v1/content-drafts/${draftId}/validate`)
      .set(authOwner())
      .send({})
      .expect(200);
    expect(validation.body.validation.finalStatus).not.toBe('BLOCKED');

    const existing = await request(app).get(`/api/v1/content-reviews?draftId=${draftId}`).set(authOwner()).expect(200);
    let pending = (existing.body.reviews as Array<{ id: string; status: string }>).find((r) => r.status === 'SUBMITTED');
    if (!pending) {
      const submitted = await request(app).post('/api/v1/content-reviews').set(authOwner()).send({ draftId }).expect(201);
      pending = submitted.body.review as { id: string; status: string };
    }
    expect(pending).toBeDefined();

    await request(app)
      .post(`/api/v1/content-reviews/${pending!.id}/decision`)
      .set(authOwner())
      .send({ action: 'approve' })
      .expect(200);

    const finalized = await request(app)
      .post('/api/v1/content-versions/finalize')
      .set(authOwner())
      .send({ draftId })
      .expect(201);
    expect(finalized.body.contentVersion.isFinal).toBe(true);

    await request(app)
      .patch(`/api/v1/content-drafts/${draftId}`)
      .set(authOwner())
      .send({ body: 'Edited after approval.' })
      .expect(403);

    await request(app)
      .delete(`/api/v1/content-versions/${finalized.body.contentVersion.id}`)
      .set(authOwner())
      .expect(403);

    const preview = await request(app).get(`/api/v1/content-drafts/${draftId}/preview`).set(authOwner()).expect(200);
    expect(preview.body.internalMarkupFound).toEqual([]);

    const revision = await request(app)
      .post(`/api/v1/content-drafts/${draftId}/revisions`)
      .set(authOwner())
      .send({})
      .expect(201);
    expect(revision.body.contentDraft.version).toBeGreaterThan(1);
  });
});

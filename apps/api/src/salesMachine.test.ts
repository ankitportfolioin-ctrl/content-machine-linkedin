import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const ownerEmail = `phase4-owner-${stamp}@example.com`;
const viewerEmail = `phase4-viewer-${stamp}@example.com`;
const outsiderEmail = `phase4-outsider-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let viewerToken = '';
let outsiderToken = '';
let workspaceId = '';
let leadId = '';
let strategyId = '';
let draftId = '';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Phase4 User' }).expect(201);
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

describe('Phase 4 setup', () => {
  it('registers users and creates an isolated workspace', async () => {
    ownerToken = await registerAndLogin(ownerEmail);
    viewerToken = await registerAndLogin(viewerEmail);
    outsiderToken = await registerAndLogin(outsiderEmail);

    const created = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ name: `Phase4 WS ${stamp}` })
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

    const icp = await request(app)
      .post('/api/v1/icps')
      .set(authOwner())
      .send({ name: 'SaaS CTOs', description: 'CTOs at SaaS companies.', targetRoles: ['CTO'], industries: ['SaaS'] })
      .expect(201);
    expect(icp.body.icp.id).toBeDefined();
  });
});

describe('Discovery → Research → Signals → Qualification → Brief', () => {
  it('discovers candidates with explicit unknowns, inventing nothing', async () => {
    const response = await request(app)
      .post('/api/v1/prospects/discover')
      .set(authOwner())
      .send({ name: 'Jane Doe', title: 'CTO' })
      .expect(201);
    expect(response.body.candidate.name).toBe('Jane Doe');
    expect(response.body.candidate.company).toBeNull();
    expect(response.body.candidate.unknownFields).toContain('company');
  });

  it('creates a lead, research, signals, and qualification', async () => {
    const lead = await request(app)
      .post('/api/v1/leads')
      .set(authOwner())
      .send({ linkedinUrl: `https://linkedin.com/in/phase4-${stamp}`, name: 'Jane Doe', headline: 'CTO at Acme SaaS', company: 'Acme SaaS' })
      .expect(201);
    leadId = lead.body.lead.id as string;

    const research = await request(app)
      .post('/api/v1/prospects/research')
      .set(authOwner())
      .send({ leadId, title: 'CTO', company: 'Acme SaaS', publicSourceUrls: ['https://example.com/jane'] })
      .expect(201);
    expect(research.body.research.id).toBeDefined();

    await request(app)
      .post('/api/v1/prospects/research/:id/synthesize'.replace(':id', research.body.research.id))
      .set(authOwner())
      .send({ material: ['CTO at Acme SaaS.'] })
      .expect(503);

    const signal = await request(app)
      .post('/api/v1/prospects/signals')
      .set(authOwner())
      .send({
        leadId,
        signalType: 'hiring',
        source: 'https://example.com/acme-careers',
        confidence: 0.8,
        evidence: 'Acme careers page lists 3 support-engineer roles.',
        interpretation: 'Support hiring may indicate scaling pain relevant to workflow tooling.',
      })
      .expect(201);
    expect(signal.body.signal.id).toBeDefined();

    const intent = await request(app).get(`/api/v1/prospects/intent?leadId=${leadId}`).set(authOwner()).expect(200);
    expect(intent.body.status).toBe('RELEVANT_SIGNAL');

    const qualification = await request(app)
      .post('/api/v1/prospects/qualify')
      .set(authOwner())
      .send({ leadId, problemEvidence: ['Public post about scaling pain.'], researchFactCount: 2 })
      .expect(201);
    expect(['QUALIFIED', 'POSSIBLE_FIT']).toContain(qualification.body.qualification.status);
    expect(qualification.body.qualification.dimensions.length).toBe(8);

    const stored = await request(app).get(`/api/v1/prospects/qualification?leadId=${leadId}`).set(authOwner()).expect(200);
    expect(stored.body.score.overallScore).toBeDefined();
    expect(stored.body.score.insufficientData).toBe(false);
  });

  it('returns INSUFFICIENT_DATA for empty leads, never a fake qualification', async () => {
    const lead = await request(app)
      .post('/api/v1/leads')
      .set(authOwner())
      .send({ linkedinUrl: `https://linkedin.com/in/phase4-empty-${stamp}`, name: 'Mystery Person' })
      .expect(201);
    const result = await request(app)
      .post('/api/v1/prospects/qualify')
      .set(authOwner())
      .send({ leadId: lead.body.lead.id })
      .expect(201);
    expect(result.body.qualification.status).toBe('INSUFFICIENT_DATA');
  });

  it('creates briefs, defaulting to no_outreach without facts', async () => {
    const brief = await request(app)
      .post('/api/v1/prospects/briefs')
      .set(authOwner())
      .send({ leadId })
      .expect(201);
    expect(brief.body.brief.recommendedApproach).toBe('no_outreach');
    expect(brief.body.brief.doNotClaim.length).toBeGreaterThan(0);
  });

  it('denies cross-workspace prospect access', async () => {
    await request(app).get(`/api/v1/prospects/qualification?leadId=${leadId}`).set(authOutsider()).expect(403);
    await request(app).post('/api/v1/prospects/qualify').set(authOutsider()).send({ leadId }).expect(403);
  });
});

describe('Strategy → Draft → Gates → Review → Prepared action', () => {
  it('rejects HIGH personalization without evidence', async () => {
    await request(app)
      .post('/api/v1/outreach/strategies')
      .set(authOwner())
      .send({
        leadId,
        objective: 'Start a conversation',
        audience: 'SaaS CTOs',
        angle: 'problem-led',
        reasonForContact: 'Relevant workflows.',
        personalizationLevel: 'high',
      })
      .expect(422);
  });

  it('creates and approves a strategy, then hits AI_UNAVAILABLE on compose', async () => {
    const created = await request(app)
      .post('/api/v1/outreach/strategies')
      .set(authOwner())
      .send({
        leadId,
        objective: 'Start a conversation',
        audience: 'SaaS CTOs drowning in tools',
        relationshipStage: 'cold',
        angle: 'problem-led',
        reasonForContact: 'Public post about scaling support pain.',
        relevantEvidence: [{ statement: 'Public post about scaling pain.', sourceRef: 'https://example.com/post' }],
        personalizationLevel: 'light',
        mustNotClaim: ['Funding', 'Guaranteed outcomes'],
      })
      .expect(201);
    strategyId = created.body.strategy.id as string;

    await request(app).post(`/api/v1/outreach/strategies/${strategyId}/approve`).set(authOwner()).send({}).expect(200);
    await request(app)
      .post('/api/v1/outreach/drafts')
      .set(authOwner())
      .send({ strategyId, draftType: 'first_message' })
      .expect(503);
  });

  it('validates drafts with gates and blocks fabricated details', async () => {
    const draft = await prisma.outreachDraft.create({
      data: {
        workspaceId,
        strategyId,
        leadId,
        draftType: 'FIRST_MESSAGE',
        opening: 'Hi Jane, congrats on your recent funding round!',
        relevance: 'Your scaling post resonated.',
        value: 'We guarantee 10x pipeline overnight. Act now!',
        body: 'Hi Jane, congrats on your recent funding round! Your scaling post resonated. We guarantee 10x pipeline overnight. Act now!',
        version: 1,
        createdBy: 'test',
      },
    });
    draftId = draft.id;

    const validation = await request(app)
      .post(`/api/v1/outreach/drafts/${draftId}/validate`)
      .set(authOwner())
      .send({})
      .expect(200);
    expect(typeof validation.body.validation.overallScore).toBe('number');
    expect(validation.body.validation.finalStatus).toBe('BLOCKED');
    const gates = validation.body.validation.results as Array<{ gate: string; status: string }>;
    expect(gates.find((g) => g.gate === 'personalization_grounding')?.status).toBe('BLOCKED');
    expect(gates.find((g) => g.gate === 'spamminess')?.status).toBe('BLOCKED');
  });

  it('blocks approval while gates are BLOCKED', async () => {
    const submitted = await request(app).post('/api/v1/outreach/reviews').set(authOwner()).send({ draftId }).expect(201);
    await request(app)
      .post(`/api/v1/outreach/reviews/${submitted.body.review.id}/decision`)
      .set(authOwner())
      .send({ action: 'approve' })
      .expect(422);
  });

  it('rejects viewer approval and outsider access', async () => {
    const reviews = await request(app).get(`/api/v1/outreach/reviews?draftId=${draftId}`).set(authOwner()).expect(200);
    const reviewId = (reviews.body.reviews as Array<{ id: string }>)[0]!.id;
    await request(app).post(`/api/v1/outreach/reviews/${reviewId}/decision`).set(authViewer()).send({ action: 'approve' }).expect(403);
    await request(app).post(`/api/v1/outreach/reviews/${reviewId}/decision`).set(authOutsider()).send({ action: 'approve' }).expect(403);
  });

  it('approves clean drafts, prepares actions, and enforces the terminal boundary', async () => {
    const clean = await prisma.outreachDraft.create({
      data: {
        workspaceId,
        strategyId,
        leadId,
        draftType: 'FIRST_MESSAGE',
        opening: 'Hi Jane, your post on scaling support caught my eye.',
        relevance: 'It matches the workflow problem we research.',
        value: 'One idea from that research, no pitch attached.',
        cta: 'Open to a brief conversation?',
        body: 'Hi Jane, your post on scaling support caught my eye. It matches the workflow problem we research. One idea from that research, no pitch attached. Open to a brief conversation?',
        version: 1,
        createdBy: 'test',
      },
    });

    const validation = await request(app)
      .post(`/api/v1/outreach/drafts/${clean.id}/validate`)
      .set(authOwner())
      .send({})
      .expect(200);
    expect(validation.body.validation.finalStatus).not.toBe('BLOCKED');

    const submitted = await request(app).post('/api/v1/outreach/reviews').set(authOwner()).send({ draftId: clean.id }).expect(201);
    await request(app)
      .post(`/api/v1/outreach/reviews/${submitted.body.review.id}/decision`)
      .set(authOwner())
      .send({ action: 'approve' })
      .expect(200);

    const prepared = await request(app)
      .post('/api/v1/outreach/prepared-actions')
      .set(authOwner())
      .send({ actionType: 'SEND_FIRST_MESSAGE', target: 'Jane Doe', draftId: clean.id, approvalId: submitted.body.review.id })
      .expect(201);
    expect(prepared.body.preparedAction.status).toBe('REQUIRES_APPROVAL');

    const ready = await request(app)
      .post(`/api/v1/outreach/prepared-actions/${prepared.body.preparedAction.id}/ready`)
      .set(authOwner())
      .send({})
      .expect(200);
    expect(ready.body.preparedAction.status).toBe('READY_FOR_AUTHORIZED_EXECUTION');

    await prisma.outreachDraft.update({ where: { id: clean.id }, data: { body: `${clean.body} Edited.` } });
    await request(app)
      .post(`/api/v1/outreach/prepared-actions/${prepared.body.preparedAction.id}/ready`)
      .set(authOwner())
      .send({})
      .expect(403);
  });

  it('deduplicates retried preparations on idempotency key (never double-prepares)', async () => {
    const draft = await prisma.outreachDraft.create({
      data: {
        workspaceId,
        strategyId,
        leadId,
        draftType: 'FIRST_MESSAGE',
        opening: 'Hi Jane, your scaling post caught my eye.',
        relevance: 'It matches the workflow problem we research.',
        value: 'One idea from that research, no pitch attached.',
        cta: 'Open to a brief conversation?',
        body: 'Hi Jane, your scaling post caught my eye. It matches the workflow problem we research. One idea from that research, no pitch attached. Open to a brief conversation?',
        version: 1,
        createdBy: 'test',
      },
    });
    const submitted = await request(app).post('/api/v1/outreach/reviews').set(authOwner()).send({ draftId: draft.id }).expect(201);
    await request(app)
      .post(`/api/v1/outreach/reviews/${submitted.body.review.id}/decision`)
      .set(authOwner())
      .send({ action: 'approve' })
      .expect(200);

    const payload = {
      actionType: 'SEND_FIRST_MESSAGE',
      target: 'Jane Doe',
      draftId: draft.id,
      approvalId: submitted.body.review.id,
      idempotencyKey: `idem-${stamp}`,
    };
    const first = await request(app).post('/api/v1/outreach/prepared-actions').set(authOwner()).send(payload).expect(201);
    const second = await request(app).post('/api/v1/outreach/prepared-actions').set(authOwner()).send(payload).expect(201);
    expect(second.body.preparedAction.id).toBe(first.body.preparedAction.id);
    const rows = await prisma.preparedAction.findMany({ where: { workspaceId, idempotencyKey: `idem-${stamp}` } });
    expect(rows).toHaveLength(1);

    // A different key prepares independently; no key always creates.
    const other = await request(app)
      .post('/api/v1/outreach/prepared-actions')
      .set(authOwner())
      .send({ ...payload, idempotencyKey: `idem-${stamp}-other` })
      .expect(201);
    expect(other.body.preparedAction.id).not.toBe(first.body.preparedAction.id);
    const nokey = await request(app)
      .post('/api/v1/outreach/prepared-actions')
      .set(authOwner())
      .send({ actionType: 'SEND_FIRST_MESSAGE', target: 'Jane Doe', draftId: draft.id, approvalId: submitted.body.review.id })
      .expect(201);
    expect(nokey.body.preparedAction.id).not.toBe(first.body.preparedAction.id);
  });

  it('blocks a second in-flight execution for the same lead (over-contact guard)', async () => {
    // Use existing lead if available, otherwise create one for this test.
    let testLeadId = leadId;
    if (!testLeadId) {
      const lead = await prisma.lead.create({
        data: { workspaceId, name: 'Guard Lead', linkedinUrl: `https://linkedin.com/in/guard-${stamp}`, headline: 'Test Lead' },
      });
      testLeadId = lead.id;
    }
    const actions = await prisma.preparedAction.findMany({
      where: { workspaceId, draft: { leadId: testLeadId }, status: 'REQUIRES_APPROVAL' },
      orderBy: { createdAt: 'asc' },
    });
    // If we don't have two, create fresh ones for this test.
    if (actions.length < 2) {
      const draft = await prisma.outreachDraft.create({
        data: {
          workspaceId,
          strategyId,
          leadId: testLeadId,
          draftType: 'FIRST_MESSAGE',
          opening: 'Hi Jane, your scaling post caught my eye.',
          relevance: 'It matches the workflow problem we research.',
          value: 'One idea from that research, no pitch attached.',
          cta: 'Open to a brief conversation?',
          body: 'Hi Jane, your scaling post caught my eye. It matches the workflow problem we research. One idea from that research, no pitch attached. Open to a brief conversation?',
          version: 1,
          createdBy: 'test',
        },
      });
      const submitted = await request(app).post('/api/v1/outreach/reviews').set(authOwner()).send({ draftId: draft.id }).expect(201);
      await request(app)
        .post(`/api/v1/outreach/reviews/${submitted.body.review.id}/decision`)
        .set(authOwner())
        .send({ action: 'approve' })
        .expect(200);

      const payload = {
        actionType: 'SEND_FIRST_MESSAGE',
        target: 'Jane Doe',
        draftId: draft.id,
        approvalId: submitted.body.review.id,
        idempotencyKey: `idem-${stamp}-guard-1`,
      };
      const first = await request(app).post('/api/v1/outreach/prepared-actions').set(authOwner()).send(payload).expect(201);
      const second = await request(app).post('/api/v1/outreach/prepared-actions').set(authOwner()).send({ ...payload, idempotencyKey: `idem-${stamp}-guard-2` }).expect(201);
      // Re-fetch
      const fresh = await prisma.preparedAction.findMany({
        where: { workspaceId, draft: { leadId }, status: 'REQUIRES_APPROVAL' },
        orderBy: { createdAt: 'asc' },
      });
      actions.push(...fresh);
    }
    expect(actions.length).toBeGreaterThanOrEqual(2);
    // First reaches ready and stamps the lead.
    await request(app)
      .post(`/api/v1/outreach/prepared-actions/${actions[0]!.id}/ready`)
      .set(authOwner())
      .send({})
      .expect(200);
    const lead = await prisma.lead.findUnique({ where: { id: testLeadId } });
    expect(lead?.lastContactAt).not.toBeNull();
    // Second for the same lead is blocked while the first is in flight.
    const blocked = await request(app)
      .post(`/api/v1/outreach/prepared-actions/${actions[1]!.id}/ready`)
      .set(authOwner())
      .send({})
      .expect(403);
    expect(blocked.body.error.message).toMatch(/already has a prepared outreach/);
    const row = await prisma.preparedAction.findUnique({ where: { id: actions[1]!.id } });
    expect(row?.status).toBe('BLOCKED');
  });
});

describe('Inbox intelligence + pipeline + bridge', () => {
  it('classifies conversations deterministically and recommends follow-ups', async () => {
    const conversation = await request(app)
      .post('/api/v1/conversations')
      .set(authOwner())
      .send({ leadId, subject: 'Intro' })
      .expect(201);
    const conversationId = conversation.body.conversation.id as string;

    await request(app)
      .post('/api/v1/messages')
      .set(authOwner())
      .send({ conversationId, body: 'Can we schedule a demo next week?', direction: 'inbound' })
      .expect(201);

    const classification = await request(app)
      .post('/api/v1/sales-intelligence/classify')
      .set(authOwner())
      .send({ conversationId })
      .expect(201);
    expect(classification.body.classification.classification).toBe('MEETING_REQUEST');

    const followUp = await request(app)
      .post('/api/v1/sales-intelligence/follow-ups')
      .set(authOwner())
      .send({ conversationId })
      .expect(201);
    expect(followUp.body.followUp.recommendation).toBe('RESPOND_TO_QUESTION');
  });

  it('enforces pipeline transitions and explicit closes', async () => {
    const created = await request(app)
      .post('/api/v1/pipeline')
      .set(authOwner())
      .send({ leadId, name: 'Acme deal', stage: 'prospecting' })
      .expect(201);
    const id = created.body.opportunity?.id ?? created.body.pipelineOpportunity?.id ?? created.body.id;
    await request(app).patch(`/api/v1/pipeline/${id}`).set(authOwner()).send({ stage: 'proposal' }).expect(422);
    await request(app).patch(`/api/v1/pipeline/${id}`).set(authOwner()).send({ stage: 'qualification' }).expect(200);
    await request(app).patch(`/api/v1/pipeline/${id}`).set(authOwner()).send({ stage: 'closed_won' }).expect(422);
  });

  it('measures bridge signals instead of asserting them', async () => {
    await request(app)
      .post('/api/v1/sales-intelligence/content-signals')
      .set(authOwner())
      .send({ signalType: 'objection', sourceConversationIds: [], evidence: 'Most prospects complain about pricing.' })
      .expect(422);

    const conversations = await request(app).get('/api/v1/conversations').set(authOwner()).expect(200);
    const ids = (conversations.body.conversations as Array<{ id: string }>).map((c) => c.id);
    const signal = await request(app)
      .post('/api/v1/sales-intelligence/content-signals')
      .set(authOwner())
      .send({ signalType: 'question', sourceConversationIds: ids.slice(0, 2), evidence: 'Two threads asked how onboarding works.', recommendedAngle: 'practical' })
      .expect(201);
    expect(signal.body.signal.frequency).toBe(Math.min(2, ids.length));

    const input = await request(app)
      .get(`/api/v1/sales-intelligence/content-signals/${signal.body.signal.id}/content-input`)
      .set(authOwner())
      .expect(200);
    expect(input.body.contentInput.conversationCount).toBe(Math.min(2, ids.length));
  });
});

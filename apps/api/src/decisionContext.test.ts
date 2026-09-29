import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';

const stamp = Date.now();
const email = `ctx-${stamp}@example.com`;
const password = 'testpassword123';

let token = '';
let workspaceId = '';
let leadId = '';
let lead2Id = '';
let topicId = '';
let matchedOppId = '';
let unmatchedOppId = '';

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Workspace-ID': workspaceId });

async function nextActions() {
  const res = await request(app).get('/api/v1/operator/next-actions?status=pending').set(auth()).expect(200);
  return res.body.actions as Array<{
    id: string;
    kind: string;
    title: string;
    score: number;
    reasons: string[];
    subjectMeta?: Record<string, unknown>;
  }>;
}

let workspaceB = '';
const emailB = `ctx-b-${stamp}@example.com`;
let tokenB = '';

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId, workspaceB], userEmails: [email, emailB] });
});

describe('decision consumes real workspace context', () => {
  it('registers, creates a workspace, and configures business+sales objectives', async () => {
    await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Ctx User' }).expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
    token = login.body.token as string;
    const ws = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Ctx WS ${stamp}` })
      .expect(201);
    workspaceId = (ws.body.workspace?.id ?? ws.body.id) as string;

    const strategy = await request(app)
      .put('/api/v1/business/strategy')
      .set(auth())
      .send({
        contentGoals: [{ goal: 'Publish practical founder checklists', pillar: 'founder checklists', format: 'checklist' }],
        salesGoals: [{ goal: 'Book discovery calls with SaaS founders', segment: 'saas founders' }],
        businessGoals: [],
        audienceGoals: [],
        growthGoals: [],
        productGoals: [],
      })
      .expect(200);
    expect(strategy.body.strategy.contentGoals).toHaveLength(1);
    expect(strategy.body.strategy.salesGoals).toHaveLength(1);
  });

  it('seeds two equally-scored opportunities, one objective-aligned', async () => {
    const topic = await prisma.topic.create({
      data: { workspaceId, name: 'Founder checklists', canonicalName: `founder-checklists-${stamp}`, description: 'founder checklist playbook' },
    });
    topicId = topic.id;
    // Deliberately separate topic: candidate text includes the topic name,
    // so sharing one topic would (correctly) align both opportunities.
    const quantumTopic = await prisma.topic.create({
      data: { workspaceId, name: 'Quantum computing', canonicalName: `quantum-${stamp}`, description: 'qubits laboratories decoherence' },
    });
    const matched = await prisma.contentOpportunity.create({
      data: {
        workspaceId, topicId,
        title: 'The founder checklist playbook',
        thesis: 'Founder checklists convert prospects.',
        problem: 'Demos ramble.', audience: 'Founders', angle: 'Practical',
        objective: 'TEACH_PRACTICAL', opportunityScore: 0.8, status: 'NEW',
        sourceIds: ['s-1'], claimIds: ['c-1'], trendSignalIds: [],
        reasoning: 'Seeded.', evidenceSummary: 'Seeded.',
      },
    });
    matchedOppId = matched.id;
    const unmatched = await prisma.contentOpportunity.create({
      data: {
        workspaceId, topicId: quantumTopic.id,
        title: 'Quantum computing outlook',
        thesis: 'Qubits advance steadily in laboratories.',
        problem: 'Decoherence.', audience: 'Physicists', angle: 'Analysis',
        objective: 'ANALYZE', opportunityScore: 0.8, status: 'NEW',
        sourceIds: ['s-1'], claimIds: ['c-1'], trendSignalIds: [],
        reasoning: 'Seeded.', evidenceSummary: 'Seeded.',
      },
    });
    unmatchedOppId = unmatched.id;
  });

  it('ranks the objective-aligned opportunity higher with a stated reason', async () => {
    const actions = await nextActions();
    const m = actions.find((a) => a.kind === 'content_opportunity' && a.title.includes('founder checklist playbook'));
    const u = actions.find((a) => a.kind === 'content_opportunity' && a.title.includes('Quantum computing outlook'));
    expect(m).toBeDefined();
    expect(u).toBeDefined();
    // Identical base scores (0.8) and evidence counts: the gap is objective fit
    // (+5 alignment bonus on the matched side, −3 mismatch deduction on the
    // other — bounded and reasoned, never a fabricated +50).
    expect(m!.score).toBeGreaterThan(u!.score);
    expect(m!.score - u!.score).toBeLessThanOrEqual(8);
    expect(m!.reasons.join(' ')).toMatch(/Supports CONTENT objective/);
    void matchedOppId;
    void unmatchedOppId;
  });

  it('explains the mismatch honestly on the unaligned opportunity', async () => {
    const actions = await nextActions();
    const u = actions.find((a) => a.kind === 'content_opportunity' && a.title.includes('Quantum computing outlook'))!;
    expect(u).toBeDefined();
    const res = await request(app).get(`/api/v1/operator/explanations/${u.id}`).set(auth()).expect(200);
    const whyNot = (res.body.explanation.whyNot ?? []) as string[];
    expect(whyNot).toContain('Does not visibly support any configured objective');
    expect(res.body.explanation.signalConfidence).toBeDefined();
    expect(res.body.explanation.recommendationConfidence).toBeDefined();
  });

  it('updates objectives and keeps them workspace-scoped', async () => {
    const updated = await request(app).put('/api/v1/business/strategy').set(auth()).send({
      contentGoals: [{ goal: 'Publish practical founder checklists', pillar: 'founder checklists' }],
      salesGoals: [{ goal: 'Book discovery calls with SaaS founders' }],
      businessGoals: [{ goal: 'Grow qualified pipeline' }],
      audienceGoals: [], growthGoals: [], productGoals: [],
    }).expect(200);
    expect(updated.body.strategy.businessGoals).toHaveLength(1);
    expect(updated.body.strategy.contentGoals).toHaveLength(1);

    await request(app).post('/api/v1/auth/register').send({ email: emailB, password, name: 'Ctx B' }).expect(201);
    const loginB = await request(app).post('/api/v1/auth/login').send({ email: emailB, password }).expect(200);
    tokenB = loginB.body.token as string;
    const wsB = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: `Ctx WS B ${stamp}` })
      .expect(201);
    workspaceB = (wsB.body.workspace?.id ?? wsB.body.id) as string;
    const headersB = { Authorization: `Bearer ${tokenB}`, 'X-Workspace-ID': workspaceB };
    // B cannot write A's strategy, and B's own objectives never leak into A.
    await request(app).put('/api/v1/business/strategy').set({
      Authorization: `Bearer ${tokenB}`, 'X-Workspace-ID': workspaceId,
    }).send({ contentGoals: [] }).expect(403);
    await request(app).put('/api/v1/business/strategy').set(headersB).send({
      contentGoals: [{ goal: 'Write about quantum computing' }],
      salesGoals: [], businessGoals: [], audienceGoals: [], growthGoals: [], productGoals: [],
    }).expect(200);
    const actions = await nextActions();
    const m = actions.find((a) => a.kind === 'content_opportunity' && a.title.includes('founder checklist playbook'));
    expect(m!.reasons.join(' ')).toMatch(/Supports CONTENT objective/);
    expect(m!.reasons.join(' ')).not.toMatch(/quantum/i);
  });

  it('imports a lead and surfaces a relevance candidate with lead-state reasoning', async () => {
    await request(app).post('/api/v1/icps').set(auth()).send({
      name: `ICP ${stamp}`, description: 'SaaS founders',
      targetRoles: ['Founder'], industries: ['SaaS'],
    }).expect(201);
    const lead = await request(app).post('/api/v1/leads').set(auth()).send({
      linkedinUrl: `https://linkedin.com/in/ctx-lead-${stamp}`,
      name: 'Fiona Founder',
      headline: 'Founder writing checklists',
      company: 'Checklist SaaS',
    }).expect(201);
    leadId = lead.body.lead.id as string;
    const actions = await nextActions();
    const rel = actions.find((a) => a.kind === 'prospect_relevance' && JSON.stringify(a).includes(leadId));
    expect(rel).toBeDefined();
    expect(rel!.reasons.join(' ')).toMatch(/Lead status: NEW/);
  });

  it('records DIRECT attribution and surfaces it as decision evidence', async () => {
    const conv = await request(app).post('/api/v1/conversations').set(auth()).send({ leadId }).expect(201);
    const convId = conv.body.conversation.id as string;
    await request(app).post('/api/v1/attribution/links').set(auth()).send({
      sourceType: 'conversation', sourceId: convId,
      targetType: 'lead', targetId: leadId,
      attributionType: 'DIRECT',
      evidenceRefs: [`conversation:${convId}`],
      reason: 'Conversation is with this lead.',
    }).expect(201);
    const actions = await nextActions();
    const rel = actions.find((a) => a.kind === 'prospect_relevance' && JSON.stringify(a).includes(leadId));
    expect(rel).toBeDefined();
    expect(rel!.reasons.join(' ')).toMatch(/DIRECT attribution/);
  });

  it('confirmed learning on relevance boosts cross-machine candidates', async () => {
    const before = await nextActions();
    const relBefore = before.find((a) => a.kind === 'prospect_relevance' && JSON.stringify(a).includes(leadId))!;
    expect(relBefore).toBeDefined();
    const scoreBefore = relBefore.score;
    const created = await request(app).post('/api/v1/learning/derived').set(auth()).send({
      dimension: 'relevance',
      observedPattern: 'Checklist topics convert.',
      reason: 'Seeded test learning.',
      proposedAdjustment: 0.08,
      sampleSize: 5,
    }).expect(201);
    const proposalId = created.body.proposal.id as string;
    await request(app).post(`/api/v1/learning/derived/${proposalId}/confirm`).set(auth()).send({}).expect(200);
    const stored = await prisma.learningProposal.findUnique({ where: { id: proposalId } });
    expect(stored?.status).toBe('CONFIRMED');
    const after = await nextActions();
    const relAfter = after.find((a) => a.kind === 'prospect_relevance' && JSON.stringify(a).includes(leadId))!;
    expect(relAfter).toBeDefined();
    expect(relAfter.score).toBeGreaterThan(scoreBefore);
    const explanation = await request(app).get(`/api/v1/operator/explanations/${relAfter.id}`).set(auth()).expect(200);
    expect(JSON.stringify(explanation.body.explanation.learningApplied)).toMatch(/relevance/);
    expect(explanation.body.explanation.reasons.join(' ')).toMatch(/confirmed learning/);
  });

  it('suppresses outreach initiation after a human NO_OUTREACH follow-up', async () => {
    const lead2 = await request(app).post('/api/v1/leads').set(auth()).send({
      linkedinUrl: `https://linkedin.com/in/ctx-lead2-${stamp}`,
      name: 'Nina NoOutreach',
      headline: 'Founder writing checklists',
      company: 'Checklist SaaS',
    }).expect(201);
    lead2Id = lead2.body.lead.id as string;
    let actions = await nextActions();
    expect(actions.some((a) => a.kind === 'prospect_relevance' && JSON.stringify(a).includes(lead2Id))).toBe(true);
    await prisma.followUpRecommendation.create({
      data: { workspaceId, leadId: lead2Id, recommendation: 'NO_OUTREACH', why: 'Human: do not contact.', evidence: 'Manual review.' },
    });
    actions = await nextActions();
    expect(actions.some((a) => a.kind === 'prospect_relevance' && JSON.stringify(a).includes(lead2Id))).toBe(false);
  });

  it('suppresses relevance when the lead already has an approved strategy', async () => {
    const owner = await prisma.user.findUnique({ where: { email } });
    await prisma.outreachStrategy.create({
      data: {
        workspaceId, leadId, objective: 'Intro', audience: 'Founders',
        relationshipStage: 'COLD', angle: 'problem-led', reasonForContact: 'Seeded.',
        personalizationLevel: 'LIGHT', status: 'APPROVED', createdBy: owner!.id,
      },
    });
    const actions = await nextActions();
    expect(actions.some((a) => a.kind === 'prospect_relevance' && JSON.stringify(a).includes(leadId))).toBe(false);
  });

  it('surfaces human-reviewed comment signals without creating prospects', async () => {
    const posted = await request(app).post('/api/v1/comments').set(auth()).send({
      platform: 'linkedin',
      authorName: 'Interested Reader',
      text: 'Your demo was great — what does pricing look like? I would like to book a call.',
    }).expect(201);
    const commentId = posted.body.comment.id as string;
    const signals = await request(app).get('/api/v1/comments/sales-signals?status=PENDING_REVIEW').set(auth()).expect(200);
    const signal = (signals.body.signals as Array<{ id: string; commentId: string }>).find((s) => s.commentId === commentId);
    expect(signal).toBeDefined();
    // Before review: not a decision candidate.
    let actions = await nextActions();
    expect(actions.some((a) => a.kind === 'comment_signal')).toBe(false);
    await request(app).post(`/api/v1/comments/sales-signals/${signal!.id}/review`).set(auth()).send({ decision: 'REVIEWED' }).expect(200);
    actions = await nextActions();
    const surfaced = actions.find((a) => a.kind === 'comment_signal');
    expect(surfaced).toBeDefined();
    expect(surfaced!.reasons.join(' ')).toMatch(/Human-reviewed sales signal/);
    expect(surfaced!.reasons.join(' ')).toMatch(/separate explicit human action/);
    // Still no prospect created by the review.
    const prospects = await prisma.lead.count({ where: { workspaceId, name: 'Interested Reader' } });
    expect(prospects).toBe(0);
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { runDailyLoop } from './worker/dailyRun';

const stamp = Date.now();
const email = `sigflow-${stamp}@example.com`;
const password = 'testpassword123';

let token = '';
let workspaceId = '';
let ownerId = '';
let topicId = '';
let leadId = '';

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Workspace-ID': workspaceId });

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [email] });
});

describe('signal → opportunity → triage → idea chain', () => {
  it('registers a workspace with a topic, lead, and content idea', async () => {
    await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Sig User' }).expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
    token = login.body.token as string;
    const owner = await prisma.user.findUnique({ where: { email } });
    ownerId = owner!.id;
    const ws = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Sig WS ${stamp}` })
      .expect(201);
    workspaceId = (ws.body.workspace?.id ?? ws.body.id) as string;

    const topic = await prisma.topic.create({
      data: { workspaceId, name: 'Founder checklists', canonicalName: `sig-checklists-${stamp}`, description: 'founder checklist playbook' },
    });
    topicId = topic.id;
    const lead = await request(app).post('/api/v1/leads').set(auth()).send({
      linkedinUrl: `https://linkedin.com/in/sig-lead-${stamp}`,
      name: 'Sam Signal',
      headline: 'Founder writing checklists',
      company: 'Checklist SaaS',
    }).expect(201);
    leadId = lead.body.lead.id as string;
    // Content the worker can later attach as relevant to the brief.
    await prisma.contentIdea.create({
      data: {
        workspaceId, authorId: ownerId, topicId,
        title: 'The founder checklist playbook',
        description: 'Checklist post for founders.',
        format: 'CHECKLIST', status: 'DRAFT', tags: [],
        thesis: 'Founder checklists convert.',
      },
    });
  });

  it('records an objection pattern across two conversations', async () => {
    const mkConv = async (subject: string) => {
      const res = await request(app).post('/api/v1/conversations').set(auth()).send({ leadId, subject }).expect(201);
      return res.body.conversation.id as string;
    };
    const convA = await mkConv('Call A');
    const convB = await mkConv('Call B');
    for (const convId of [convA, convB]) {
      await prisma.conversationClassificationResult.create({
        data: {
          workspaceId, conversationId: convId, classification: 'OBJECTION',
          confidence: 0.8, evidence: `Objection language detected: "too expensive for our budget" (${convId.slice(0, 4)}).`,
          recommendedNextStep: 'Address pricing.',
        },
      });
    }
  });

  it('records a sales content signal through the real API', async () => {
    const conv = await request(app).post('/api/v1/conversations').set(auth()).send({ leadId, subject: 'Signal call' }).expect(201);
    const res = await request(app).post('/api/v1/sales-intelligence/content-signals').set(auth()).send({
      signalType: 'REPEATED_QUESTION',
      sourceConversationIds: [conv.body.conversation.id as string],
      evidence: 'Prospects repeatedly ask how long a founder demo should run.',
      frequency: 2,
      recommendedAngle: 'Checklist post on demo length.',
      reasoning: 'Seeded signal.',
    }).expect(201);
    expect(res.body.signal.id).toBeDefined();
  });

  it('runs the daily loop: signals become NEW opportunities with provenance', { timeout: 30000 }, async () => {
    // Seed one surfaced relevance action (as a previous refresh would have):
    // the producer reuses decision output instead of recomputing fan-out.
    await prisma.operatorAction.create({
      data: {
        workspaceId, identityKey: `prospect_relevance:${topicId}:${leadId}`, kind: 'prospect_relevance',
        subjectId: leadId, title: 'Seeded relevance', score: 70, reasons: ['Seeded.'],
        evidenceLinks: [], subjectMeta: {
          topicId, topicName: 'Founder checklists', leadId, leadName: 'Sam Signal',
          relevance: 0.82, dimensions: [], icpUsed: null,
        }, status: 'PENDING',
      },
    });
    const result = await runDailyLoop(workspaceId, '2026-11-01');
    expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);
    const decision = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRun: { runDate: new Date('2026-11-01T00:00:00.000Z') }, stage: 'DECISION' },
    });
    expect(decision?.status).toBe('SUCCEEDED');
    expect((decision?.counts as Record<string, number>).signalOpportunitiesCreated).toBeGreaterThanOrEqual(3);

    const opps = await prisma.contentOpportunity.findMany({
      where: { workspaceId, originKind: { not: null } },
    });
    const kinds = new Set(opps.map((o) => o.originKind));
    expect(kinds.has('objection_pattern')).toBe(true);
    expect(kinds.has('prospect_relevance')).toBe(true);
    expect(kinds.has('sales_content_signal')).toBe(true);
    for (const opp of opps) {
      expect(opp.status).toBe('NEW');
      expect(opp.originId).toBeTruthy();
      expect(opp.reasoning).toMatch(/Triage before any idea/);
    }
    // Objection topic is deterministic signal taxonomy, not a fabricated claim.
    const objectionOpp = opps.find((o) => o.originKind === 'objection_pattern')!;
    const topic = await prisma.topic.findUnique({ where: { id: objectionOpp.topicId } });
    expect(topic!.name).toMatch(/^Objection: /);
  });

  it('same-run decision ranks the new signal opportunities', async () => {
    const res = await request(app).get('/api/v1/operator/next-actions?status=pending').set(auth()).expect(200);
    const kinds = new Set((res.body.actions as Array<{ kind: string }>).map((a) => a.kind));
    expect(kinds.has('content_opportunity')).toBe(true);
  });

  it('second run creates no duplicates (origin dedupe, any status)', async () => {
    const before = await prisma.contentOpportunity.count({ where: { workspaceId, originKind: { not: null } } });
    const result = await runDailyLoop(workspaceId, '2026-11-02');
    expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);
    const after = await prisma.contentOpportunity.count({ where: { workspaceId, originKind: { not: null } } });
    expect(after).toBe(before);
    const decision = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRun: { runDate: new Date('2026-11-02T00:00:00.000Z') }, stage: 'DECISION' },
    });
    expect((decision?.counts as Record<string, number>).signalOpportunitiesSkipped).toBeGreaterThan(0);
  });

  it('human triage converts a signal opportunity into an idea (chain into content)', async () => {
    const opp = await prisma.contentOpportunity.findFirst({
      where: { workspaceId, originKind: 'prospect_relevance', status: 'NEW' },
    });
    expect(opp).toBeDefined();
    await request(app)
      .patch(`/api/v1/intelligence/opportunities/${opp!.id}/status`)
      .set(auth())
      .send({ status: 'REVIEWED' })
      .expect(200);
    const converted = await request(app)
      .post(`/api/v1/intelligence/opportunities/${opp!.id}/convert`)
      .set(auth())
      .send({})
      .expect(201);
    expect(converted.body.contentIdea?.id ?? converted.body.idea?.id ?? converted.body.id).toBeDefined();
    const idea = await prisma.contentIdea.findFirst({ where: { workspaceId, opportunityId: opp!.id } });
    expect(idea).toBeDefined();
    expect(idea!.status).toBe('DRAFT');
  });

  it('worker persists relevant-content suggestions onto the brief (no discard)', async () => {
    const brief = await prisma.prospectBrief.findFirst({ where: { workspaceId, leadId } });
    expect(brief).toBeDefined();
    const relevance = brief!.relevance as { suggestions?: Array<{ ideaId: string; title: string; relevance: number; reason: string }>; computedAt?: string; provenance?: string } | null;
    expect(relevance).not.toBeNull();
    expect(relevance!.suggestions!.length).toBeGreaterThan(0);
    const titles = relevance!.suggestions!.map((s) => s.title);
    expect(titles).toContain('The founder checklist playbook');
    expect(relevance!.computedAt).toBeTruthy();
    expect(relevance!.provenance).toMatch(/deterministic/);
    // Readable back through the real briefs API.
    const res = await request(app).get(`/api/v1/prospects/briefs?leadId=${leadId}`).set(auth()).expect(200);
    const apiBrief = (res.body.briefs as Array<{ id: string; relevance: unknown }>).find((b) => b.id === brief!.id);
    expect(apiBrief?.relevance).toBeDefined();
  });

  it('a lead with no overlapping content keeps an honestly null brief relevance', async () => {
    const other = await request(app).post('/api/v1/leads').set(auth()).send({
      linkedinUrl: `https://linkedin.com/in/sig-other-${stamp}`,
      name: 'Olivia Orthogonal',
      headline: 'Marine biologist studying tide pools',
      company: 'Tide Institute',
    }).expect(201);
    const otherLeadId = other.body.lead.id as string;
    await runDailyLoop(workspaceId, '2026-11-03');
    const brief = await prisma.prospectBrief.findFirst({ where: { workspaceId, leadId: otherLeadId } });
    expect(brief).toBeDefined();
    expect(brief!.relevance).toBeNull();
  });

  it('execution stays unavailable throughout the loop', async () => {
    for (const date of ['2026-11-01', '2026-11-02', '2026-11-03']) {
      const stage = await prisma.runStage.findFirst({
        where: { workspaceId, dailyRun: { runDate: new Date(`${date}T00:00:00.000Z`) }, stage: 'EXECUTION' },
      });
      expect(stage?.status).toBe('SKIPPED');
    }
    const readiness = await request(app).get('/api/v1/readiness').set(auth()).expect(200);
    expect(readiness.body.readiness.platformExecution).toBeDefined();
    const linkedIn = readiness.body.readiness.platformExecution.find((p: any) => p.platform === 'LINKEDIN');
    expect(linkedIn).toBeDefined();
    expect(linkedIn.publishingReady).toBe(false);
  });
});

import { describe, it, expect, vi, afterAll, afterEach, beforeEach } from 'vitest';
import { promises as dnsPromises } from 'dns';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { runDailyLoop } from './worker/dailyRun';

// Hermetic DNS: the SSRF guard resolves hostnames for real, but sandbox DNS
// is unavailable/flaky. A documentation IP keeps network-bound tests
// deterministic without touching the guard's logic.
beforeEach(() => {
  vi.spyOn(dnsPromises, 'resolve4').mockResolvedValue(['93.184.216.34']);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const stamp = Date.now();
const email = `e2e-${stamp}@example.com`;
const outsiderEmail = `e2e-out-${stamp}@example.com`;
const password = 'testpassword123';

let token = '';
let outsiderToken = '';
let outsiderWs = '';
let workspaceId = '';
let leadId = '';
let signalOppScoreBefore = 0;
let signalOppId = '';

const auth = () => ({ Authorization: `Bearer ${token}`, 'X-Workspace-ID': workspaceId });

function stubNetwork() {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>E2E feed</title><link>https://example.com/e2e-feed</link>
<item><title>Founder checklists that convert</title><link>https://example.com/e2e-story-1</link><pubDate>Mon, 10 Nov 2026 08:00:00 GMT</pubDate><description>Checklist notes for founders.</description></item>
<item><title>Onboarding teardowns</title><link>https://example.com/e2e-story-2</link><pubDate>Tue, 11 Nov 2026 08:00:00 GMT</pubDate><description>Teardown notes.</description></item>
</channel></rss>`;
  const article = (title: string, body: string) =>
    `<html><head><title>${title}</title></head><body><article><h1>${title}</h1><p>${body}</p><p>Second paragraph with enough words to extract meaningful content for the pipeline.</p></article></body></html>`;
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.endsWith('/e2e-feed.xml')) {
        return new Response(rss, { status: 200, headers: { 'Content-Type': 'application/rss+xml' } });
      }
      if (url.includes('e2e-story-1')) {
        return new Response(article('Founder checklists that convert', 'Founder checklists convert prospects when each step names an owner.'), {
          status: 200, headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url.includes('e2e-story-2')) {
        return new Response(article('Onboarding teardowns', 'Worked onboarding examples make advice concrete for teams.'), {
          status: 200, headers: { 'Content-Type': 'text/html' },
        });
      }
      // Anything else (including AI provider calls): unavailable, never faked.
      return new Response('unavailable in test', { status: 404 });
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId, outsiderWs], userEmails: [email, outsiderEmail] });
});

describe('batch 3 end-to-end: fresh workspace preparation workflow', () => {
  it('1. registers a user and creates an empty workspace (onboarding incomplete)', async () => {
    await request(app).post('/api/v1/auth/register').send({ email, password, name: 'E2E User' }).expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
    token = login.body.token as string;
    const ws = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `E2E WS ${stamp}` })
      .expect(201);
    workspaceId = (ws.body.workspace?.id ?? ws.body.id) as string;
    const onboarding = await request(app).get('/api/v1/onboarding').set(auth()).expect(200);
    expect(onboarding.body.onboarding.complete).toBe(false);
  });

  it('2. creates the profile through the supported API (no deadlock)', async () => {
    await request(app).get('/api/v1/profiles/me').set(auth()).expect(404);
    const created = await request(app).post('/api/v1/profiles').set(auth()).send({
      headline: 'Founder at Acme', role: 'Founder', summary: 'Building checklists.',
      professionalContext: 'B2B SaaS.', industry: 'SaaS', location: 'Berlin',
    }).expect(201);
    expect(created.body.profile.role).toBe('Founder');
    const reread = await request(app).get('/api/v1/profiles/me').set(auth()).expect(200);
    expect(reread.body.profile.headline).toBe('Founder at Acme');
  });

  it('3. configures voice, receipts, and samples', async () => {
    await request(app).put('/api/v1/voice/profile').set(auth()).send({
      role: 'Founder', tone: 'Plain and practical.', bannedWords: ['viral', 'guaranteed'],
      preferredVocabulary: ['checklist'], contentPillars: ['founder-led sales'],
    }).expect(200);
    await request(app).post('/api/v1/voice/receipts').set(auth()).send({ fact: 'Prefers checklist posts.' }).expect(201);
    await request(app).post('/api/v1/voice/samples').set(auth()).send({ title: 'Sample', content: 'Three things I cut from my demos this week for focus.' }).expect(201);
  });

  it('4. creates a full-field ICP and three-level objectives', async () => {
    const icp = await request(app).post('/api/v1/icps').set(auth()).send({
      name: `E2E ICP ${stamp}`, description: 'SaaS founders',
      targetRoles: ['Founder'], industries: ['SaaS'], companySize: '1-50',
      problems: 'Demos ramble.', exclusions: 'Enterprise',
    }).expect(201);
    expect(icp.body.icp.targetRoles).toEqual(['Founder']);
    const strategy = await request(app).put('/api/v1/business/strategy').set(auth()).send({
      businessGoals: [{ goal: 'Grow qualified pipeline' }],
      contentGoals: [{ goal: 'Publish practical founder checklists', pillar: 'founder checklists', format: 'checklist' }],
      salesGoals: [{ goal: 'Book discovery calls with SaaS founders', segment: 'saas founders' }],
      audienceGoals: [], growthGoals: [], productGoals: [],
    }).expect(200);
    expect(strategy.body.strategy.salesGoals).toHaveLength(1);
    await request(app).put('/api/v1/business/business').set(auth()).send({
      name: 'Acme', products: [{ name: 'Checklist OS', type: 'saas' }],
    }).expect(200);
  });

  it('5. configures a signal source and imports leads by CSV', async () => {
    await request(app).post('/api/v1/feeds').set(auth()).send({
      url: 'https://example.com/e2e-feed.xml',
      type: 'rss', name: 'E2E feed',
    }).expect(201);
    const csv = [
      'name,linkedinUrl,headline,company',
      `Eva E2E,https://linkedin.com/in/e2e-eva-${stamp},Founder writing checklists,Checklist SaaS`,
      `Bad Row,not-a-url,Nope,Nowhere`,
    ].join('\n');
    const imported = await request(app).post('/api/v1/leads/import').set(auth()).send({ csv, filename: `e2e-${stamp}.csv` }).expect(201);
    expect(imported.body.imported).toBe(1);
    expect(imported.body.skipped.length).toBeGreaterThanOrEqual(1);
    const leads = await request(app).get('/api/v1/leads').set(auth()).expect(200);
    leadId = (leads.body.leads as Array<{ id: string; name: string }>).find((l) => l.name === 'Eva E2E')!.id;
    expect(leadId).toBeTruthy();
  });

  it('6. configures schedule and autonomy policy', async () => {
    await request(app).put('/api/v1/onboarding/schedule').set(auth()).send({
      timezone: 'UTC', dailyRunTime: '00:00',
      dailyLlmCallCap: 10, dailyFetchCap: 20, dailyPreparationCap: 10,
      dailyExecutionCap: 0, autonomyTier: 0,
    }).expect(200);
    const policy = await request(app).put('/api/v1/onboarding/policy').set(auth()).send({
      tier1PostingEnabled: false, tier1PostingDailyCap: 0, tier1RequireApprovedPost: true,
      tier2HumanApprovalAck: true, autoPrepareApprovedWork: true, autoPrepareColdWork: false,
      dailyAutoPreparationQuota: 5,
    }).expect(200);
    expect(policy.body.effectiveTier1).toBe('disabled-no-integration');
    const onboarding = await request(app).get('/api/v1/onboarding').set(auth()).expect(200);
    expect(onboarding.body.settings.scheduleConfigured).toBe(true);
  });

  it('7. records sales signals honestly (no fabrication)', async () => {
    const conv = await request(app).post('/api/v1/conversations').set(auth()).send({ leadId, subject: 'Pricing call' }).expect(201);
    const conv2 = await request(app).post('/api/v1/conversations').set(auth()).send({ leadId, subject: 'Follow-up call' }).expect(201);
    for (const convId of [conv.body.conversation.id as string, conv2.body.conversation.id as string]) {
      await prisma.conversationClassificationResult.create({
        data: {
          workspaceId, conversationId: convId, classification: 'OBJECTION',
          confidence: 0.8, evidence: `Objection language detected: "too expensive for our budget" (${convId.slice(0, 4)}).`,
          recommendedNextStep: 'Address pricing.',
        },
      });
    }
    await request(app).post('/api/v1/sales-intelligence/content-signals').set(auth()).send({
      signalType: 'REPEATED_QUESTION',
      sourceConversationIds: [conv.body.conversation.id as string],
      evidence: 'Prospects repeatedly ask how long a founder demo should run.',
      frequency: 2,
      recommendedAngle: 'Checklist post on demo length.',
      reasoning: 'Seeded E2E signal.',
    }).expect(201);
  });

  it('8. runs the daily worker: intelligence → opportunities → decision → snapshot', async () => {
    stubNetwork();
    const result = await runDailyLoop(workspaceId, '2026-11-25');
    expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);
    const at = async (stage: string) =>
      prisma.runStage.findFirst({
        where: { workspaceId, dailyRun: { runDate: new Date('2026-11-25T00:00:00.000Z') }, stage: stage as never },
      });
    expect((await at('INTELLIGENCE'))?.status).toBe('SUCCEEDED');
    expect((await at('DECISION'))?.status).toBe('SUCCEEDED');
    expect((await at('APPROVAL_SNAPSHOT'))?.status).toBe('SUCCEEDED');
    expect((await at('EXECUTION'))?.status).toBe('SKIPPED');
    expect((await at('DIGEST'))?.status).toBe('SUCCEEDED');

    const feed = await prisma.feedSource.findFirst({ where: { workspaceId } });
    expect(feed?.lastError).toBeNull();
    const sources = await prisma.intelligenceSource.count({ where: { workspaceId } });
    expect(sources).toBeGreaterThanOrEqual(2);

    const signalOpps = await prisma.contentOpportunity.findMany({ where: { workspaceId, originKind: { not: null } } });
    expect(signalOpps.length).toBeGreaterThanOrEqual(2);
    for (const opp of signalOpps) {
      expect(opp.status).toBe('NEW');
      expect(opp.originId).toBeTruthy();
    }
    const snapshot = await prisma.approvalSnapshot.findFirst({ where: { workspaceId } });
    expect(snapshot).toBeDefined();
    expect((snapshot!.counts as Record<string, number>).pendingActions).toBeGreaterThan(0);
  });

  it('9. decisions explain themselves from real state', async () => {
    const res = await request(app).get('/api/v1/operator/next-actions?status=pending').set(auth()).expect(200);
    const actions = res.body.actions as Array<{ id: string; kind: string; score: number; title: string; reasons: string[] }>;
    const signalOpp = actions.find((a) => a.kind === 'content_opportunity' && a.title.includes('demo length'));
    expect(signalOpp).toBeDefined();
    signalOppId = signalOpp!.id;
    signalOppScoreBefore = signalOpp!.score;
    expect(signalOpp!.reasons.join(' ')).toMatch(/Supports (CONTENT|SALES) objective/);
    const explanation = await request(app).get(`/api/v1/operator/explanations/${signalOpp!.id}`).set(auth()).expect(200);
    expect(explanation.body.explanation.whyNot.length).toBeGreaterThan(0);
    expect(explanation.body.explanation.signalConfidence).toMatch(/LOW|MEDIUM|HIGH|UNKNOWN/);
  });

  it('10. researches, qualifies, and prepares outreach with human gates', async () => {
    await request(app).post('/api/v1/prospects/research').set(auth()).send({ leadId }).expect(201);
    const qualified = await request(app)
      .post('/api/v1/prospects/qualify')
      .set(auth())
      .send({ leadId, researchFactCount: 2 })
      .expect(201);
    expect(['QUALIFIED', 'POSSIBLE_FIT']).toContain(qualified.body.qualification.status);
    const suggestions = await request(app).get(`/api/v1/outreach/strategies/relevant-content?leadId=${leadId}`).set(auth()).expect(200);
    expect(Array.isArray(suggestions.body.suggestions)).toBe(true);
    const strategy = await request(app).post('/api/v1/outreach/strategies').set(auth()).send({
      leadId, objective: 'Start a conversation', audience: 'Founder at SaaS',
      angle: 'problem-led', reasonForContact: 'Shared interest in demo checklists.',
    }).expect(201);
    await request(app).post(`/api/v1/outreach/strategies/${strategy.body.strategy.id}/approve`).set(auth()).send({}).expect(200);
    const brief = await prisma.prospectBrief.findFirst({ where: { workspaceId, leadId } });
    expect(brief).toBeDefined();
  });

  it('11. reviews a comment signal without fabricating a prospect', async () => {
    const posted = await request(app).post('/api/v1/comments').set(auth()).send({
      platform: 'linkedin', authorName: 'Curious Reader',
      text: 'Loved the demo notes — what does pricing look like? Keen to book a call.',
    }).expect(201);
    const signals = await request(app).get('/api/v1/comments/sales-signals?status=PENDING_REVIEW').set(auth()).expect(200);
    const signal = (signals.body.signals as Array<{ id: string }>)[0];
    expect(signal).toBeDefined();
    await request(app).post(`/api/v1/comments/sales-signals/${signal!.id}/review`).set(auth()).send({ decision: 'REVIEWED' }).expect(200);
    expect(await prisma.lead.count({ where: { workspaceId, name: 'Curious Reader' } })).toBe(0);
    const conv = await request(app).post('/api/v1/conversations').set(auth()).send({ leadId, subject: 'E2E attribution' }).expect(201);
    await request(app).post('/api/v1/attribution/links').set(auth()).send({
      sourceType: 'conversation', sourceId: conv.body.conversation.id as string,
      targetType: 'lead', targetId: leadId, attributionType: 'INFERRED',
      reason: 'Conversation is with this lead.',
    }).expect(201);
  });

  it('12. recorded outcomes derive learning that later decisions consume', async () => {
    // Outcome metrics honestly require a subject reference: link them to a
    // real pipeline opportunity for this lead.
    const pipe = await request(app).post('/api/v1/pipeline').set(auth()).send({
      leadId, name: `E2E pilot ${stamp}`, stage: 'prospecting',
    }).expect(201);
    const pipelineOpportunityId = pipe.body.opportunity.id as string;
    for (const [unit, values] of [['email', [10, 12, 11]], ['call', [20, 22, 21]]] as const) {
      for (const value of values) {
        await request(app).post('/api/v1/outcomes').set(auth()).send({
          pipelineOpportunityId,
          metricName: 'responses', metricValue: value, unit, source: 'Manual CRM export',
        }).expect(201);
      }
    }
    const derived = await request(app).post('/api/v1/learning/derived').set(auth()).send({ metricName: 'responses', minSampleSize: 3 }).expect(201);
    expect(derived.body.proposal.status).toBe('PROPOSED');
    await request(app).post(`/api/v1/learning/derived/${derived.body.proposal.id}/confirm`).set(auth()).send({}).expect(200);
    const res = await request(app).get('/api/v1/operator/next-actions?status=pending').set(auth()).expect(200);
    const after = (res.body.actions as Array<{ id: string; kind: string; score: number; title: string }>).find((a) => a.id === signalOppId);
    expect(after).toBeDefined();
    expect(after!.score).toBeGreaterThan(signalOppScoreBefore);
    const explanation = await request(app).get(`/api/v1/operator/explanations/${signalOppId}`).set(auth()).expect(200);
    expect(JSON.stringify(explanation.body.explanation.learningApplied)).toMatch(/evidence_strength/);
  });

  it('13. digest reports actual state; execution stays unavailable', async () => {
    const reports = await request(app).get('/api/v1/brain/reports?frequency=DAILY&limit=1').set(auth()).expect(200);
    expect((reports.body.reports as unknown[]).length).toBeGreaterThanOrEqual(1);
    const readiness = await request(app).get('/api/v1/readiness').set(auth()).expect(200);
    expect(readiness.body.readiness.linkedInExecution.ready).toBe(false);
    const runs = await request(app).get('/api/v1/runs?take=1').set(auth()).expect(200);
    expect((runs.body.runs as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  it('14. workspace isolation holds end to end', async () => {
    await request(app).post('/api/v1/auth/register').send({ email: outsiderEmail, password, name: 'Out' }).expect(201);
    const login = await request(app).post('/api/v1/auth/login').send({ email: outsiderEmail, password }).expect(200);
    outsiderToken = login.body.token as string;
    const ws = await request(app)
      .post('/api/v1/workspaces')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: `E2E Out WS ${stamp}` })
      .expect(201);
    outsiderWs = (ws.body.workspace?.id ?? ws.body.id) as string;
    const headers = { Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': outsiderWs };
    // Outsider sessions cannot touch the E2E workspace through victim-scoped reads.
    await request(app).get('/api/v1/operator/next-actions?status=pending').set({
      Authorization: `Bearer ${outsiderToken}`, 'X-Workspace-ID': workspaceId,
    }).expect(403);
    await request(app).get('/api/v1/operator/next-actions?status=pending').set(headers).expect(200);
  });
});

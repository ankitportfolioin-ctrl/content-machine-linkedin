import { describe, it, expect, afterAll } from 'vitest';
import { cleanupTestData } from './test/helpers';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { runDailyLoop } from '../src/worker/dailyRun';

// WP9 Phase 3 — CLOSED AUTONOMOUS INTELLIGENCE LOOP.
//
// Evidence chain under test (all production services, no mocks):
//   research fixtures (source → document → claim → topic → trend → opportunity)
//   → decision queue (collect → enrich → eligibility → bounded scoring → rank)
//   → preparation (idea / sales research, human-gated)
//   → recorded outcomes (user-recorded, never invented)
//   → learning derivation (PROPOSED) → human confirm (CONFIRMED)
//   → next cycle consumes the learning (learning_boost, explainable)
//
// Synthetic rows below are TEST FIXTURES ONLY (explicitly marked): they stand
// in for external evidence that cannot be fetched deterministically in CI
// (SSRF rules block localhost; providers are unavailable). Production code
// paths (services, scoring, maturity, idempotency) are the real ones.

const stamp = Date.now();
const ownerEmail = `loop-owner-${stamp}@example.com`;
const password = 'testpassword123';

let ownerToken = '';
let loopWs = '';
let negWs = '';
let isoWs = '';
let emptyWs = '';

let topicId = '';
let srcId = '';
let docId = '';
let claimId = '';
let trendId = '';
let oppAId = '';
let oppBId = '';
let oppCId = '';
let leadId = '';

const LOOP_A = '2020-06-01';
const LOOP_B = '2020-06-02';
const LOOP_N = '2020-06-03';

async function registerAndLogin(email: string): Promise<string> {
  await request(app).post('/api/v1/auth/register').send({ email, password, name: 'Loop User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email, password }).expect(200);
  return login.body.token as string;
}

const auth = (ws: string) => ({ Authorization: `Bearer ${ownerToken}`, 'X-Workspace-ID': ws });

async function makeWorkspace(name: string): Promise<string> {
  const created = await request(app)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name })
    .expect(201);
  return (created.body.workspace?.id ?? created.body.id) as string;
}

async function makeLead(ws: string, tag: string): Promise<string> {
  const lead = await request(app)
    .post('/api/v1/leads')
    .set(auth(ws))
    .send({
      linkedinUrl: `https://linkedin.com/in/loop-${tag}-${stamp}`,
      name: `Loop Lead ${tag}`,
      headline: 'CTO at Fixture Corp',
      company: 'Fixture Corp',
      location: 'Remote',
    })
    .expect(201);
  return lead.body.lead.id as string;
}

// Two OBJECTION-classified conversations → one objection_pattern candidate.
// Mirrors the proven phase9 pattern (deterministic classifier input).
async function seedObjections(ws: string, lead: string): Promise<void> {
  for (const subject of ['Too pricey', 'Too pricey again']) {
    const conversation = await request(app)
      .post('/api/v1/conversations')
      .set(auth(ws))
      .send({ leadId: lead, subject: `${subject} ${stamp}` })
      .expect(201);
    const cid = conversation.body.conversation.id as string;
    await request(app)
      .post('/api/v1/messages')
      .set(auth(ws))
      .send({ conversationId: cid, body: 'This is too expensive for us right now, we have no budget.', direction: 'inbound' })
      .expect(201);
    const classification = await request(app)
      .post('/api/v1/sales-intelligence/classify')
      .set(auth(ws))
      .send({ conversationId: cid })
      .expect(201);
    expect(classification.body.classification.classification).toBe('OBJECTION');
  }
}

async function nextActions(ws: string) {
  const res = await request(app).get('/api/v1/operator/next-actions').set(auth(ws)).expect(200);
  return res.body.actions as Array<{
    id: string;
    kind: string;
    score: number;
    reasons: string[];
    evidenceLinks: Array<{ label: string; ref: string }>;
    subjectMeta: Record<string, unknown>;
    status: string;
  }>;
}

async function decisionCounts(ws: string, runId: string): Promise<Record<string, number>> {
  const row = await prisma.runStage.findFirst({ where: { workspaceId: ws, dailyRunId: runId, stage: 'DECISION' } });
  return (row?.counts ?? {}) as Record<string, number>;
}

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [loopWs, negWs, isoWs, emptyWs], userEmails: [ownerEmail] });
});

describe('WP9 Phase 3 — Closed Autonomous Intelligence Loop', () => {
  describe('Setup — workspaces and research fixtures', () => {
    it('registers owner and creates isolated workspaces', async () => {
      ownerToken = await registerAndLogin(ownerEmail);
      loopWs = await makeWorkspace(`Loop WS ${stamp}`);
      negWs = await makeWorkspace(`Loop NEG WS ${stamp}`);
      isoWs = await makeWorkspace(`Loop ISO WS ${stamp}`);
      emptyWs = await makeWorkspace(`Loop EMPTY WS ${stamp}`);
    });

    it('seeds a full research provenance chain (source → doc → claim → topic → trend → opportunities)', async () => {
      const topic = await prisma.topic.create({
        data: { workspaceId: loopWs, name: 'Loop Topic', canonicalName: `looptopic-${stamp}`, description: 'Closed-loop fixture topic' },
      });
      topicId = topic.id;

      const src = await prisma.intelligenceSource.create({
        data: {
          workspaceId: loopWs,
          url: `https://example.com/loop-${stamp}`,
          canonicalUrl: `https://example.com/loop-${stamp}`,
          sourceType: 'ARTICLE',
          title: 'Loop fixture article',
          contentHash: `loophash-${stamp}`,
          urlHash: `loopurlhash-${stamp}`,
          status: 'ACTIVE',
        },
      });
      srcId = src.id;

      const doc = await prisma.sourceDocument.create({
        data: {
          workspaceId: loopWs,
          sourceId: src.id,
          rawContent: 'Fixture teams waste hours on manual follow-up.',
          cleanContent: 'Fixture teams waste hours on manual follow-up.',
          contentType: 'TEXT',
          wordCount: 8,
          extractionMethod: 'TEXT',
          extractionStatus: 'SUCCESS',
          extractionWarnings: [],
        },
      });
      docId = doc.id;

      const claim = await prisma.sourceClaim.create({
        data: {
          workspaceId: loopWs,
          sourceId: src.id,
          documentId: doc.id,
          claimText: 'Manual follow-up costs fixture teams hours weekly.',
          claimType: 'OBSERVATION',
          evidenceText: 'Fixture article paragraph 2.',
          confidence: 0.8,
          status: 'SUPPORTED',
        },
      });
      claimId = claim.id;

      await prisma.topicMention.create({
        data: { workspaceId: loopWs, topicId: topic.id, sourceId: src.id, mentionStrength: 0.9, relevanceScore: 0.8 },
      });

      const trend = await prisma.trendSignal.create({
        data: {
          workspaceId: loopWs, topicId: topic.id, status: 'TRENDING',
          mentionCount: 5, sourceCount: 3,
          firstSeenAt: new Date(Date.now() - 5 * 86400000), lastSeenAt: new Date(),
          recencyScore: 0.9, sourceDiversityScore: 0.8, frequencyScore: 0.7,
          evidenceSummary: 'Fixture trend.',
        },
      });
      trendId = trend.id;

      const base = {
        workspaceId: loopWs, topicId: topic.id,
        thesis: 'Fixture teams save hours with checklist follow-ups.',
        problem: 'Manual follow-up sprawl.', audience: 'Founders',
        angle: 'Practical', objective: 'TEACH_PRACTICAL',
        status: 'NEW' as const,
        sourceIds: [src.id, src.id, src.id],
        claimIds: [claim.id, claim.id],
        trendSignalIds: [trend.id],
        reasoning: 'Seeded for closed-loop proof.',
        evidenceSummary: 'Seeded fixture evidence.',
      };
      const oppA = await prisma.contentOpportunity.create({
        data: { ...base, title: 'Loop opportunity A (strong)', opportunityScore: 80 },
      });
      oppAId = oppA.id;
      const oppB = await prisma.contentOpportunity.create({
        data: {
          ...base, title: 'Loop opportunity B (weak)', opportunityScore: 40,
          sourceIds: [], claimIds: [], trendSignalIds: [],
        },
      });
      oppBId = oppB.id;
      // Twin of A for the freshness check (backdated later).
      const oppC = await prisma.contentOpportunity.create({
        data: { ...base, title: 'Loop opportunity C (aging twin)', opportunityScore: 80 },
      });
      oppCId = oppC.id;
    });

    it('seeds leads and objection evidence in all three working workspaces', async () => {
      leadId = await makeLead(loopWs, 'main');
      await seedObjections(loopWs, leadId);
      const negLead = await makeLead(negWs, 'neg');
      await seedObjections(negWs, negLead);
      const isoLead = await makeLead(isoWs, 'iso');
      await seedObjections(isoWs, isoLead);
    }, 120000);
  });

  describe('A/B. Research → Opportunity → Decision', () => {
    let s1a = 0;
    let s1b = 0;

    it('ranks the strong-evidence opportunity above the weak one with evidence links', async () => {
      const actions = await nextActions(loopWs);
      const a = actions.find((x) => x.kind === 'content_opportunity' && x.evidenceLinks.some((l) => l.ref === `contentOpportunity:${oppAId}`));
      const b = actions.find((x) => x.kind === 'content_opportunity' && x.evidenceLinks.some((l) => l.ref === `contentOpportunity:${oppBId}`));
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      s1a = a!.score;
      s1b = b!.score;
      // A: 4 + 20 + 18 + 15 + 10 = 67. B: 4 + 10 + 4 + 15 + 10 = 43.
      expect(s1a).toBe(67);
      expect(s1b).toBe(43);
      expect(s1a).toBeGreaterThan(s1b);
      const refs = a!.evidenceLinks.map((l) => l.ref);
      expect(refs).toContain(`contentOpportunity:${oppAId}`);
    });

    it('exposes signal vs recommendation confidence distinctly', async () => {
      const actions = await nextActions(loopWs);
      const a = actions.find((x) => x.evidenceLinks.some((l) => l.ref === `contentOpportunity:${oppAId}`))!;
      const b = actions.find((x) => x.evidenceLinks.some((l) => l.ref === `contentOpportunity:${oppBId}`))!;
      const ea = await request(app).get(`/api/v1/operator/explanations/${a.id}`).set(auth(loopWs)).expect(200);
      const eb = await request(app).get(`/api/v1/operator/explanations/${b.id}`).set(auth(loopWs)).expect(200);
      // Strong fresh evidence, ready workflow → HIGH/HIGH.
      expect(ea.body.explanation.signalConfidence).toBe('HIGH');
      expect(ea.body.explanation.recommendationConfidence).toBe('HIGH');
      // Zero evidence → UNKNOWN signal, LOW recommendation. Distinct by design.
      expect(eb.body.explanation.signalConfidence).toBe('UNKNOWN');
      expect(eb.body.explanation.recommendationConfidence).toBe('LOW');
    });

    it('explains negative decisions with deterministic WHY_NOT', async () => {
      const actions = await nextActions(loopWs);
      const b = actions.find((x) => x.evidenceLinks.some((l) => l.ref === `contentOpportunity:${oppBId}`))!;
      const eb = await request(app).get(`/api/v1/operator/explanations/${b.id}`).set(auth(loopWs)).expect(200);
      const whyNot = eb.body.explanation.whyNot as string[];
      expect(Array.isArray(whyNot)).toBe(true);
      expect(whyNot).toContain('Limited audience or topic relevance');
      expect(whyNot).toContain('Few or weak evidence references');
      expect(whyNot).toContain('No workspace objectives configured — ranked on signal strength alone');
    });
  });

  describe('J. Provenance survives source → decision → idea', () => {
    it('links every provenance level with workspace-scoped foreign keys', async () => {
      const doc = await prisma.sourceDocument.findUnique({ where: { id: docId } });
      expect(doc?.sourceId).toBe(srcId);
      const claim = await prisma.sourceClaim.findUnique({ where: { id: claimId } });
      expect(claim?.sourceId).toBe(srcId);
      expect(claim?.documentId).toBe(docId);
      const opp = await prisma.contentOpportunity.findUnique({ where: { id: oppAId } });
      expect(opp?.topicId).toBe(topicId);
      expect(opp?.sourceIds).toContain(srcId);
      expect(opp?.claimIds).toContain(claimId);
      expect(opp?.trendSignalIds).toContain(trendId);
    });
  });

  describe('C/D. First cycle prepares content idea and sales research', () => {
    it('runs daily loop: idea created with provenance, opportunity stays NEW', async () => {
      const result = await runDailyLoop(loopWs, LOOP_A);
      expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);

      const ideas = await prisma.contentIdea.findMany({ where: { workspaceId: loopWs, opportunityId: oppAId } });
      expect(ideas).toHaveLength(1);
      expect(ideas[0]!.status).toBe('DRAFT');
      expect(ideas[0]!.topicId).toBe(topicId);
      expect(ideas[0]!.sourceIds).toContain(srcId);
      expect(ideas[0]!.claimIds).toContain(claimId);
      expect(ideas[0]!.evidenceSnapshot).toBeDefined();

      const opp = await prisma.contentOpportunity.findUnique({ where: { id: oppAId } });
      expect(opp?.status).toBe('NEW');

      // No confirmed learning exists yet → nothing boosted.
      const counts = await decisionCounts(loopWs, result.runId);
      expect(counts.learningBoostedActions ?? 0).toBe(0);
    }, 120000);

    it('researches and qualifies the lead without inventing profile facts', async () => {
      const research = await prisma.prospectResearch.findFirst({ where: { workspaceId: loopWs, leadId } });
      expect(research).toBeDefined();
      const facts = (research?.facts ?? []) as Array<{ confidence: number | null }>;
      for (const f of facts) expect(f.confidence).toBeNull();
      const qual = await prisma.qualificationResult.findFirst({ where: { workspaceId: loopWs, leadId } });
      expect(qual).toBeDefined();
      expect(['UNQUALIFIED', 'POSSIBLE_FIT', 'QUALIFIED', 'INSUFFICIENT_DATA']).toContain(qual!.status);
    });
  });

  describe('N. Freshness suppresses aging signals with a stated reason', () => {
    it('ranks an aging twin below its fresh identical twin', async () => {
      const before = await prisma.contentOpportunity.findUnique({ where: { id: oppCId } });
      const originalCreatedAt = before!.createdAt;
      await prisma.contentOpportunity.update({
        where: { id: oppCId },
        data: { createdAt: new Date(Date.now() - 45 * 86400000) },
      });

      await runDailyLoop(loopWs, LOOP_N);
      const rows = await prisma.operatorAction.findMany({
        where: { workspaceId: loopWs, status: 'PENDING', kind: 'content_opportunity' },
      });
      const scoreA = rows.find((r) => (r.subjectMeta as { opportunityId?: string })?.opportunityId === oppAId)?.score;
      const scoreC = rows.find((r) => (r.subjectMeta as { opportunityId?: string })?.opportunityId === oppCId)?.score;
      expect(scoreA).toBeDefined();
      expect(scoreC).toBeDefined();
      expect(scoreC!).toBeLessThan(scoreA!);

      await prisma.contentOpportunity.update({ where: { id: oppCId }, data: { createdAt: originalCreatedAt } });
    }, 120000);
  });

  describe('GOLDEN. Outcome → learning → next-cycle influence', () => {
    let proposalId = '';
    let expectedBoost = 0;
    let s1golden = 0;

    it('records real fixture outcomes and derives a PROPOSED learning (never auto-confirmed)', async () => {
      // Baseline BEFORE any confirmation: PROPOSED learning must not move scores.
      const baseline = await nextActions(loopWs);
      s1golden = baseline.find((x) => x.evidenceLinks.some((l) => l.ref === `contentOpportunity:${oppAId}`))!.score;
      // Outcomes require a real subject reference (subject-less "metrics" are
      // rejected with 422 by design). The pipeline opportunity is the honest
      // fixture subject for these response counts.
      const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
      const pipeOpp = await prisma.pipelineOpportunity.create({
        data: { workspaceId: loopWs, leadId, ownerId: owner!.id, name: `Loop deal ${stamp}` },
      });
      const values: Array<[number, string]> = [[10, 'seg-a'], [11, 'seg-a'], [12, 'seg-a'], [1, 'seg-b'], [1, 'seg-b'], [2, 'seg-b']];
      for (const [i, [value, unit]] of values.entries()) {
        await request(app)
          .post('/api/v1/outcomes')
          .set(auth(loopWs))
          .send({ pipelineOpportunityId: pipeOpp.id, metricName: 'responses', metricValue: value, unit, source: 'closed-loop fixture record', idempotencyKey: `loop-metric-${stamp}-${i}` })
          .expect(201);
      }
      const derived = await request(app)
        .post('/api/v1/learning/derived')
        .set(auth(loopWs))
        .send({ metricName: 'responses' })
        .expect(201);
      const proposal = derived.body.proposal;
      expect(proposal.status).toBe('PROPOSED');
      expect(proposal.dimension).toBe('evidence_strength');
      expect(proposal.maturity).not.toBe('CONFIRMED');
      proposalId = proposal.id as string;
      expectedBoost = Math.min(10, Math.round((proposal.proposedAdjustment as number) * 50));
      expect(expectedBoost).toBeGreaterThan(0);
    });

    it('human OWNER confirmation is the only path to CONFIRMED', async () => {
      const confirmed = await request(app)
        .post(`/api/v1/learning/derived/${proposalId}/confirm`)
        .set(auth(loopWs))
        .send({})
        .expect(200);
      expect(confirmed.body.proposal.status).toBe('CONFIRMED');
    });

    it('second cycle consumes the learning: score rises by exactly the bounded boost, no duplicates', async () => {
      const ideasBefore = await prisma.contentIdea.count({ where: { workspaceId: loopWs, opportunityId: oppAId } });

      const result = await runDailyLoop(loopWs, LOOP_B);
      expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);

      const counts = await decisionCounts(loopWs, result.runId);
      expect(counts.learningBoostedActions ?? 0).toBeGreaterThanOrEqual(1);

      const after = await nextActions(loopWs);
      const s2 = after.find((x) => x.evidenceLinks.some((l) => l.ref === `contentOpportunity:${oppAId}`))!.score;
      expect(s2 - s1golden).toBe(expectedBoost);

      const rows = await prisma.operatorAction.findMany({
        where: { workspaceId: loopWs, kind: 'content_opportunity', status: 'PENDING' },
      });
      const row = rows.find((r) => (r.subjectMeta as { opportunityId?: string })?.opportunityId === oppAId);
      expect(row).toBeDefined();
      expect(JSON.stringify(row?.reasons ?? [])).toContain('Workspace-confirmed learning');

      const explained = await request(app).get(`/api/v1/operator/explanations/${row!.id}`).set(auth(loopWs)).expect(200);
      const applied = explained.body.explanation.learningApplied as Array<{ proposalId: string }>;
      expect(applied.map((x) => x.proposalId)).toContain(proposalId);

      // Cross-cycle idempotency: the same opportunity is not prepared twice.
      const ideasAfter = await prisma.contentIdea.count({ where: { workspaceId: loopWs, opportunityId: oppAId } });
      expect(ideasAfter).toBe(ideasBefore);
      const opp = await prisma.contentOpportunity.findUnique({ where: { id: oppAId } });
      expect(opp?.status).toBe('NEW');
    }, 120000);

    it('re-running the same cycle date returns the identical run (no duplicate work)', async () => {
      const researchBefore = await prisma.prospectResearch.count({ where: { workspaceId: loopWs } });
      const first = await runDailyLoop(loopWs, LOOP_B);
      const second = await runDailyLoop(loopWs, LOOP_B);
      expect(second.runId).toBe(first.runId);
      expect(second.resumed).toBe(false);
      expect(await prisma.prospectResearch.count({ where: { workspaceId: loopWs } })).toBe(researchBefore);
    });

    it('no unauthorized external action exists after two full cycles', async () => {
      expect(await prisma.publishRecord.count({ where: { workspaceId: loopWs } })).toBe(0);
      const prepared = await prisma.preparedAction.findMany({ where: { workspaceId: loopWs }, select: { status: true } });
      for (const p of prepared) {
        expect(['READY_FOR_AUTHORIZED_EXECUTION', 'REQUIRES_APPROVAL', 'BLOCKED', 'EXPIRED']).toContain(p.status);
      }
    });
  });

  describe('F. Weak (PROPOSED-only) learning does NOT influence decisions', () => {
    it('scores identically before and after an unconfirmed proposal', async () => {
      const isoLead = await makeLead(negWs, 'neg2');
      await seedObjections(negWs, isoLead);
      await runDailyLoop(negWs, LOOP_A);
      const s0 = (await nextActions(negWs)).find((x) => x.kind === 'objection_pattern')!.score;

      await request(app)
        .post('/api/v1/learning/derived')
        .set(auth(negWs))
        .send({
          dimension: 'evidence_strength',
          observedPattern: 'Negative-control fixture: unconfirmed pattern, must not influence ranking.',
          supportingMeasurements: {},
          sourceMetricIds: [],
          sampleSize: 2,
          proposedAdjustment: 0.08,
          reason: 'Negative control for closed-loop proof.',
        })
        .expect(201);

      await runDailyLoop(negWs, LOOP_B);
      const after = await nextActions(negWs);
      const s1 = after.find((x) => x.kind === 'objection_pattern')!.score;
      expect(s1).toBe(s0);
      expect(JSON.stringify(after.find((x) => x.kind === 'objection_pattern')!.reasons)).not.toContain('Workspace-confirmed learning');
    }, 120000);
  });

  describe('K. Learning is workspace-scoped (no cross-contamination)', () => {
    it('confirmation in one workspace never boosts another', async () => {
      await runDailyLoop(isoWs, LOOP_A);
      const s0 = (await nextActions(isoWs)).find((x) => x.kind === 'objection_pattern')!.score;
      // loopWs confirmation happened in GOLDEN above; isoWs must be unaffected.
      await runDailyLoop(isoWs, LOOP_B);
      const s1 = (await nextActions(isoWs)).find((x) => x.kind === 'objection_pattern')!.score;
      expect(s1).toBe(s0);
    }, 120000);
  });

  describe('I. Comment → sales signal → decision context', () => {
    it('turns a human-reviewed LEAD_SIGNAL comment into a queue candidate, not a lead', async () => {
      const created = await request(app)
        .post('/api/v1/comments')
        .set(auth(loopWs))
        .send({ text: 'What is the pricing? I want a demo call next week.', authorName: 'Prospect Pam' })
        .expect(201);
      // Ingest returns the full chain: comment + classification + salesSignalId.
      const commentId = created.body.comment.id as string;
      expect(created.body.classification.type).toBe('LEAD_SIGNAL');
      expect(typeof created.body.salesSignalId).toBe('string');
      expect(typeof created.body.audienceSignalId).toBe('string');
      const signalId = created.body.salesSignalId as string;

      const listed = await request(app).get('/api/v1/comments/sales-signals').set(auth(loopWs)).expect(200);
      const signals = listed.body.signals as Array<{ id: string; commentId: string }>;
      expect(signals.map((s) => s.id)).toContain(signalId);
      await request(app)
        .post(`/api/v1/comments/sales-signals/${signalId}/review`)
        .set(auth(loopWs))
        .send({ decision: 'REVIEWED' })
        .expect(200);

      const actions = await nextActions(loopWs);
      const signal = actions.find((x) => x.kind === 'comment_signal');
      expect(signal).toBeDefined();
      expect(signal!.evidenceLinks.map((l) => l.ref)).toContain(`comment:${commentId}`);
      expect(await prisma.lead.count({ where: { workspaceId: loopWs, name: 'Prospect Pam' } })).toBe(0);
    });
  });

  describe('H. No observation → no fabricated learning', () => {
    it('empty workspace derives zero proposals with honest counts', async () => {
      const result = await runDailyLoop(emptyWs, LOOP_A);
      expect(['COMPLETED', 'COMPLETED_WITH_FAILURES']).toContain(result.status);
      const observe = await prisma.runStage.findFirst({
        where: { workspaceId: emptyWs, dailyRunId: result.runId, stage: 'OBSERVE_LEARN' },
      });
      const counts = (observe?.counts ?? {}) as Record<string, number>;
      expect(counts.proposalsCreated ?? 0).toBe(0);
      expect(await prisma.learningProposal.count({ where: { workspaceId: emptyWs } })).toBe(0);
    });
  });
});

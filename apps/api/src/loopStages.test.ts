import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index';
import { prisma } from '@growth-operator/db';
import { cleanupTestData } from './test/helpers';
import { runDailyLoop } from './worker/dailyRun';

const stamp = Date.now();
const ownerEmail = `stages-owner-${stamp}@example.com`;
const password = 'testpassword123';

let ownerId = '';
let ownerToken = '';
let workspaceId = '';

async function setupOnce(): Promise<void> {
  await request(app).post('/api/v1/auth/register').send({ email: ownerEmail, password, name: 'Stages User' }).expect(201);
  const login = await request(app).post('/api/v1/auth/login').send({ email: ownerEmail, password }).expect(200);
  ownerToken = login.body.token as string;
  const created = await request(app)
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${ownerToken}`)
    .send({ name: `Stages WS ${stamp}` })
    .expect(201);
  workspaceId = (created.body.workspace?.id ?? created.body.id) as string;
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  ownerId = owner!.id;
}

describe('Step E: wired stages A-H', () => {
  it('INTELLIGENCE with no feeds succeeds with honest zero counts', async () => {
    await setupOnce();
    const result = await runDailyLoop(workspaceId, '2026-09-20');
    expect(result.status).toBe('COMPLETED');
    const intel = result.stages.find((s) => s.stage === 'INTELLIGENCE');
    expect(intel?.status).toBe('SUCCEEDED');
    const row = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRun: { runDate: new Date('2026-09-20T00:00:00.000Z') }, stage: 'INTELLIGENCE' },
    });
    expect((row?.counts as Record<string, number>).activeFeedSources).toBe(0);
  });

  it('INTELLIGENCE isolates fetch failures without failing the stage', async () => {
    await prisma.feedSource.create({
      data: { workspaceId, url: 'not-a-url', type: 'SITE', name: 'Bad feed' },
    });
    // A second failing feed: both fail the same way, so their failure rows
    // must not collide on (workspaceId, contentHash) — regression test for
    // the Step H demo run, where identical DNS errors crashed the second
    // failed-source insert instead of returning FAILED.
    await prisma.feedSource.create({
      data: { workspaceId, url: 'also-not-a-url', type: 'SITE', name: 'Bad feed 2' },
    });
    const result = await runDailyLoop(workspaceId, '2026-09-21');
    expect(result.status).toBe('COMPLETED');
    const row = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRun: { runDate: new Date('2026-09-21T00:00:00.000Z') }, stage: 'INTELLIGENCE' },
    });
    const counts = row?.counts as Record<string, number>;
    expect(counts.sourcesAttempted).toBe(2);
    expect(counts.failed).toBe(2);
    expect(counts.fetched).toBe(0);
    for (const url of ['not-a-url', 'also-not-a-url']) {
      const feed = await prisma.feedSource.findFirst({ where: { workspaceId, url } });
      expect(feed?.lastError).toBeTruthy();
      expect(feed?.lastFetchedAt).not.toBeNull();
    }
  });

  it('CONTENT turns opportunities into ideas with provenance, never auto-approves', async () => {
    const topic = await prisma.topic.create({
      data: { workspaceId, name: `Loop topic ${stamp}`, canonicalName: `loop-topic-${stamp}` },
    });
    await prisma.contentOpportunity.create({
      data: {
        workspaceId,
        topicId: topic.id,
        title: `Loop opportunity ${stamp}`,
        thesis: 'Loop thesis.',
        problem: 'Loop problem.',
        audience: 'Loop audience.',
        angle: 'Practical.',
        objective: 'TEACH_PRACTICAL',
        opportunityScore: 8.5,
        status: 'NEW',
        sourceIds: [],
        claimIds: [],
        trendSignalIds: [],
        reasoning: 'Seeded.',
        evidenceSummary: 'Seeded.',
      },
    });
    const result = await runDailyLoop(workspaceId, '2026-09-22');
    expect(result.status).toBe('COMPLETED');
    const row = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRun: { runDate: new Date('2026-09-22T00:00:00.000Z') }, stage: 'CONTENT' },
    });
    const counts = row?.counts as Record<string, number>;
    // AI is unavailable in test env (keys cleared in setup): ideas are created, plans/drafts deferred
    expect(counts.ideasCreated).toBe(1);
    expect(counts.plansCreated).toBe(0);
    expect(counts.draftsComposed).toBe(0);

    const idea = await prisma.contentIdea.findFirst({
      where: { workspaceId, title: `Loop opportunity ${stamp}` },
    });
    expect(idea?.thesis).toBe('Loop thesis.');
    expect(idea?.opportunityId).toBeTruthy();
    expect((idea?.evidenceSnapshot as { evidenceSummary?: string } | null)?.evidenceSummary).toBe('Seeded.');

    // Opportunity stays NEW for human triage; idea guards re-runs.
    const opp = await prisma.contentOpportunity.findFirst({
      where: { workspaceId, title: `Loop opportunity ${stamp}` },
    });
    expect(opp?.status).toBe('NEW');
  });

  it.skip('CONTENT never composes drafts without human-approved plans', async () => {
    const idea = await prisma.contentIdea.findFirst({
      where: { workspaceId, title: `Loop opportunity ${stamp}` },
    });
    await prisma.contentPlan.create({
      data: {
        workspaceId,
        contentIdeaId: idea!.id,
        thesis: 'Loop thesis.',
        audience: 'Loop audience.',
        objective: 'TEACH_PRACTICAL',
        angle: 'PRACTICAL',
        format: 'TEXT_POST',
        narrativeStructure: 'PROBLEM_WHY_SOLUTION',
        keyPoints: ['one'],
        evidenceMap: [],
        mustNotClaim: [],
        status: 'APPROVED',
        createdBy: ownerId,
      },
    });
    const result = await runDailyLoop(workspaceId, '2026-09-23');
    const row = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRun: { runDate: new Date('2026-09-23T00:00:00.000Z') }, stage: 'CONTENT' },
    });
    const counts = row?.counts as Record<string, number>;
    // AI provider IS available in test env: an APPROVED plan gets a draft composed.
    expect(counts.draftsComposed).toBe(1);
    const drafts = await prisma.contentDraft.count({ where: { workspaceId } });
    expect(drafts).toBe(1);
    expect(result.status).toBe('COMPLETED');
  });

  it('SALES researches, qualifies and briefs NEW leads deterministically', async () => {
    const lead = await prisma.lead.create({
      data: {
        workspaceId,
        linkedinUrl: `https://linkedin.com/in/loop-lead-${stamp}`,
        name: 'Loop Lead',
        headline: 'CTO at Loop Inc',
        company: 'Loop Inc',
      },
    });
    const result = await runDailyLoop(workspaceId, '2026-09-24');
    expect(result.status).toBe('COMPLETED');
    const research = await prisma.prospectResearch.findFirst({ where: { workspaceId, leadId: lead.id } });
    expect(research).not.toBeNull();
    expect(research?.confidence).toBeNull();
    const qualification = await prisma.qualificationResult.findUnique({
      where: { workspaceId_leadId: { workspaceId, leadId: lead.id } },
    });
    expect(qualification).not.toBeNull();
    const brief = await prisma.prospectBrief.findFirst({ where: { workspaceId, leadId: lead.id } });
    expect(brief).not.toBeNull();
    expect(Array.isArray(brief?.unknowns) && (brief?.unknowns as unknown[]).length > 0).toBe(true);
    const row = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRun: { runDate: new Date('2026-09-24T00:00:00.000Z') }, stage: 'SALES' },
    });
    const counts = row?.counts as Record<string, number>;
    expect(counts.researched).toBe(1);
    expect(counts.qualified).toBe(1);
    expect(counts.briefsCreated).toBe(1);
    expect(counts.draftsComposed).toBe(0);
  });

  it('OBSERVE_LEARN derives at most one open proposal per dimension', async () => {
    const mkVersion = async (format: 'CAROUSEL' | 'TEXT_POST', values: number[]) => {
      const idea = await prisma.contentIdea.create({
        data: { workspaceId, authorId: ownerId, title: `Outcome idea ${format} ${stamp}`, status: 'DRAFT', tags: [] },
      });
      const plan = await prisma.contentPlan.create({
        data: {
          workspaceId,
          contentIdeaId: idea.id,
          thesis: 'T.',
          audience: 'A.',
          objective: 'TEACH_PRACTICAL',
          angle: 'PRACTICAL',
          format,
          narrativeStructure: 'PROBLEM_WHY_SOLUTION',
          keyPoints: ['one'],
          evidenceMap: [],
          mustNotClaim: [],
          status: 'DRAFT',
          createdBy: ownerId,
        },
      });
      const draft = await prisma.contentDraft.create({
        data: { workspaceId, contentIdeaId: idea.id, planId: plan.id, authorId: ownerId, body: 'Body with enough length to be valid content here.', version: 1 },
      });
      const version = await prisma.contentVersion.create({
        data: { workspaceId, contentDraftId: draft.id, authorId: ownerId, body: 'Body with enough length to be valid content here.', version: 1 },
      });
      for (const v of values) {
        await prisma.outcomeMetric.create({
          data: {
            workspaceId,
            contentVersionId: version.id,
            metricName: 'saves',
            metricValue: v,
            source: 'loop-stages-test',
            recordedBy: ownerId,
          },
        });
      }
    };
    await mkVersion('CAROUSEL', [20, 22, 24]);
    await mkVersion('TEXT_POST', [2, 3, 4]);

    const first = await runDailyLoop(workspaceId, '2026-09-25');
    expect(first.status).toBe('COMPLETED');
    const created = await prisma.learningProposal.count({
      where: { workspaceId, status: 'PROPOSED' },
    });
    expect(created).toBeGreaterThanOrEqual(1);

    // Second run on a new date must not pile onto the open backlog.
    await runDailyLoop(workspaceId, '2026-09-26');
    const after = await prisma.learningProposal.count({
      where: { workspaceId, status: 'PROPOSED' },
    });
    expect(after).toBe(created);
  });

  it('DIGEST writes one idempotent DAILY report per run date', async () => {
    const reports = await prisma.intelligenceReport.findMany({
      where: { workspaceId, frequency: 'DAILY' },
    });
    expect(reports.length).toBeGreaterThanOrEqual(5);
    const dates = new Set(reports.map((r) => r.periodStart.toISOString()));
    expect(dates.size).toBe(reports.length);
  });

  it('fetch budget at zero defers honestly without failing', async () => {
    await prisma.workspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, dailyFetchCap: 0 },
      update: { dailyFetchCap: 0 },
    });
    const result = await runDailyLoop(workspaceId, '2026-09-19');
    const row = await prisma.runStage.findFirst({
      where: { workspaceId, dailyRun: { runDate: new Date('2026-09-19T00:00:00.000Z') }, stage: 'INTELLIGENCE' },
    });
    expect(result.status).toBe('COMPLETED');
    expect((row?.counts as Record<string, number>).sourcesAttempted).toBe(0);
    expect(row?.error ?? '').toMatch(/budget/i);
    await prisma.workspaceSettings.update({
      where: { workspaceId },
      data: { dailyFetchCap: 100 },
    });
  });
});

afterAll(async () => {
  await cleanupTestData({ workspaceIds: [workspaceId], userEmails: [ownerEmail] });
});

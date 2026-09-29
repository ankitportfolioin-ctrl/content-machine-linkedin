import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OperatorActionService } from '../actions';
import { buildRelevanceIdea, extractResultKeys, RELEVANCE_TAG } from '../initiation';
import { prospectRelevance } from '../signals';
import { DecisionError } from '../errors';

const CREATED = new Date('2026-09-18T00:00:00Z');

const ICP = {
  id: 'icp-1', name: 'Sales leaders', description: 'Sales leaders at software companies.',
  targetRoles: ['VP Sales'], industries: ['SaaS'], companySize: null, problems: null, exclusions: null,
};

function goodTopic(id: string) {
  return {
    id, name: `SaaS sales playbook ${id}`, description: 'SaaS sales leadership for enterprise company teams',
    aliases: ['saas sales'], mentions: [{ context: 'saas sales leadership pipeline' }], updatedAt: CREATED,
  };
}

const LEAD = {
  id: 'lead-1', name: 'Dana', headline: 'VP Sales at SaaS company', company: 'SaaS company',
  location: 'Berlin', updatedAt: CREATED,
};

const PREFILL_INPUT = {
  topicId: 'topic-1',
  topicName: 'SaaS sales playbook topic-1',
  leadId: 'lead-1',
  leadName: 'Dana',
  relevance: 0.82,
  dimensions: [
    { name: 'topic_problem_overlap', score: 1, reason: 'Shared terms between topic evidence and the prospect record: saas, sales.' },
    { name: 'icp_fit', score: 0.9, reason: 'VP Sales at SaaS company matches ICP.' },
  ],
  icp: { id: 'icp-1', name: 'Sales leaders' },
  identityKey: 'prospect_relevance:topic-1:lead-1',
};

function mockPrisma(overrides: Record<string, unknown> = {}) {
  const topics = [goodTopic('topic-1')];
  const leads = [LEAD];
  const byId = new Map([...topics, ...leads].map((r) => [r.id, r]));
  return {
    conversationClassificationResult: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _max: { createdAt: CREATED } }),
    },
    iCP: { findFirst: vi.fn().mockResolvedValue(ICP) },
    topic: {
      findMany: vi.fn().mockResolvedValue(topics),
      findFirst: vi.fn().mockImplementation(async (args: { where: { id: string } }) => byId.get(args.where.id) ?? null),
    },
    lead: {
      findMany: vi.fn().mockResolvedValue(leads),
      findFirst: vi.fn().mockImplementation(async (args: { where: { id: string } }) => byId.get(args.where.id) ?? null),
    },
    prospectResearch: { findMany: vi.fn().mockResolvedValue([]) },
    salesContentSignal: { findMany: vi.fn().mockResolvedValue([]) },
    commentSalesSignal: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    opportunityFeedback: { findMany: vi.fn().mockResolvedValue([]) },
    contentOpportunity: { findMany: vi.fn().mockResolvedValue([]) },
    contentGap: { findMany: vi.fn().mockResolvedValue([]) },
    trendSignal: { findMany: vi.fn().mockResolvedValue([]) },
    contentReview: { findMany: vi.fn().mockResolvedValue([]) },
    outreachReview: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    outreachStrategy: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    followUpRecommendation: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    preparedAction: { findMany: vi.fn().mockResolvedValue([]) },
    learningProposal: { findMany: vi.fn().mockResolvedValue([]) },
    contentDraft: { findMany: vi.fn().mockResolvedValue([]) },
    contentIdea: {
      create: vi.fn().mockImplementation(async ({ data }: never) => ({ id: 'idea-1', ...(data as object) })),
      findFirst: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({ id: 'idea-1' }),
    },
    operatorAction: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      update: vi.fn().mockImplementation(async ({ data }: never) => ({ id: 'action-1', ...(data as object) })),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function pendingRelevanceAction(meta: Record<string, unknown> = {}, identityKey = 'prospect_relevance:topic-1:lead-1') {
  return {
    id: 'action-1', workspaceId: 'ws-1', identityKey,
    kind: 'prospect_relevance', status: 'PENDING', subjectMeta: meta,
  };
}

async function liveRelevanceCandidate(prisma: PrismaClient) {
  const all = await prospectRelevance(prisma, 'ws-1', Date.now());
  expect(all.length).toBeGreaterThan(0);
  return all[0]!;
}

describe('Relevance idea prefill', () => {
  it('builds a deterministic title and provenance from recorded evidence only', () => {
    const prefill = buildRelevanceIdea(PREFILL_INPUT);
    expect(prefill.title).toContain('SaaS sales playbook topic-1');
    expect(prefill.title).toContain('Dana');
    expect(prefill.title.length).toBeLessThanOrEqual(200);
    expect(prefill.description).toContain('topic-1');
    expect(prefill.description).toContain('lead-1');
    expect(prefill.description).toContain('Dana');
    expect(prefill.description).toContain('0.82');
    expect(prefill.description).toContain('topic_problem_overlap');
    expect(prefill.description).toContain('icp-1');
    expect(prefill.description).toContain('prospect_relevance:topic-1:lead-1');
    expect(prefill.description).toContain('planning, review, and approval still required');
    expect(prefill.tags).toEqual([RELEVANCE_TAG]);
  });

  it('truncates long names to the 200-character idea limit', () => {
    const prefill = buildRelevanceIdea({
      ...PREFILL_INPUT,
      topicName: 't'.repeat(300),
      leadName: 'l'.repeat(300),
    });
    expect(prefill.title.length).toBeLessThanOrEqual(200);
    expect(prefill.title.length).toBeGreaterThan(0);
  });

  it('invents no pain points, intent, engagement, or statistics', () => {
    const prefill = buildRelevanceIdea(PREFILL_INPUT);
    const blob = `${prefill.title}\n${prefill.description}`.toLowerCase();
    expect(blob).not.toMatch(/buying intent|purchase intent|engagement|social proof|pain point/i);
    expect(blob).not.toMatch(/guarantee|convert|perform/i);
  });

  it('is deterministic', () => {
    expect(buildRelevanceIdea(PREFILL_INPUT)).toEqual(buildRelevanceIdea(PREFILL_INPUT));
  });
});

describe('initiateIdea for prospect_relevance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates one draft idea and links it, preserving unrelated subjectMeta keys', async () => {
    const prisma = mockPrisma();
    const live = await liveRelevanceCandidate(prisma);
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingRelevanceAction({ topicId: 'topic-1', customNote: 'keep-me' }, live.identityKey)
    );
    const service = new OperatorActionService(prisma);
    const result = await service.initiateIdea('ws-1', 'action-1', 'user-1');

    const create = prisma.contentIdea.create as ReturnType<typeof vi.fn>;
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].data).toMatchObject({
      workspaceId: 'ws-1',
      authorId: 'user-1',
      tags: [RELEVANCE_TAG],
    });
    expect(create.mock.calls[0]![0].data.title.length).toBeLessThanOrEqual(200);
    expect(create.mock.calls[0]![0].data).not.toHaveProperty('status');
    expect(String(create.mock.calls[0]![0].data.description)).toContain('topic-1');
    expect(String(create.mock.calls[0]![0].data.description)).toContain(live.identityKey);

    const update = prisma.operatorAction.update as ReturnType<typeof vi.fn>;
    expect(update).toHaveBeenCalledTimes(1);
    const meta = update.mock.calls[0]![0].data.subjectMeta as Record<string, unknown>;
    expect(meta['resultIdeaId']).toBe('idea-1');
    expect(typeof meta['resultIdeaTitle']).toBe('string');
    expect(typeof meta['initiatedAt']).toBe('string');
    expect(meta['customNote']).toBe('keep-me');
    expect(meta['topicId']).toBe('topic-1');
    expect(result.idea.id).toBe('idea-1');
  });

  it('still rejects unrelated kinds without creating anything', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pendingRelevanceAction(), kind: 'content_opportunity',
    });
    const service = new OperatorActionService(prisma);
    await expect(service.initiateIdea('ws-1', 'action-1', 'user-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
  });

  it('rejects non-pending relevance actions without creating anything', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pendingRelevanceAction(), status: 'COMPLETED',
    });
    const service = new OperatorActionService(prisma);
    await expect(service.initiateIdea('ws-1', 'action-1', 'user-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
  });

  it('returns the existing idea on duplicate initiation', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingRelevanceAction({ resultIdeaId: 'idea-9', resultIdeaTitle: 'Old', initiatedAt: 'd' })
    );
    (prisma.contentIdea.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'idea-9', title: 'Old' });
    const service = new OperatorActionService(prisma);
    const err = await service.initiateIdea('ws-1', 'action-1', 'user-1').catch((e: unknown) => e);
    expect((err as DecisionError).code).toBe('CONFLICT');
    expect((err as DecisionError).details).toMatchObject({ ideaId: 'idea-9' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
  });

  it('creates nothing when the relevance goes stale', async () => {
    const prisma = mockPrisma({
      topic: {
        findMany: vi.fn().mockResolvedValue([goodTopic('topic-1')]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pendingRelevanceAction());
    const service = new OperatorActionService(prisma);
    await expect(service.initiateIdea('ws-1', 'action-1', 'user-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
  });

  it('extractResultKeys still merges only linkage keys', () => {
    expect(extractResultKeys({ resultIdeaId: 'i', resultIdeaTitle: 't', initiatedAt: 'd', topicId: 'x' }))
      .toEqual({ resultIdeaId: 'i', resultIdeaTitle: 't', initiatedAt: 'd' });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SalesError } from '@growth-operator/sales';
import { OperatorActionService } from '../actions';
import { buildRelevanceResearch, extractSalesResultKeys } from '../initiation';
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
    prospectResearch: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation(async ({ data }: never) => ({ id: 'research-1', ...(data as object) })),
      delete: vi.fn().mockResolvedValue({ id: 'research-1' }),
    },
    salesContentSignal: { findMany: vi.fn().mockResolvedValue([]) },
    contentOpportunity: { findMany: vi.fn().mockResolvedValue([]) },
    contentGap: { findMany: vi.fn().mockResolvedValue([]) },
    trendSignal: { findMany: vi.fn().mockResolvedValue([]) },
    contentReview: { findMany: vi.fn().mockResolvedValue([]) },
    outreachReview: { findMany: vi.fn().mockResolvedValue([]) },
    followUpRecommendation: { findMany: vi.fn().mockResolvedValue([]) },
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

describe('Relevance research builder', () => {
  it('builds facts from recorded evidence only, with action provenance', () => {
    const built = buildRelevanceResearch(PREFILL_INPUT);
    expect(built.facts.length).toBeGreaterThanOrEqual(3);
    const blob = built.facts.map((f) => f.statement).join('\n');
    expect(blob).toContain('topic-1');
    expect(blob).toContain('lead-1');
    expect(blob).toContain('Dana');
    expect(blob).toContain('0.82');
    expect(blob).toContain('topic_problem_overlap');
    expect(blob).toContain('icp-1');
    expect(blob).toContain('prospect_relevance:topic-1:lead-1');
    for (const fact of built.facts) {
      expect(fact.sourceRef).toBe('operatorAction:prospect_relevance:topic-1:lead-1');
      expect(fact.statement.length).toBeGreaterThan(0);
      // No legitimate per-statement confidence exists in the recorded evidence.
      expect(fact.confidence).toBeNull();
    }
    expect(built.resultTitle).toContain('SaaS sales playbook topic-1');
    expect(built.resultTitle.length).toBeLessThanOrEqual(200);
  });

  it('caps dimensions and never invents confidence or facts', () => {
    const built = buildRelevanceResearch({
      ...PREFILL_INPUT,
      relevance: 2,
      dimensions: Array.from({ length: 20 }, (_, i) => ({ name: `dim-${i}`, score: i, reason: `reason ${i}` })),
      icp: null,
    });
    expect(built.facts.length).toBeLessThanOrEqual(9);
    for (const fact of built.facts) expect(fact.confidence).toBeNull();
    const blob = `${built.facts.map((f) => f.statement).join('\n')}\n${built.resultTitle}`.toLowerCase();
    expect(blob).not.toMatch(/buying intent|purchase intent|engagement|social proof|pain point/i);
    expect(blob).not.toMatch(/guarantee|convert|perform/i);
  });

  it('is deterministic', () => {
    expect(buildRelevanceResearch(PREFILL_INPUT)).toEqual(buildRelevanceResearch(PREFILL_INPUT));
  });
});

describe('Sales linkage keys', () => {
  it('merges only sales linkage keys, never idea keys', () => {
    expect(extractSalesResultKeys({ resultResearchId: 'r', resultResearchTitle: 't', initiatedResearchAt: 'd', topicId: 'x', resultIdeaId: 'i' }))
      .toEqual({ resultResearchId: 'r', resultResearchTitle: 't', initiatedResearchAt: 'd' });
    expect(extractSalesResultKeys(null)).toEqual({});
    expect(extractSalesResultKeys({ resultResearchId: 42 })).toEqual({});
  });
});

describe('initiateSalesResearch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records one research row and links it, preserving unrelated subjectMeta keys', async () => {
    const prisma = mockPrisma();
    const live = await liveRelevanceCandidate(prisma);
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingRelevanceAction({ topicId: 'topic-1', customNote: 'keep-me' }, live.identityKey)
    );
    const service = new OperatorActionService(prisma);
    const result = await service.initiateSalesResearch('ws-1', 'action-1');

    const create = prisma.prospectResearch.create as ReturnType<typeof vi.fn>;
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).toMatchObject({ workspaceId: 'ws-1', leadId: 'lead-1' });
    expect(data['name'] ?? null).toBeNull();
    expect(data['title'] ?? null).toBeNull();
    expect(data['company'] ?? null).toBeNull();
    const facts = data['facts'] as Array<{ statement: string; sourceRef: string }>;
    expect(facts.length).toBeGreaterThanOrEqual(3);
    expect(facts.map((f) => f.statement).join('\n')).toContain(live.identityKey);

    const update = prisma.operatorAction.update as ReturnType<typeof vi.fn>;
    expect(update).toHaveBeenCalledTimes(1);
    const meta = update.mock.calls[0]![0].data.subjectMeta as Record<string, unknown>;
    expect(meta['resultResearchId']).toBe('research-1');
    expect(typeof meta['resultResearchTitle']).toBe('string');
    expect(typeof meta['initiatedResearchAt']).toBe('string');
    expect(meta['customNote']).toBe('keep-me');
    expect(meta['topicId']).toBe('topic-1');
    expect(meta['resultIdeaId']).toBeUndefined();
    expect(result.research.id).toBe('research-1');
  });

  it('rejects non-relevance kinds without creating anything', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pendingRelevanceAction(), kind: 'objection_pattern',
    });
    const service = new OperatorActionService(prisma);
    await expect(service.initiateSalesResearch('ws-1', 'action-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.prospectResearch.create).not.toHaveBeenCalled();
  });

  it('rejects non-pending actions without creating anything', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pendingRelevanceAction(), status: 'DISMISSED',
    });
    const service = new OperatorActionService(prisma);
    await expect(service.initiateSalesResearch('ws-1', 'action-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.prospectResearch.create).not.toHaveBeenCalled();
  });

  it('reports missing actions as not found', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const service = new OperatorActionService(prisma);
    const err = await service.initiateSalesResearch('ws-1', 'missing').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DecisionError);
    expect((err as DecisionError).code).toBe('NOT_FOUND');
  });

  it('returns the existing research on duplicate initiation', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingRelevanceAction({ resultResearchId: 'research-9', resultResearchTitle: 'Old', initiatedResearchAt: 'd' })
    );
    (prisma.prospectResearch.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'research-9' });
    const service = new OperatorActionService(prisma);
    const err = await service.initiateSalesResearch('ws-1', 'action-1').catch((e: unknown) => e);
    expect((err as DecisionError).code).toBe('CONFLICT');
    expect((err as DecisionError).details).toMatchObject({ researchId: 'research-9' });
    expect(prisma.prospectResearch.create).not.toHaveBeenCalled();
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
    await expect(service.initiateSalesResearch('ws-1', 'action-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.prospectResearch.create).not.toHaveBeenCalled();
  });

  it('rejects when the lead vanishes after eligibility (TOCTOU guard)', async () => {
    const prisma = mockPrisma();
    let leadCalls = 0;
    // Call order: helper compute (1), collectCandidates compute (2), eligibility
    // direct + compute (3, 4), explicit lead guard (5). Only the guard must fail.
    (prisma.lead.findFirst as ReturnType<typeof vi.fn>).mockImplementation(async () => (++leadCalls <= 4 ? LEAD : null));
    const live = await liveRelevanceCandidate(prisma);
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingRelevanceAction({}, live.identityKey)
    );
    const service = new OperatorActionService(prisma);
    await expect(service.initiateSalesResearch('ws-1', 'action-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.prospectResearch.create).not.toHaveBeenCalled();
  });

  it('converts service validation failures to CONFLICT', async () => {
    const prisma = mockPrisma();
    const live = await liveRelevanceCandidate(prisma);
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingRelevanceAction({}, live.identityKey)
    );
    (prisma.prospectResearch.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new SalesError('INSUFFICIENT_DATA', 'Lead not found in this workspace.')
    );
    const service = new OperatorActionService(prisma);
    const err = await service.initiateSalesResearch('ws-1', 'action-1').catch((e: unknown) => e);
    expect((err as DecisionError).code).toBe('CONFLICT');
    expect(prisma.operatorAction.update).not.toHaveBeenCalled();
  });

  it('compensates when linkage fails', async () => {
    const prisma = mockPrisma();
    const live = await liveRelevanceCandidate(prisma);
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingRelevanceAction({}, live.identityKey)
    );
    (prisma.operatorAction.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('link failed'));
    const service = new OperatorActionService(prisma);
    await expect(service.initiateSalesResearch('ws-1', 'action-1')).rejects.toThrow('link failed');
    expect(prisma.prospectResearch.delete).toHaveBeenCalledWith({ where: { id: 'research-1' } });
  });

  it('leaves the ideas path untouched', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pendingRelevanceAction(), kind: 'content_opportunity',
    });
    const service = new OperatorActionService(prisma);
    await expect(service.initiateSalesResearch('ws-1', 'action-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
    expect(prisma.prospectResearch.create).not.toHaveBeenCalled();
  });
});

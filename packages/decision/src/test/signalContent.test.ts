import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OperatorActionService } from '../actions';
import { buildSignalIdea, extractResultKeys, SIGNAL_TAG } from '../initiation';
import { salesContentSignals } from '../signals';
import { checkEligibility } from '../eligibility';
import { scoreCandidate } from '../scoring';
import { DecisionError } from '../errors';

const CREATED = new Date('2026-09-18T00:00:00Z');

const SIGNAL_ROW = {
  id: 'signal-1',
  workspaceId: 'ws-1',
  signalType: 'problem_content',
  sourceConversationIds: ['conv-a', 'conv-b'],
  evidence: 'Prospects keep asking how to shorten the sales cycle.',
  frequency: 2,
  recommendedAngle: 'Playbook for shorter cycles',
  reasoning: 'Two recorded conversations raise cycle length.',
  createdAt: CREATED,
};

const PREFILL_INPUT = {
  signalId: 'signal-1',
  signalType: 'problem_content',
  evidence: 'Prospects keep asking how to shorten the sales cycle.',
  frequency: 2,
  conversationCount: 2,
  recommendedAngle: 'Playbook for shorter cycles',
  reasoning: 'Two recorded conversations raise cycle length.',
  conversationIds: ['conv-a', 'conv-b'],
  identityKey: 'sales_content_signal:signal-1',
};

function mockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    conversationClassificationResult: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _max: { createdAt: CREATED } }),
    },
    iCP: { findFirst: vi.fn().mockResolvedValue(null) },
    topic: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    lead: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    prospectResearch: { findMany: vi.fn().mockResolvedValue([]) },
    salesContentSignal: {
      findMany: vi.fn().mockResolvedValue([SIGNAL_ROW]),
      findFirst: vi.fn().mockResolvedValue(SIGNAL_ROW),
    },
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

function pendingSignalAction(meta: Record<string, unknown> = {}, identityKey = 'sales_content_signal:signal-1') {
  return {
    id: 'action-1', workspaceId: 'ws-1', identityKey,
    kind: 'sales_content_signal', status: 'PENDING', subjectMeta: meta,
  };
}

describe('Signal idea prefill', () => {
  it('builds title and provenance from recorded evidence only', () => {
    const prefill = buildSignalIdea(PREFILL_INPUT);
    expect(prefill.title).toContain('Playbook for shorter cycles');
    expect(prefill.title.length).toBeLessThanOrEqual(200);
    expect(prefill.description).toContain('problem_content');
    expect(prefill.description).toContain('signal-1');
    expect(prefill.description).toContain('2 conversation(s)');
    expect(prefill.description).toContain('conv-a');
    expect(prefill.description).toContain('Two recorded conversations raise cycle length.');
    expect(prefill.description).toContain('sales_content_signal:signal-1');
    expect(prefill.tags).toEqual([SIGNAL_TAG]);
  });

  it('falls back to signal type without a recorded angle', () => {
    const prefill = buildSignalIdea({ ...PREFILL_INPUT, recommendedAngle: null, reasoning: null });
    expect(prefill.title).toContain('problem_content');
    expect(prefill.title.length).toBeLessThanOrEqual(200);
  });

  it('truncates long evidence to bounded fields', () => {
    const prefill = buildSignalIdea({
      ...PREFILL_INPUT,
      recommendedAngle: 'a'.repeat(500),
      evidence: 'e'.repeat(5000),
    });
    expect(prefill.title.length).toBeLessThanOrEqual(200);
  });

  it('is deterministic', () => {
    expect(buildSignalIdea(PREFILL_INPUT)).toEqual(buildSignalIdea(PREFILL_INPUT));
  });
});

describe('Signal collector shaping', () => {
  it('emits one workspace-scoped candidate per signal with recorded evidence', async () => {
    const prisma = mockPrisma();
    const out = await salesContentSignals(prisma, 'ws-1', Date.now());
    expect(out).toHaveLength(1);
    const c = out[0]!;
    expect(c.kind).toBe('sales_content_signal');
    expect(c.identityKey).toBe('sales_content_signal:signal-1');
    expect(c.subjectId).toBe('signal-1');
    expect(c.createdAt).toEqual(CREATED);
    const meta = c.facts.subjectMeta as Record<string, unknown>;
    expect(meta['signalId']).toBe('signal-1');
    expect(meta['signalType']).toBe('problem_content');
    expect(meta['conversationIds']).toEqual(['conv-a', 'conv-b']);
    expect(c.evidenceLinks[0]).toEqual({ label: 'Sales signal', ref: 'salesContentSignal:signal-1' });
  });

  it('scores deterministically on recorded evidence', async () => {
    const prisma = mockPrisma();
    const [candidate] = await salesContentSignals(prisma, 'ws-1', Date.now());
    const first = scoreCandidate({ candidate: candidate!, confirmedLearning: [] });
    const second = scoreCandidate({ candidate: candidate!, confirmedLearning: [] });
    expect(first.score).toBe(second.score);
    expect(first.score).toBeGreaterThan(0);
  });

  it('rejects deleted signals as ineligible', async () => {
    const prisma = mockPrisma({
      salesContentSignal: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    const live = await salesContentSignals(mockPrisma(), 'ws-1', Date.now());
    const verdict = await checkEligibility(prisma, 'ws-1', live[0]!);
    expect(verdict.eligible).toBe(false);
  });
});

describe('initiateIdea for sales_content_signal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates one draft idea and links it, preserving unrelated subjectMeta keys', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingSignalAction({ signalType: 'problem_content', customNote: 'keep-me' })
    );
    const service = new OperatorActionService(prisma);
    const result = await service.initiateIdea('ws-1', 'action-1', 'user-1');

    const create = prisma.contentIdea.create as ReturnType<typeof vi.fn>;
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].data).toMatchObject({
      workspaceId: 'ws-1',
      authorId: 'user-1',
      tags: [SIGNAL_TAG],
    });
    expect(create.mock.calls[0]![0].data.title.length).toBeLessThanOrEqual(200);
    expect(create.mock.calls[0]![0].data).not.toHaveProperty('status');
    expect(String(create.mock.calls[0]![0].data.description)).toContain('signal-1');

    const update = prisma.operatorAction.update as ReturnType<typeof vi.fn>;
    expect(update).toHaveBeenCalledTimes(1);
    const meta = update.mock.calls[0]![0].data.subjectMeta as Record<string, unknown>;
    expect(meta['resultIdeaId']).toBe('idea-1');
    expect(typeof meta['resultIdeaTitle']).toBe('string');
    expect(typeof meta['initiatedAt']).toBe('string');
    expect(meta['customNote']).toBe('keep-me');
    expect(meta['signalType']).toBe('problem_content');
    expect(result.idea.id).toBe('idea-1');
  });

  it('still rejects unrelated kinds without creating anything', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pendingSignalAction(), kind: 'content_opportunity',
    });
    const service = new OperatorActionService(prisma);
    await expect(service.initiateIdea('ws-1', 'action-1', 'user-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
  });

  it('rejects non-pending signal actions without creating anything', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...pendingSignalAction(), status: 'COMPLETED',
    });
    const service = new OperatorActionService(prisma);
    await expect(service.initiateIdea('ws-1', 'action-1', 'user-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
  });

  it('returns the existing idea on duplicate initiation', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingSignalAction({ resultIdeaId: 'idea-9', resultIdeaTitle: 'Old', initiatedAt: 'd' })
    );
    (prisma.contentIdea.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'idea-9', title: 'Old' });
    const service = new OperatorActionService(prisma);
    const err = await service.initiateIdea('ws-1', 'action-1', 'user-1').catch((e: unknown) => e);
    expect((err as DecisionError).code).toBe('CONFLICT');
    expect((err as DecisionError).details).toMatchObject({ ideaId: 'idea-9' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
  });

  it('creates nothing when the signal is deleted', async () => {
    const prisma = mockPrisma({
      salesContentSignal: {
        findMany: vi.fn().mockResolvedValue([SIGNAL_ROW]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    });
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pendingSignalAction());
    const service = new OperatorActionService(prisma);
    await expect(service.initiateIdea('ws-1', 'action-1', 'user-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
  });

  it('reports missing actions as not found', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const service = new OperatorActionService(prisma);
    const err = await service.initiateIdea('ws-1', 'missing', 'user-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DecisionError);
    expect((err as DecisionError).code).toBe('NOT_FOUND');
  });

  it('reuses the existing idea linkage keys (no new key family)', () => {
    expect(extractResultKeys({ resultIdeaId: 'i', resultIdeaTitle: 't', initiatedAt: 'd', signalId: 's' }))
      .toEqual({ resultIdeaId: 'i', resultIdeaTitle: 't', initiatedAt: 'd' });
  });
});

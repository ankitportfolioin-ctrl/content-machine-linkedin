import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OperatorActionService } from '../actions';
import { buildObjectionIdea, extractResultKeys, INITIATION_TAG } from '../initiation';
import { objectionPatterns } from '../signals';
import { DecisionError } from '../errors';

const CREATED = new Date('2026-09-18T00:00:00Z');

const OBJECTION_ROWS = [
  { id: 'c1', conversationId: 'conv-a', evidence: 'Objection language detected: "too expensive for our budget".', createdAt: CREATED },
  { id: 'c2', conversationId: 'conv-b', evidence: 'Objection language detected: "Too expensive for our budget!"', createdAt: CREATED },
];

const PREFILL_INPUT = {
  normalizedObjection: 'too expensive for our budget',
  count: 2,
  conversationIds: ['conv-a', 'conv-b'],
  classificationIds: ['c1', 'c2'],
  sampleEvidence: ['Objection language detected: "too expensive for our budget".'],
  identityKey: 'objection_pattern:abc123',
};

function mockPrisma(overrides: Record<string, unknown> = {}) {
  return {
    conversationClassificationResult: {
      findMany: vi.fn().mockResolvedValue(OBJECTION_ROWS),
      aggregate: vi.fn().mockResolvedValue({ _max: { createdAt: CREATED } }),
    },
    iCP: { findFirst: vi.fn().mockResolvedValue(null) },
    topic: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    lead: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    prospectResearch: { findMany: vi.fn().mockResolvedValue([]) },
    salesContentSignal: { findMany: vi.fn().mockResolvedValue([]) },
    commentSalesSignal: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    opportunityFeedback: { findMany: vi.fn().mockResolvedValue([]) },
    feedSource: { findMany: vi.fn().mockResolvedValue([]) },
    workspaceConnector: { findMany: vi.fn().mockResolvedValue([]) },
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

function pendingAction(meta: Record<string, unknown> = {}, identityKey = 'objection_pattern:abc123') {
  return {
    id: 'action-1', workspaceId: 'ws-1', identityKey,
    kind: 'objection_pattern', status: 'PENDING', subjectMeta: meta,
  };
}

async function liveCandidate(prisma: PrismaClient) {
  const all = await objectionPatterns(prisma, 'ws-1', Date.now());
  expect(all).toHaveLength(1);
  return all[0]!;
}

describe('Objection idea prefill', () => {
  it('builds title and provenance from recorded evidence only', () => {
    const prefill = buildObjectionIdea(PREFILL_INPUT);
    expect(prefill.title).toContain('too expensive for our budget');
    expect(prefill.title.length).toBeLessThanOrEqual(200);
    expect(prefill.description).toContain('too expensive for our budget');
    expect(prefill.description).toContain('2 conversation(s)');
    expect(prefill.description).toContain('conv-a');
    expect(prefill.description).toContain('objection_pattern:abc123');
    expect(prefill.tags).toEqual([INITIATION_TAG]);
  });

  it('truncates long quotes to the 200-character idea limit', () => {
    const long = 'x'.repeat(500);
    const prefill = buildObjectionIdea({ ...PREFILL_INPUT, sampleEvidence: [`Said: "${long}".`] });
    expect(prefill.title.length).toBeLessThanOrEqual(200);
    expect(prefill.title.length).toBeGreaterThan(0);
  });

  it('falls back to the normalized pattern without sample evidence', () => {
    const prefill = buildObjectionIdea({ ...PREFILL_INPUT, sampleEvidence: [] });
    expect(prefill.title).toContain('too expensive for our budget');
  });

  it('is deterministic', () => {
    expect(buildObjectionIdea(PREFILL_INPUT)).toEqual(buildObjectionIdea(PREFILL_INPUT));
  });
});

describe('Result linkage keys', () => {
  it('merges only linkage keys and preserves provenance', () => {
    expect(extractResultKeys({ resultIdeaId: 'i', resultIdeaTitle: 't', initiatedAt: 'd', count: 2 }))
      .toEqual({ resultIdeaId: 'i', resultIdeaTitle: 't', initiatedAt: 'd' });
    expect(extractResultKeys(null)).toEqual({});
    expect(extractResultKeys({ resultIdeaId: 42 })).toEqual({});
  });
});

describe('initiateIdea', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates one draft idea and links it atomically', async () => {
    const prisma = mockPrisma();
    const live = await liveCandidate(prisma);
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingAction({}, live.identityKey)
    );
    const service = new OperatorActionService(prisma);
    const result = await service.initiateIdea('ws-1', 'action-1', 'user-1');

    const create = prisma.contentIdea.create as ReturnType<typeof vi.fn>;
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].data).toMatchObject({
      workspaceId: 'ws-1',
      authorId: 'user-1',
      tags: [INITIATION_TAG],
    });
    expect(create.mock.calls[0]![0].data.title.length).toBeLessThanOrEqual(200);
    expect(create.mock.calls[0]![0].data).not.toHaveProperty('status');

    const update = prisma.operatorAction.update as ReturnType<typeof vi.fn>;
    expect(update).toHaveBeenCalledTimes(1);
    const meta = update.mock.calls[0]![0].data.subjectMeta as Record<string, unknown>;
    expect(meta['resultIdeaId']).toBe('idea-1');
    expect(typeof meta['initiatedAt']).toBe('string');
    expect(result.idea.id).toBe('idea-1');
  });

  it('rejects wrong kinds without creating anything', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ ...pendingAction(), kind: 'trend_signal' });
    const service = new OperatorActionService(prisma);
    await expect(service.initiateIdea('ws-1', 'action-1', 'user-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
  });

  it('rejects non-pending actions without creating anything', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ ...pendingAction(), status: 'DISMISSED' });
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

  it('returns the existing idea on duplicate initiation', async () => {
    const prisma = mockPrisma();
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingAction({ count: 2, resultIdeaId: 'idea-9', resultIdeaTitle: 'Old', initiatedAt: 'd' })
    );
    (prisma.contentIdea.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'idea-9', title: 'Old' });
    const service = new OperatorActionService(prisma);
    const err = await service.initiateIdea('ws-1', 'action-1', 'user-1').catch((e: unknown) => e);
    expect((err as DecisionError).code).toBe('CONFLICT');
    expect((err as DecisionError).details).toMatchObject({ ideaId: 'idea-9' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
  });

  it('proceeds when a previously linked idea was deleted', async () => {
    const prisma = mockPrisma();
    const live = await liveCandidate(prisma);
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingAction({ resultIdeaId: 'idea-gone' }, live.identityKey)
    );
    (prisma.contentIdea.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const service = new OperatorActionService(prisma);
    const result = await service.initiateIdea('ws-1', 'action-1', 'user-1');
    expect(result.idea.id).toBe('idea-1');
  });

  it('creates nothing when the pattern goes stale', async () => {
    const prisma = mockPrisma({
      conversationClassificationResult: {
        findMany: vi.fn()
          .mockResolvedValueOnce(OBJECTION_ROWS)
          .mockResolvedValue([{ conversationId: 'conv-a' }]),
        aggregate: vi.fn().mockResolvedValue({ _max: { createdAt: CREATED } }),
      },
    });
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(pendingAction());
    const service = new OperatorActionService(prisma);
    await expect(service.initiateIdea('ws-1', 'action-1', 'user-1')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(prisma.contentIdea.create).not.toHaveBeenCalled();
  });

  it('compensates when linkage fails', async () => {
    const prisma = mockPrisma();
    const live = await liveCandidate(prisma);
    (prisma.operatorAction.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      pendingAction({}, live.identityKey)
    );
    (prisma.operatorAction.update as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('link failed'));
    const service = new OperatorActionService(prisma);
    await expect(service.initiateIdea('ws-1', 'action-1', 'user-1')).rejects.toThrow('link failed');
    expect(prisma.contentIdea.delete).toHaveBeenCalledWith({ where: { id: 'idea-1' } });
  });
});

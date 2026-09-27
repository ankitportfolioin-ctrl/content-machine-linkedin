import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OperatorActionService } from '../actions';

function basePrisma() {
  return {
    contentOpportunity: { findMany: vi.fn().mockResolvedValue([]) },
    contentGap: { findMany: vi.fn().mockResolvedValue([]) },
    trendSignal: { findMany: vi.fn().mockResolvedValue([]) },
    contentReview: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    outreachReview: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn() },
    followUpRecommendation: { findMany: vi.fn().mockResolvedValue([]) },
    preparedAction: { findMany: vi.fn().mockResolvedValue([]) },
    learningProposal: { findMany: vi.fn().mockResolvedValue([]) },
    contentDraft: { findMany: vi.fn().mockResolvedValue([]) },
    conversationClassificationResult: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _max: { createdAt: null } }),
    },
    iCP: { findFirst: vi.fn().mockResolvedValue(null) },
    topic: { findMany: vi.fn().mockResolvedValue([]) },
    lead: { findMany: vi.fn().mockResolvedValue([]) },
    operatorAction: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  } as unknown as PrismaClient;
}

const REVIEW_ROW = {
  id: 'review-1',
  createdAt: new Date('2026-09-01T00:00:00Z'),
  draft: { id: 'draft-1', contentIdeaId: 'idea-1', contentIdea: { id: 'idea-1', title: 'Idea' } },
};

describe('OperatorActionService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates pending rows on refresh and never duplicates', async () => {
    const mockPrisma = basePrisma();
    mockPrisma.contentReview.findMany.mockResolvedValue([REVIEW_ROW]);
    mockPrisma.contentReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'SUBMITTED' });
    mockPrisma.operatorAction.upsert.mockImplementation(({ create }: never) => Promise.resolve({ id: 'a-1', ...(create as object) }));

    const service = new OperatorActionService(mockPrisma);
    const first = await service.refreshWorkspace('workspace-1');
    expect(first).toHaveLength(1);
    expect(first[0]?.identityKey).toBe('content_review:review-1');
    expect(mockPrisma.operatorAction.upsert).toHaveBeenCalledTimes(1);

    const second = await service.refreshWorkspace('workspace-1');
    expect(second).toHaveLength(1);
    expect(mockPrisma.operatorAction.upsert).toHaveBeenCalledTimes(2);
    const rows = await mockPrisma.operatorAction.findMany as unknown as Array<unknown>;
    void rows;
  });

  it('suppresses dismissed and completed rows on refresh', async () => {
    const mockPrisma = basePrisma();
    mockPrisma.contentReview.findMany.mockResolvedValue([REVIEW_ROW]);
    mockPrisma.contentReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'SUBMITTED' });
    mockPrisma.operatorAction.findMany.mockResolvedValue([
      { identityKey: 'content_review:review-1', status: 'DISMISSED' },
    ]);

    const service = new OperatorActionService(mockPrisma);
    const ranked = await service.refreshWorkspace('workspace-1');
    expect(ranked).toHaveLength(0);
    expect(mockPrisma.operatorAction.upsert).not.toHaveBeenCalled();
  });

  it('removes stale pending rows whose artifacts changed state', async () => {
    const mockPrisma = basePrisma();
    mockPrisma.operatorAction.deleteMany.mockResolvedValue({ count: 1 });
    const service = new OperatorActionService(mockPrisma);
    await service.refreshWorkspace('workspace-1');
    expect(mockPrisma.operatorAction.deleteMany).toHaveBeenCalledWith({
      where: { workspaceId: 'workspace-1', status: 'PENDING', identityKey: { notIn: [] } },
    });
  });

  it('enforces PENDING-only dismiss/complete transitions', async () => {
    const mockPrisma = basePrisma();
    mockPrisma.operatorAction.findFirst.mockResolvedValue({ id: 'a-1', status: 'PENDING' });
    mockPrisma.operatorAction.update.mockImplementation(({ data }: never) => Promise.resolve({ id: 'a-1', ...(data as object) }));
    const service = new OperatorActionService(mockPrisma);
    const dismissed = await service.transition('workspace-1', 'a-1', 'DISMISSED') as { status: string; dismissedAt: Date };
    expect(dismissed.status).toBe('DISMISSED');
    expect(dismissed.dismissedAt).toBeInstanceOf(Date);

    mockPrisma.operatorAction.findFirst.mockResolvedValue({ id: 'a-1', status: 'DISMISSED' });
    await expect(service.transition('workspace-1', 'a-1', 'COMPLETED')).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    mockPrisma.operatorAction.findFirst.mockResolvedValue(null);
    await expect(service.transition('workspace-1', 'missing', 'DISMISSED')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('explains from persisted rows even when candidates vanish', async () => {
    const mockPrisma = basePrisma();
    mockPrisma.operatorAction.findFirst.mockResolvedValue({
      id: 'a-1', identityKey: 'content_review:gone', kind: 'content_review', title: 'Gone',
      score: 40, reasons: ['Was waiting.'], evidenceLinks: [], status: 'PENDING', createdAt: new Date(),
    });
    const service = new OperatorActionService(mockPrisma);
    const explanation = await service.explain('workspace-1', 'a-1');
    expect(explanation.identityKey).toBe('content_review:gone');
    expect(explanation.reasons).toContain('Was waiting.');
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ReviewService } from '../review';

const mockPrisma = {
  contentDraft: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  contentReview: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  contentVersion: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
} as unknown as PrismaClient;

const OWNER = { userId: 'user-1', role: 'OWNER' };
const MEMBER = { userId: 'user-2', role: 'MEMBER' };

describe('ReviewService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits DRAFT → REVIEW', async () => {
    mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'draft-1' });
    mockPrisma.contentReview.findFirst.mockResolvedValue(null);
    mockPrisma.contentReview.create.mockImplementation(({ data }: never) => Promise.resolve({ id: 'review-1', ...(data as object) }));

    const service = new ReviewService(mockPrisma);
    const review = await service.submitForReview('workspace-1', 'draft-1', 'user-1') as { status: string };
    expect(review.status).toBe('SUBMITTED');
  });

  it('rejects double submission', async () => {
    mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'draft-1' });
    mockPrisma.contentReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'SUBMITTED' });

    const service = new ReviewService(mockPrisma);
    await expect(service.submitForReview('workspace-1', 'draft-1', 'user-1')).rejects.toMatchObject({ code: 'APPROVAL_NOT_ALLOWED' });
  });

  it('approves SUBMITTED reviews for owners', async () => {
    mockPrisma.contentReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'SUBMITTED' });
    mockPrisma.contentReview.update.mockImplementation(({ data }: never) => Promise.resolve({ id: 'review-1', ...(data as object) }));

    const service = new ReviewService(mockPrisma);
    const review = await service.transition('workspace-1', 'review-1', 'approve', OWNER, [{ gate: 'thesis_fidelity', status: 'PASS' }]) as { status: string };
    expect(review.status).toBe('APPROVED');
  });

  it('rejects unauthorized approval', async () => {
    mockPrisma.contentReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'SUBMITTED' });

    const service = new ReviewService(mockPrisma);
    await expect(service.transition('workspace-1', 'review-1', 'approve', MEMBER, [])).rejects.toMatchObject({ code: 'APPROVAL_NOT_ALLOWED' });
  });

  it('blocks approval when gates report BLOCKED, regardless of score', async () => {
    mockPrisma.contentReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'SUBMITTED' });

    const service = new ReviewService(mockPrisma);
    await expect(service.transition('workspace-1', 'review-1', 'approve', OWNER, [
      { gate: 'evidence_coverage', status: 'PASS' },
      { gate: 'statistics_grounding', status: 'BLOCKED' },
    ])).rejects.toMatchObject({ code: 'QUALITY_BLOCKED' });
  });

  it('rejects transitions from non-SUBMITTED reviews', async () => {
    mockPrisma.contentReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'APPROVED' });

    const service = new ReviewService(mockPrisma);
    await expect(service.transition('workspace-1', 'review-1', 'approve', OWNER, [])).rejects.toMatchObject({ code: 'APPROVAL_NOT_ALLOWED' });
  });

  it('finalizes only approved drafts into immutable versions', async () => {
    mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'draft-1', body: 'Final body text.' });
    mockPrisma.contentReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'APPROVED' });
    mockPrisma.contentVersion.findMany.mockResolvedValue([]);
    mockPrisma.contentVersion.create.mockImplementation(({ data }: never) => Promise.resolve({ id: 'version-1', ...(data as object) }));

    const service = new ReviewService(mockPrisma);
    const version = await service.finalizeVersion('workspace-1', 'draft-1', OWNER) as { isFinal: boolean };
    expect(version.isFinal).toBe(true);
  });

  it('refuses to finalize unapproved drafts', async () => {
    mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'draft-1', body: 'Body.' });
    mockPrisma.contentReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'SUBMITTED' });

    const service = new ReviewService(mockPrisma);
    await expect(service.finalizeVersion('workspace-1', 'draft-1', OWNER)).rejects.toMatchObject({ code: 'APPROVAL_NOT_ALLOWED' });
  });

  it('treats approved drafts as immutable', async () => {
    mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'draft-1' });
    mockPrisma.contentVersion.findFirst.mockResolvedValue(null);
    mockPrisma.contentReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'APPROVED' });

    const service = new ReviewService(mockPrisma);
    await expect(service.assertDraftMutable('workspace-1', 'draft-1')).rejects.toMatchObject({ code: 'VERSION_IMMUTABLE' });
  });

  it('creates revisions with incremented versions', async () => {
    mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'draft-1', contentIdeaId: 'idea-1', planId: 'plan-1', body: 'Body.', structure: null });
    mockPrisma.contentDraft.findMany.mockResolvedValue([{ version: 2 }]);
    mockPrisma.contentDraft.create.mockImplementation(({ data }: never) => Promise.resolve({ id: 'draft-2', ...(data as object) }));

    const service = new ReviewService(mockPrisma);
    const revision = await service.createRevision('workspace-1', 'draft-1', 'user-1') as { version: number };
    expect(revision.version).toBe(3);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OutreachReviewService, hashBody } from '../review';
import { PreparedActionService } from '../prepared';

const mockPrisma = {
  outreachDraft: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  outreachReview: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  preparedAction: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
} as unknown as PrismaClient;

const OWNER = { userId: 'user-1', role: 'OWNER' };
const MEMBER = { userId: 'user-2', role: 'MEMBER' };
const DRAFT = { id: 'draft-1', workspaceId: 'workspace-1', version: 1, body: 'Hello Jane, your post resonated.' };

describe('Outreach review state machine', () => {
  beforeEach(() => vi.clearAllMocks());

  it('submits and approves with valid gates', async () => {
    mockPrisma.outreachDraft.findFirst.mockResolvedValue(DRAFT);
    mockPrisma.outreachReview.findFirst.mockResolvedValue(null);
    mockPrisma.outreachReview.create.mockImplementation(({ data }: never) => Promise.resolve({ id: 'review-1', ...(data as object) }));
    const service = new OutreachReviewService(mockPrisma);
    const submitted = await service.submitForReview('workspace-1', 'draft-1', 'user-1') as { status: string };
    expect(submitted.status).toBe('SUBMITTED');

    mockPrisma.outreachReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'SUBMITTED', draftId: 'draft-1' });
    mockPrisma.outreachReview.update.mockImplementation(({ data }: never) => Promise.resolve({ id: 'review-1', ...(data as object) }));
    const approved = await service.transition('workspace-1', 'review-1', 'approve', OWNER, [{ gate: 'prospect_fit', status: 'PASS' }]) as { status: string; draftVersion: number };
    expect(approved.status).toBe('APPROVED');
    expect(approved.draftVersion).toBe(1);
  });

  it('blocks approval on hard gate failures regardless of score', async () => {
    mockPrisma.outreachReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'SUBMITTED', draftId: 'draft-1' });
    const service = new OutreachReviewService(mockPrisma);
    await expect(service.transition('workspace-1', 'review-1', 'approve', OWNER, [
      { gate: 'prospect_fit', status: 'PASS' },
      { gate: 'unsupported_claims', status: 'BLOCKED' },
    ])).rejects.toMatchObject({ code: 'QUALITY_BLOCKED' });
  });

  it('rejects unauthorized approval', async () => {
    mockPrisma.outreachReview.findFirst.mockResolvedValue({ id: 'review-1', status: 'SUBMITTED', draftId: 'draft-1' });
    const service = new OutreachReviewService(mockPrisma);
    await expect(service.transition('workspace-1', 'review-1', 'approve', MEMBER, [])).rejects.toMatchObject({ code: 'APPROVAL_NOT_ALLOWED' });
  });

  it('invalidates approval when the draft changes, returning it to mutable', async () => {
    mockPrisma.outreachDraft.findFirst.mockResolvedValue({ ...DRAFT, body: 'Edited body text here.' });
    mockPrisma.outreachReview.findFirst.mockResolvedValue({
      id: 'review-1', status: 'APPROVED', draftVersion: 1, approvedBodyHash: hashBody(DRAFT.body),
    });
    const service = new OutreachReviewService(mockPrisma);
    expect(await service.isApprovalValid('workspace-1', 'draft-1')).toBe(false);
    await expect(service.assertDraftMutable('workspace-1', 'draft-1')).resolves.toBeUndefined();
  });

  it('locks drafts with a still-valid approval', async () => {
    mockPrisma.outreachDraft.findFirst.mockResolvedValue({ ...DRAFT });
    mockPrisma.outreachReview.findFirst.mockResolvedValue({
      id: 'review-1', status: 'APPROVED', draftVersion: 1, approvedBodyHash: hashBody(DRAFT.body),
    });
    const service = new OutreachReviewService(mockPrisma);
    expect(await service.isApprovalValid('workspace-1', 'draft-1')).toBe(true);
    await expect(service.assertDraftMutable('workspace-1', 'draft-1')).rejects.toMatchObject({ code: 'APPROVAL_NOT_ALLOWED' });
  });
});

describe('Prepared actions (terminal boundary)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.outreachDraft.findFirst.mockResolvedValue(null);
    mockPrisma.outreachReview.findFirst.mockResolvedValue(null);
    mockPrisma.preparedAction.findFirst.mockResolvedValue(null);
  });

  it('refuses to prepare actions without approval', async () => {
    mockPrisma.outreachDraft.findFirst.mockResolvedValue(DRAFT);
    mockPrisma.outreachReview.findFirst.mockResolvedValue(null);
    const reviews = new OutreachReviewService(mockPrisma);
    const service = new PreparedActionService(mockPrisma, reviews);
    await expect(service.prepareAction({ workspaceId: 'workspace-1', actionType: 'SEND_FIRST_MESSAGE', draftId: 'draft-1' }))
      .rejects.toMatchObject({ code: 'ACTION_BLOCKED' });
  });

  it('prepares actions from valid approvals and honors expiry', async () => {
    mockPrisma.outreachDraft.findFirst.mockResolvedValue(DRAFT);
    mockPrisma.outreachReview.findFirst.mockResolvedValue({
      id: 'review-1', status: 'APPROVED', draftVersion: 1, approvedBodyHash: hashBody(DRAFT.body),
    });
    mockPrisma.preparedAction.create.mockImplementation(({ data }: never) => Promise.resolve({ id: 'action-1', ...(data as object) }));
    const reviews = new OutreachReviewService(mockPrisma);
    const service = new PreparedActionService(mockPrisma, reviews);
    const action = await service.prepareAction({
      workspaceId: 'workspace-1', actionType: 'SEND_FIRST_MESSAGE', draftId: 'draft-1', approvalId: 'review-1',
    }) as { status: string };
    expect(action.status).toBe('REQUIRES_APPROVAL');

    mockPrisma.preparedAction.findFirst.mockResolvedValue({
      id: 'action-1', status: 'REQUIRES_APPROVAL', draftId: 'draft-1', expiresAt: new Date(Date.now() - 1000),
    });
    mockPrisma.preparedAction.update.mockImplementation(({ data }: never) => Promise.resolve({ id: 'action-1', ...(data as object) }));
    await expect(service.markReady('workspace-1', 'action-1')).rejects.toMatchObject({ code: 'ACTION_EXPIRED' });
  });
});

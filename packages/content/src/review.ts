import { PrismaClient } from '@prisma/client';
import { ContentError } from './errors';

export type ReviewAction = 'submit' | 'approve' | 'reject' | 'request_changes';

const APPROVER_ROLES = new Set(['OWNER', 'ADMIN']);

export interface GateSummaryEntry {
  gate: string;
  status: string;
}

export class ReviewService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private async getDraft(workspaceId: string, draftId: string) {
    const draft = await this.prisma.contentDraft.findFirst({ where: { id: draftId, workspaceId } });
    if (!draft) {
      throw new ContentError('APPROVAL_NOT_ALLOWED', 'Draft not found in this workspace.');
    }
    return draft;
  }

  async latestReview(workspaceId: string, draftId: string) {
    return this.prisma.contentReview.findFirst({
      where: { workspaceId, draftId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async hasFinalVersion(workspaceId: string, draftId: string): Promise<boolean> {
    const version = await this.prisma.contentVersion.findFirst({ where: { workspaceId, contentDraftId: draftId, isFinal: true } });
    return version !== null;
  }

  async assertDraftMutable(workspaceId: string, draftId: string): Promise<void> {
    await this.getDraft(workspaceId, draftId);
    if (await this.hasFinalVersion(workspaceId, draftId)) {
      throw new ContentError('VERSION_IMMUTABLE', 'Draft has an approved final version and cannot be edited. Create a new revision instead.');
    }
    const latest = await this.latestReview(workspaceId, draftId);
    if (latest && latest.status === 'APPROVED') {
      throw new ContentError('VERSION_IMMUTABLE', 'Draft is approved and cannot be edited. Create a new revision instead.');
    }
  }

  async submitForReview(workspaceId: string, draftId: string, requestedBy: string, note?: string) {
    await this.getDraft(workspaceId, draftId);
    const latest = await this.latestReview(workspaceId, draftId);
    if (latest && latest.status === 'SUBMITTED') {
      throw new ContentError('APPROVAL_NOT_ALLOWED', 'Draft already has a pending review.');
    }
    if (latest && latest.status === 'APPROVED') {
      throw new ContentError('VERSION_IMMUTABLE', 'Draft is already approved. Create a new revision to review again.');
    }
    return this.prisma.contentReview.create({
      data: { workspaceId, draftId, status: 'SUBMITTED', requestedBy, note: note ?? null },
    });
  }

  async transition(
    workspaceId: string,
    reviewId: string,
    action: Exclude<ReviewAction, 'submit'>,
    actor: { userId: string; role: string },
    gateSummary?: GateSummaryEntry[]
  ) {
    const review = await this.prisma.contentReview.findFirst({ where: { id: reviewId, workspaceId } });
    if (!review) {
      throw new ContentError('APPROVAL_NOT_ALLOWED', 'Review not found in this workspace.');
    }
    if (review.status !== 'SUBMITTED') {
      throw new ContentError('APPROVAL_NOT_ALLOWED', `Only SUBMITTED reviews can transition (current: ${review.status}).`);
    }

    if (action === 'approve') {
      if (!APPROVER_ROLES.has(actor.role)) {
        throw new ContentError('APPROVAL_NOT_ALLOWED', `Role ${actor.role} may not approve. OWNER or ADMIN required.`);
      }
      const blocked = (gateSummary ?? []).some((g) => g.status === 'BLOCKED');
      if (blocked) {
        throw new ContentError('QUALITY_BLOCKED', 'Approval blocked: one or more quality gates report BLOCKED. Numeric scores cannot override hard failures.');
      }
      return this.prisma.contentReview.update({
        where: { id: review.id },
        data: { status: 'APPROVED', reviewerId: actor.userId, gateSummary: gateSummary ?? undefined },
      });
    }

    if (action === 'reject') {
      return this.prisma.contentReview.update({
        where: { id: review.id },
        data: { status: 'REJECTED', reviewerId: actor.userId, gateSummary: gateSummary ?? undefined },
      });
    }

    return this.prisma.contentReview.update({
      where: { id: review.id },
      data: { status: 'CHANGES_REQUESTED', reviewerId: actor.userId, gateSummary: gateSummary ?? undefined },
    });
  }

  async finalizeVersion(
    workspaceId: string,
    draftId: string,
    actor: { userId: string; role: string },
    changeSummary?: string
  ) {
    const draft = await this.getDraft(workspaceId, draftId);
    const latest = await this.latestReview(workspaceId, draftId);
    if (!latest || latest.status !== 'APPROVED') {
      throw new ContentError('APPROVAL_NOT_ALLOWED', 'Only drafts with an APPROVED review can be finalized.');
    }
    if (!APPROVER_ROLES.has(actor.role)) {
      throw new ContentError('APPROVAL_NOT_ALLOWED', `Role ${actor.role} may not finalize. OWNER or ADMIN required.`);
    }
    const existing = await this.prisma.contentVersion.findMany({ where: { workspaceId, contentDraftId: draftId }, orderBy: { version: 'desc' }, take: 1 });
    const nextVersion = (existing[0]?.version ?? 0) + 1;
    return this.prisma.contentVersion.create({
      data: {
        workspaceId,
        contentDraftId: draftId,
        authorId: actor.userId,
        body: draft.body,
        version: nextVersion,
        changeSummary: changeSummary ?? null,
        isFinal: true,
      },
    });
  }

  async createRevision(workspaceId: string, draftId: string, authorId: string) {
    const draft = await this.getDraft(workspaceId, draftId);
    const siblings = await this.prisma.contentDraft.findMany({ where: { workspaceId, contentIdeaId: draft.contentIdeaId }, orderBy: { version: 'desc' }, take: 1 });
    const nextVersion = (siblings[0]?.version ?? 0) + 1;
    return this.prisma.contentDraft.create({
      data: {
        workspaceId,
        contentIdeaId: draft.contentIdeaId,
        planId: draft.planId,
        authorId,
        body: draft.body,
        structure: (draft.structure as object | null) ?? undefined,
        version: nextVersion,
      },
    });
  }
}

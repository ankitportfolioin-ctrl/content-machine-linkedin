import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { SalesError } from './errors';

export type OutreachReviewAction = 'submit' | 'approve' | 'reject' | 'request_changes';

const APPROVER_ROLES = new Set(['OWNER', 'ADMIN']);

export function hashBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export class OutreachReviewService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  private async getDraft(workspaceId: string, draftId: string) {
    const draft = await this.prisma.outreachDraft.findFirst({ where: { id: draftId, workspaceId } });
    if (!draft) {
      throw new SalesError('APPROVAL_NOT_ALLOWED', 'Outreach draft not found in this workspace.');
    }
    return draft;
  }

  async latestReview(workspaceId: string, draftId: string) {
    return this.prisma.outreachReview.findFirst({
      where: { workspaceId, draftId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * An approval is valid only while it references the current draft version
   * AND the current body hash. Any edit after approval invalidates it.
   */
  async isApprovalValid(workspaceId: string, draftId: string): Promise<boolean> {
    const [draft, latest] = await Promise.all([
      this.getDraft(workspaceId, draftId),
      this.latestReview(workspaceId, draftId),
    ]);
    if (!latest || latest.status !== 'APPROVED') return false;
    if (latest.draftVersion !== null && latest.draftVersion !== draft.version) return false;
    if (latest.approvedBodyHash && latest.approvedBodyHash !== hashBody(draft.body)) return false;
    return true;
  }

  async assertDraftMutable(workspaceId: string, draftId: string): Promise<void> {
    if (await this.isApprovalValid(workspaceId, draftId)) {
      throw new SalesError(
        'APPROVAL_NOT_ALLOWED',
        'Draft has a valid approval and cannot be edited. Create a new revision instead; the new revision requires fresh approval.'
      );
    }
  }

  async submitForReview(workspaceId: string, draftId: string, requestedBy: string, note?: string) {
    await this.getDraft(workspaceId, draftId);
    const latest = await this.latestReview(workspaceId, draftId);
    if (latest && latest.status === 'SUBMITTED') {
      throw new SalesError('APPROVAL_NOT_ALLOWED', 'Draft already has a pending review.');
    }
    if (await this.isApprovalValid(workspaceId, draftId)) {
      throw new SalesError('APPROVAL_NOT_ALLOWED', 'Draft is already approved. Create a new revision to review again.');
    }
    return this.prisma.outreachReview.create({
      data: { workspaceId, draftId, status: 'SUBMITTED', requestedBy, note: note ?? null },
    });
  }

  async transition(
    workspaceId: string,
    reviewId: string,
    action: Exclude<OutreachReviewAction, 'submit'>,
    actor: { userId: string; role: string },
    gateSummary?: Array<{ gate: string; status: string }>
  ) {
    const review = await this.prisma.outreachReview.findFirst({ where: { id: reviewId, workspaceId } });
    if (!review) {
      throw new SalesError('APPROVAL_NOT_ALLOWED', 'Outreach review not found in this workspace.');
    }
    if (review.status !== 'SUBMITTED') {
      throw new SalesError('APPROVAL_NOT_ALLOWED', `Only SUBMITTED reviews can transition (current: ${review.status}).`);
    }

    if (action === 'approve') {
      if (!APPROVER_ROLES.has(actor.role)) {
        throw new SalesError('APPROVAL_NOT_ALLOWED', `Role ${actor.role} may not approve. OWNER or ADMIN required.`);
      }
      const blocked = (gateSummary ?? []).some((g) => g.status === 'BLOCKED');
      if (blocked) {
        throw new SalesError('QUALITY_BLOCKED', 'Approval blocked: one or more quality gates report BLOCKED. Numeric scores cannot override hard failures.');
      }
      const draft = await this.getDraft(workspaceId, review.draftId);
      return this.prisma.outreachReview.update({
        where: { id: review.id },
        data: {
          status: 'APPROVED',
          reviewerId: actor.userId,
          gateSummary: gateSummary ?? undefined,
          draftVersion: draft.version,
          approvedBodyHash: hashBody(draft.body),
        },
      });
    }

    if (action === 'reject') {
      return this.prisma.outreachReview.update({
        where: { id: review.id },
        data: { status: 'REJECTED', reviewerId: actor.userId, gateSummary: gateSummary ?? undefined },
      });
    }

    return this.prisma.outreachReview.update({
      where: { id: review.id },
      data: { status: 'CHANGES_REQUESTED', reviewerId: actor.userId, gateSummary: gateSummary ?? undefined },
    });
  }

  async createRevision(workspaceId: string, draftId: string, authorId: string) {
    const draft = await this.getDraft(workspaceId, draftId);
    const siblings = await this.prisma.outreachDraft.findMany({
      where: { workspaceId, strategyId: draft.strategyId },
      orderBy: { version: 'desc' },
      take: 1,
    });
    const nextVersion = (siblings[0]?.version ?? 0) + 1;
    return this.prisma.outreachDraft.create({
      data: {
        workspaceId,
        strategyId: draft.strategyId,
        leadId: draft.leadId,
        draftType: draft.draftType,
        opening: draft.opening,
        relevance: draft.relevance,
        evidence: draft.evidence,
        value: draft.value,
        cta: draft.cta,
        body: draft.body,
        structure: (draft.structure as object | null) ?? undefined,
        version: nextVersion,
        createdBy: authorId,
      },
    });
  }
}

import { PrismaClient } from '@prisma/client';
import { SalesError } from './errors';
import { OutreachReviewService } from './review';

export type PreparedActionType =
  | 'SEND_CONNECTION_NOTE'
  | 'SEND_FIRST_MESSAGE'
  | 'SEND_FOLLOW_UP'
  | 'SEND_VALUE_MESSAGE'
  | 'SHARE_CONTENT';

/**
 * Action preparation is the terminal Phase 4 boundary. This service prepares
 * actions for human-authorized execution elsewhere. It contains NO execution
 * logic: no senders, no LinkedIn clients, no automation of any kind.
 */
export class PreparedActionService {
  private prisma: PrismaClient;
  private reviews: OutreachReviewService;

  constructor(prisma: PrismaClient, reviews: OutreachReviewService) {
    this.prisma = prisma;
    this.reviews = reviews;
  }

  async prepareAction(input: {
    workspaceId: string;
    actionType: string;
    target?: string;
    draftId?: string;
    approvalId?: string;
    evidence?: Record<string, unknown>;
    expiresAt?: Date;
  }) {
    if (input.draftId) {
      const draft = await this.prisma.outreachDraft.findFirst({ where: { id: input.draftId, workspaceId: input.workspaceId } });
      if (!draft) {
        throw new SalesError('ACTION_BLOCKED', 'Outreach draft not found in this workspace.');
      }
      const valid = await this.reviews.isApprovalValid(input.workspaceId, input.draftId);
      if (!valid) {
        throw new SalesError(
          input.approvalId ? 'ACTION_BLOCKED' : 'ACTION_BLOCKED',
          'Prepared actions require a valid approval for the exact current draft version. Approve the draft first; any edit invalidates approval.'
        );
      }
    }
    if (input.approvalId) {
      const approval = await this.prisma.outreachReview.findFirst({ where: { id: input.approvalId, workspaceId: input.workspaceId } });
      if (!approval || approval.status !== 'APPROVED') {
        throw new SalesError('ACTION_BLOCKED', 'Referenced approval is missing or not APPROVED.');
      }
    }
    if (!input.draftId && !input.approvalId) {
      throw new SalesError('ACTION_BLOCKED', 'Prepared actions require a draft or approval reference. Unapproved actions are never prepared.');
    }
    return this.prisma.preparedAction.create({
      data: {
        workspaceId: input.workspaceId,
        actionType: input.actionType,
        target: input.target ?? null,
        draftId: input.draftId ?? null,
        approvalId: input.approvalId ?? null,
        evidence: (input.evidence ?? null) as object | null,
        status: 'REQUIRES_APPROVAL',
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  async markReady(workspaceId: string, actionId: string) {
    const action = await this.prisma.preparedAction.findFirst({ where: { id: actionId, workspaceId } });
    if (!action) {
      throw new SalesError('ACTION_BLOCKED', 'Prepared action not found in this workspace.');
    }
    if (action.expiresAt && action.expiresAt.getTime() < Date.now()) {
      await this.prisma.preparedAction.update({ where: { id: action.id }, data: { status: 'EXPIRED' } });
      throw new SalesError('ACTION_EXPIRED', 'Prepared action has expired and must be re-prepared.');
    }
    if (action.draftId) {
      const valid = await this.reviews.isApprovalValid(workspaceId, action.draftId);
      if (!valid) {
        await this.prisma.preparedAction.update({ where: { id: action.id }, data: { status: 'BLOCKED' } });
        throw new SalesError('ACTION_BLOCKED', 'Draft approval is no longer valid (edited or superseded). Re-approve before execution.');
      }
    }
    return this.prisma.preparedAction.update({ where: { id: action.id }, data: { status: 'READY_FOR_AUTHORIZED_EXECUTION' } });
  }

  async checkExpiry(workspaceId: string, actionId: string) {
    const action = await this.prisma.preparedAction.findFirst({ where: { id: actionId, workspaceId } });
    if (!action) {
      throw new SalesError('ACTION_BLOCKED', 'Prepared action not found in this workspace.');
    }
    if (action.expiresAt && action.expiresAt.getTime() < Date.now() && action.status !== 'EXPIRED') {
      return this.prisma.preparedAction.update({ where: { id: action.id }, data: { status: 'EXPIRED' } });
    }
    return action;
  }
}

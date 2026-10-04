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
    idempotencyKey?: string;
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
    // Idempotent retry: the same key returns the existing row instead of
    // preparing a duplicate that could later double into two sends.
    // Mirrors OutcomeMetric.idempotencyKey (learning/outcome.ts).
    const key = input.idempotencyKey?.trim() || null;
    if (key) {
      const existing = await this.prisma.preparedAction.findUnique({
        where: { workspaceId_idempotencyKey: { workspaceId: input.workspaceId, idempotencyKey: key } },
      });
      if (existing) return existing;
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
        idempotencyKey: key,
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
    // Over-contact guard: one in-flight execution per lead. A second READY
    // action for the same lead stacks concurrent touches on one person, so
    // it is BLOCKED until the in-flight one resolves (executed externally
    // and recorded, expired, or dismissed) — WAIT/NURTURE stay first-class
    // by never forcing the earlier action forward.
    const leadId = await this.resolveLeadId(workspaceId, action);
    if (!leadId) {
      throw new Error(`resolveLeadId returned null for action ${action.id}, draftId: ${action.draftId}, approvalId: ${action.approvalId}`);
    }
    const inFlight = (await this.prisma.preparedAction.findMany({
      where: {
        workspaceId,
        status: 'READY_FOR_AUTHORIZED_EXECUTION',
        id: { not: action.id },
        draft: { leadId },
      },
      select: { id: true },
      take: 1,
    }) ?? []) as Array<{ id: string }>;
    if (inFlight.length > 0) {
      await this.prisma.preparedAction.update({ where: { id: action.id }, data: { status: 'BLOCKED' } });
      throw new SalesError(
        'ACTION_BLOCKED',
        `Lead already has a prepared outreach awaiting execution (${inFlight[0]!.id}). Record its outcome, let it expire, or dismiss it before preparing another touch — concurrent touches risk over-contact.`
      );
    }
    const ready = await this.prisma.preparedAction.update({ where: { id: action.id }, data: { status: 'READY_FOR_AUTHORIZED_EXECUTION' } });
    // Honest bookkeeping: a reached-ready preparation is a contact attempt
    // in flight. Lead.lastContactAt was previously never written by any
    // product path; it now records this fact for frequency decisions.
    await this.prisma.lead.update({ where: { id: leadId }, data: { lastContactAt: new Date() } });
    return ready;
  }

  private async resolveLeadId(
    workspaceId: string,
    action: { draftId: string | null; approvalId: string | null }
  ): Promise<string | null> {
    if (action.draftId) {
      const draft = await this.prisma.outreachDraft.findFirst({
        where: { id: action.draftId, workspaceId },
        select: { leadId: true },
      });
      if (draft?.leadId) return draft.leadId;
    }
    if (action.approvalId) {
      const review = await this.prisma.outreachReview.findFirst({
        where: { id: action.approvalId, workspaceId },
        select: { draft: { select: { leadId: true } } },
      });
      const leadId = (review as { draft?: { leadId?: unknown } } | null)?.draft?.leadId;
      if (typeof leadId === 'string' && leadId) return leadId;
    }
    return null;
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
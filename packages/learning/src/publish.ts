import { PrismaClient } from '@prisma/client';
import { LearningError } from './errors';
import { OutreachReviewService } from '@growth-operator/sales';

export interface PublishRecordInput {
  contentVersionId?: string;
  outreachDraftId?: string;
  pipelineOpportunityId?: string;
  channel: string;
  externalRef?: string;
  recordedAt?: Date;
}

const reviewServiceFor = (prisma: PrismaClient) => new OutreachReviewService(prisma);

/**
 * Record-only publication assertions. This service never contacts external
 * systems, never verifies URLs, and never sends or schedules anything. It
 * records the user's assertion that an approved artifact was acted upon.
 */
export class PublishService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async recordPublication(workspaceId: string, recordedBy: string, input: PublishRecordInput) {
    const subjects = [input.contentVersionId, input.outreachDraftId, input.pipelineOpportunityId].filter(Boolean);
    if (subjects.length === 0) {
      throw new LearningError('EVIDENCE_MISSING', 'A publish record requires at least one subject: contentVersionId, outreachDraftId, or pipelineOpportunityId.');
    }
    if (!input.channel?.trim()) {
      throw new LearningError('EVIDENCE_MISSING', 'A publish record requires a channel label.');
    }

    if (input.contentVersionId) {
      const version = await this.prisma.contentVersion.findFirst({
        where: { id: input.contentVersionId, workspaceId },
      });
      if (!version) {
        throw new LearningError('EVIDENCE_MISSING', 'Content version not found in this workspace.');
      }
      if (!version.isFinal) {
        throw new LearningError('EVIDENCE_MISSING', 'Only approved final content versions may be recorded as published.');
      }
    }

    if (input.outreachDraftId) {
      const draft = await this.prisma.outreachDraft.findFirst({
        where: { id: input.outreachDraftId, workspaceId },
      });
      if (!draft) {
        throw new LearningError('EVIDENCE_MISSING', 'Outreach draft not found in this workspace.');
      }
      const reviews = reviewServiceFor(this.prisma);
      if (!(await reviews.isApprovalValid(workspaceId, input.outreachDraftId))) {
        throw new LearningError('EVIDENCE_MISSING', 'Only outreach drafts with a currently valid approval may be recorded as acted upon.');
      }
    }

    if (input.pipelineOpportunityId) {
      const opportunity = await this.prisma.pipelineOpportunity.findFirst({
        where: { id: input.pipelineOpportunityId, workspaceId },
      });
      if (!opportunity) {
        throw new LearningError('EVIDENCE_MISSING', 'Pipeline opportunity not found in this workspace.');
      }
    }

    return this.prisma.publishRecord.create({
      data: {
        workspaceId,
        contentVersionId: input.contentVersionId ?? null,
        outreachDraftId: input.outreachDraftId ?? null,
        pipelineOpportunityId: input.pipelineOpportunityId ?? null,
        channel: input.channel.trim(),
        externalRef: input.externalRef?.trim() || null,
        recordedBy,
        recordedAt: input.recordedAt ?? new Date(),
      },
    });
  }
}

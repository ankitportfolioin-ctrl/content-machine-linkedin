import { PrismaClient } from '@prisma/client';
import { LearningError } from './errors';

export interface OutcomeMetricInput {
  publishRecordId?: string;
  contentVersionId?: string;
  outreachDraftId?: string;
  pipelineOpportunityId?: string;
  metricName: string;
  metricValue: number;
  unit?: string;
  source: string;
  recordedAt?: Date;
  idempotencyKey?: string;
}

const BANNED_SOURCES = new Set(['unknown', 'n/a', 'na', 'none', 'tbd', '?', '-', 'null']);

/**
 * User-recorded outcome metrics. Every metric requires a finite value, a
 * named source, and a recorder identity. Missing values are never estimated,
 * never zero-filled, and never inferred. Empty datasets surface as explicit
 * empty states at aggregation time.
 */
export class OutcomeService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async recordOutcome(workspaceId: string, recordedBy: string, input: OutcomeMetricInput) {
    const subjects = [input.publishRecordId, input.contentVersionId, input.outreachDraftId, input.pipelineOpportunityId].filter(Boolean);
    if (subjects.length === 0) {
      throw new LearningError('EVIDENCE_MISSING', 'An outcome metric requires at least one subject reference.');
    }
    if (!input.metricName?.trim()) {
      throw new LearningError('EVIDENCE_MISSING', 'An outcome metric requires a metric name.');
    }
    if (typeof input.metricValue !== 'number' || !Number.isFinite(input.metricValue)) {
      throw new LearningError('EVIDENCE_MISSING', 'An outcome metric requires a finite numeric value. Missing values are not estimated.');
    }
    const source = input.source?.trim() ?? '';
    if (source.length < 3 || BANNED_SOURCES.has(source.toLowerCase())) {
      throw new LearningError(
        'EVIDENCE_MISSING',
        'An outcome metric requires a named source (e.g. "manual CRM entry", "weekly review notes"). Placeholder sources such as "unknown" are rejected.'
      );
    }
    if (!recordedBy?.trim()) {
      throw new LearningError('EVIDENCE_MISSING', 'An outcome metric requires a recorder identity.');
    }

    if (input.publishRecordId) {
      const row = await this.prisma.publishRecord.findFirst({ where: { id: input.publishRecordId, workspaceId } });
      if (!row) throw new LearningError('EVIDENCE_MISSING', 'Publish record not found in this workspace.');
    }
    if (input.contentVersionId) {
      const row = await this.prisma.contentVersion.findFirst({ where: { id: input.contentVersionId, workspaceId } });
      if (!row) throw new LearningError('EVIDENCE_MISSING', 'Content version not found in this workspace.');
    }
    if (input.outreachDraftId) {
      const row = await this.prisma.outreachDraft.findFirst({ where: { id: input.outreachDraftId, workspaceId } });
      if (!row) throw new LearningError('EVIDENCE_MISSING', 'Outreach draft not found in this workspace.');
    }
    if (input.pipelineOpportunityId) {
      const row = await this.prisma.pipelineOpportunity.findFirst({ where: { id: input.pipelineOpportunityId, workspaceId } });
      if (!row) throw new LearningError('EVIDENCE_MISSING', 'Pipeline opportunity not found in this workspace.');
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.outcomeMetric.findUnique({
        where: { workspaceId_idempotencyKey: { workspaceId, idempotencyKey: input.idempotencyKey } },
      });
      if (existing) return existing;
    }

    return this.prisma.outcomeMetric.create({
      data: {
        workspaceId,
        publishRecordId: input.publishRecordId ?? null,
        contentVersionId: input.contentVersionId ?? null,
        outreachDraftId: input.outreachDraftId ?? null,
        pipelineOpportunityId: input.pipelineOpportunityId ?? null,
        metricName: input.metricName.trim(),
        metricValue: input.metricValue,
        unit: input.unit?.trim() || null,
        source: source,
        recordedBy,
        recordedAt: input.recordedAt ?? new Date(),
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  }
}

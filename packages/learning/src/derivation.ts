import { PrismaClient } from '@prisma/client';
import { LearningError } from './errors';

export const MAX_ADJUSTMENT = 0.2;
export const MIN_ADJUSTMENT_MAGNITUDE = 0.01;

export interface LearningInfluence {
  dimension: string;
  adjustment: number;
  reason: string;
  proposalId: string;
  confirmedAt: string;
}

const KNOWN_DIMENSIONS = new Set([
  'timeliness',
  'evidence_strength',
  'relevance',
  'audience_fit',
  'source_diversity',
  'differentiation',
  'actionability',
  'thesis_clarity',
  'trend_strength',
  'icp_fit',
  'role_fit',
  'company_fit',
  'problem_relevance',
  'research_completeness',
]);

export function validateAdjustment(dimension: string, adjustment: number): void {
  if (!KNOWN_DIMENSIONS.has(dimension)) {
    throw new LearningError('EVIDENCE_MISSING', `Unknown scoring dimension: ${dimension}. Learning weights may only target known dimensions.`);
  }
  if (!Number.isFinite(adjustment) || adjustment === 0 || Math.abs(adjustment) > MAX_ADJUSTMENT) {
    throw new LearningError(
      'EVIDENCE_MISSING',
      `Invalid proposed adjustment ${adjustment}. Adjustments must be non-zero numbers within [-${MAX_ADJUSTMENT}, ${MAX_ADJUSTMENT}] to prevent runaway scores.`
    );
  }
  if (Math.abs(adjustment) < MIN_ADJUSTMENT_MAGNITUDE) {
    throw new LearningError('EVIDENCE_MISSING', 'Adjustment magnitude is below the minimum meaningful threshold.');
  }
}

export interface DerivationInput {
  dimension: string;
  groupAverages: Array<{ label: string; avg: number; count: number; metricIds: string[] }>;
  reason: string;
  minSampleSize?: number;
  minRelativeGap?: number;
}

/**
 * Derives a learning proposal from measured group averages. Wording is
 * careful by construction: OBSERVED_PATTERN over a stated sample, never a
 * causal fact. Single-group or below-threshold inputs yield no proposal.
 */
export function deriveProposal(input: DerivationInput): {
  dimension: string;
  observedPattern: string;
  sampleSize: number;
  denominator: number;
  proposedAdjustment: number;
  reason: string;
  confidence: number;
  sourceMetricIds: string[];
} | null {
  validateAdjustment(input.dimension, 0.05);
  const minSample = input.minSampleSize ?? 3;
  const minGap = input.minRelativeGap ?? 0.1;
  const eligible = input.groupAverages.filter((g) => g.count >= minSample);
  if (eligible.length < 2) return null;

  const sorted = [...eligible].sort((a, b) => b.avg - a.avg);
  const top = sorted[0]!;
  const bottom = sorted[sorted.length - 1]!;
  if (bottom.avg === 0) return null;
  const gap = (top.avg - bottom.avg) / Math.abs(bottom.avg);
  if (gap < minGap) return null;

  const total = eligible.reduce((a, g) => a + g.count, 0);
  const adjustment = Math.min(MAX_ADJUSTMENT, Math.max(0.02, Math.round(gap * 100) / 1000));
  return {
    dimension: input.dimension,
    observedPattern: `Observed pattern (not causal): "${top.label}" averaged ${top.avg} vs "${bottom.label}" averaged ${bottom.avg} across ${total} recorded measurement(s).`,
    sampleSize: top.count + bottom.count,
    denominator: total,
    proposedAdjustment: adjustment,
    reason: input.reason,
    confidence: Math.min(0.9, 0.4 + total * 0.02),
    sourceMetricIds: [...top.metricIds, ...bottom.metricIds],
  };
}

const APPROVER_ROLES = new Set(['OWNER', 'ADMIN']);

export class LearningDerivationService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async propose(input: {
    workspaceId: string;
    dimension: string;
    observedPattern: string;
    supportingMeasurements: unknown;
    sourceMetricIds: string[];
    sampleSize: number;
    denominator?: number;
    proposedAdjustment: number;
    reason: string;
    confidence?: number;
  }) {
    validateAdjustment(input.dimension, input.proposedAdjustment);
    if (!input.observedPattern?.trim()) {
      throw new LearningError('EVIDENCE_MISSING', 'Learning proposals require an observed pattern description.');
    }
    if (!input.reason?.trim()) {
      throw new LearningError('EVIDENCE_MISSING', 'Learning proposals require a reason.');
    }
    if (input.sampleSize < 1) {
      throw new LearningError('EVIDENCE_MISSING', 'Learning proposals require a sample size of at least 1.');
    }
    if (input.denominator !== undefined && input.sampleSize > input.denominator) {
      throw new LearningError('EVIDENCE_MISSING', 'Sample size cannot exceed the denominator.');
    }
    if (input.sourceMetricIds.length > 0) {
      const count = await this.prisma.outcomeMetric.count({
        where: { id: { in: input.sourceMetricIds }, workspaceId: input.workspaceId },
      });
      if (count !== input.sourceMetricIds.length) {
        throw new LearningError('EVIDENCE_MISSING', 'One or more source metrics were not found in this workspace.');
      }
    }
    return this.prisma.learningProposal.create({
      data: {
        workspaceId: input.workspaceId,
        dimension: input.dimension,
        observedPattern: input.observedPattern,
        supportingMeasurements: (input.supportingMeasurements ?? {}) as object,
        sourceMetricIds: input.sourceMetricIds,
        sampleSize: input.sampleSize,
        denominator: input.denominator ?? null,
        proposedAdjustment: input.proposedAdjustment,
        reason: input.reason,
        confidence: input.confidence ?? null,
        status: 'PROPOSED',
      },
    });
  }

  async transition(
    workspaceId: string,
    proposalId: string,
    action: 'confirm' | 'reject' | 'revoke',
    actor: { userId: string; role: string }
  ) {
    const proposal = await this.prisma.learningProposal.findFirst({ where: { id: proposalId, workspaceId } });
    if (!proposal) {
      throw new LearningError('EVIDENCE_MISSING', 'Learning proposal not found in this workspace.');
    }
    if (action === 'confirm' || action === 'revoke') {
      if (!APPROVER_ROLES.has(actor.role)) {
        throw new LearningError('APPROVAL_NOT_ALLOWED', `Role ${actor.role} may not ${action} learning weights. OWNER or ADMIN required.`);
      }
    }
    if (action === 'confirm') {
      if (proposal.status !== 'PROPOSED') {
        throw new LearningError('APPROVAL_NOT_ALLOWED', `Only PROPOSED weights can be confirmed (current: ${proposal.status}).`);
      }
      return this.prisma.learningProposal.update({
        where: { id: proposal.id },
        data: { status: 'CONFIRMED', confirmedBy: actor.userId, confirmedAt: new Date() },
      });
    }
    if (action === 'reject') {
      if (proposal.status !== 'PROPOSED') {
        throw new LearningError('APPROVAL_NOT_ALLOWED', `Only PROPOSED weights can be rejected (current: ${proposal.status}).`);
      }
      return this.prisma.learningProposal.update({ where: { id: proposal.id }, data: { status: 'REJECTED' } });
    }
    if (proposal.status !== 'CONFIRMED') {
      throw new LearningError('APPROVAL_NOT_ALLOWED', `Only CONFIRMED weights can be revoked (current: ${proposal.status}).`);
    }
    return this.prisma.learningProposal.update({ where: { id: proposal.id }, data: { status: 'REVOKED' } });
  }

  async confirmedInfluences(workspaceId: string): Promise<LearningInfluence[]> {
    const rows = await this.prisma.learningProposal.findMany({
      where: { workspaceId, status: 'CONFIRMED' },
      orderBy: { confirmedAt: 'desc' },
    });
    return rows.map((r: { dimension: string; proposedAdjustment: number; reason: string; id: string; confirmedAt: Date | null; updatedAt: Date }) => ({
      dimension: r.dimension,
      adjustment: r.proposedAdjustment,
      reason: r.reason,
      proposalId: r.id,
      confirmedAt: (r.confirmedAt ?? r.updatedAt).toISOString(),
    }));
  }
}

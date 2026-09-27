import type { OpportunityScoreResult } from './contentOpportunity';

export interface OpportunityInfluenceInput {
  dimensions: Array<{
    name: string;
    score: number;
    reason: string;
    evidence: string[];
    baseScore: number;
    appliedAdjustment: number;
  }>;
  applied: Array<{
    dimension: string;
    adjustment: number;
    reason: string;
    proposalId: string;
    confirmedAt: string;
  }>;
  ignored: Array<{ dimension: string; reason: string }>;
  overallScore: number;
}

export interface OpportunityLearningView {
  overallScore: number;
  baseOverallScore: number;
  dimensions: Array<{
    name: string;
    score: number;
    explanation: string;
    evidence: string[];
    baseScore: number;
    appliedAdjustment: number;
  }>;
  criticalFailure: boolean;
  failureReason?: string;
  learning: {
    applied: OpportunityInfluenceInput['applied'];
    ignored: OpportunityInfluenceInput['ignored'];
  };
}

/**
 * Cross-machine scoring seam (read-only view builder). Maps an
 * already-computed learning influence application back onto the
 * opportunity score shape so API responses can show base vs adjusted
 * scores with per-dimension explanations.
 *
 * Safety rules (enforced by callers, documented here):
 * - Only CONFIRMED influences may be passed in; PROPOSED/REJECTED/REVOKED
 *   weights must never reach this function.
 * - When the base result is a critical evidence failure, callers must pass
 *   an empty application: learning never overrides a critical failure.
 */
export function toOpportunityLearningView(
  base: OpportunityScoreResult,
  influence: OpportunityInfluenceInput
): OpportunityLearningView {
  const byName = new Map(influence.dimensions.map((d) => [d.name, d]));
  return {
    overallScore: influence.overallScore,
    baseOverallScore: base.overallScore,
    dimensions: base.dimensions.map((dim) => {
      const adjusted = byName.get(dim.name);
      if (!adjusted) {
        return {
          name: dim.name,
          score: dim.score,
          explanation: dim.explanation,
          evidence: dim.evidence,
          baseScore: dim.score,
          appliedAdjustment: 0,
        };
      }
      return {
        name: dim.name,
        score: adjusted.score,
        explanation: adjusted.reason,
        evidence: adjusted.evidence,
        baseScore: adjusted.baseScore,
        appliedAdjustment: adjusted.appliedAdjustment,
      };
    }),
    criticalFailure: base.criticalFailure,
    failureReason: base.failureReason,
    learning: { applied: influence.applied, ignored: influence.ignored },
  };
}

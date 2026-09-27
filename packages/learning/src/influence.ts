import { LearningInfluence } from './derivation';

export interface ScoredDimension {
  name: string;
  score: number;
  reason: string;
  evidence: string[];
}

export interface InfluenceApplication {
  dimensions: Array<ScoredDimension & { baseScore: number; appliedAdjustment: number }>;
  applied: LearningInfluence[];
  ignored: Array<{ dimension: string; reason: string }>;
  overallScore: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Scoring seam: applies CONFIRMED learning influences to an existing score
 * result. Proposed/rejected/revoked weights never reach this function —
 * callers must pass only confirmed influences (see LearningDerivationService).
 * Adjustments are clamped per-dimension and overall scores stay in [0, 1],
 * so no weight can produce runaway scores. Every modification is explained
 * in the returned breakdown.
 */
export function applyLearningInfluence(
  base: ScoredDimension[],
  influences: LearningInfluence[]
): InfluenceApplication {
  const applied: LearningInfluence[] = [];
  const ignored: Array<{ dimension: string; reason: string }> = [];
  const byDimension = new Map<string, number>();
  const reasons = new Map<string, string[]>();
  const proposalIds = new Map<string, string[]>();

  for (const influence of influences) {
    const adjustment = Number(influence.adjustment);
    if (!Number.isFinite(adjustment) || adjustment === 0 || Math.abs(adjustment) > 0.2) {
      ignored.push({ dimension: influence.dimension, reason: `Proposal ${influence.proposalId} ignored: adjustment out of bounds.` });
      continue;
    }
    byDimension.set(influence.dimension, (byDimension.get(influence.dimension) ?? 0) + adjustment);
    const list = reasons.get(influence.dimension) ?? [];
    list.push(influence.reason);
    reasons.set(influence.dimension, list);
    const ids = proposalIds.get(influence.dimension) ?? [];
    ids.push(influence.proposalId);
    proposalIds.set(influence.dimension, ids);
    applied.push(influence);
  }

  const dimensions = base.map((dim) => {
    const total = byDimension.get(dim.name) ?? 0;
    const clamped = Math.min(0.2, Math.max(-0.2, total));
    return {
      ...dim,
      baseScore: dim.score,
      appliedAdjustment: Math.round(clamped * 100) / 100,
      score: clamp01(Math.round((dim.score + clamped) * 100) / 100),
      reason: clamped !== 0
        ? `${dim.reason} Workspace-confirmed learning adjustment ${clamped > 0 ? '+' : ''}${clamped}: ${(reasons.get(dim.name) ?? []).join(' ')}`
        : dim.reason,
    };
  });

  for (const [dimension] of byDimension) {
    if (!base.some((d) => d.name === dimension)) {
      ignored.push({ dimension, reason: 'No matching base dimension; influence not applied.' });
    }
  }

  const overallScore = dimensions.length > 0
    ? Math.round((dimensions.reduce((a, d) => a + d.score, 0) / dimensions.length) * 100) / 100
    : 0;

  return { dimensions, applied, ignored, overallScore };
}

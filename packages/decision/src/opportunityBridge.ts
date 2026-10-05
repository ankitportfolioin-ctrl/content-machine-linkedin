import { Candidate, ScoredAction, ActionKind, EvidenceLink } from './types';
import { scoreCandidate, rankScored } from './scoring';
import { LearningInfluence } from '@growth-operator/learning';

export interface ContentOpportunityWithRelations {
  id: string;
  workspaceId: string;
  topicId: string;
  title: string;
  thesis: string;
  problem: string;
  audience: string;
  angle: string;
  objective: string;
  contentFormat: string | null;
  opportunityScore: number;
  status: string;
  sourceIds: string[] | null;
  claimIds: string[] | null;
  trendSignalIds: string[] | null;
  reasoning: string;
  evidenceSummary: string;
  originKind: string | null;
  originId: string | null;
  createdAt: Date;
  updatedAt: Date;
  topic: {
    id: string;
    name: string;
    canonicalName: string;
    description: string | null;
  } | null;
}

export interface OpportunityCandidateInput {
  opportunity: ContentOpportunityWithRelations;
  workspaceId: string;
  now?: number;
}

/**
 * Convert a ContentOpportunity from the intelligence package into a Candidate
 * for the Decision Engine scoring pipeline.
 * 
 * This ensures opportunities are scored using the existing Decision Engine
 * code path (no parallel ranking function).
 */
export function opportunityToCandidate(input: OpportunityCandidateInput): Candidate {
  const { opportunity, workspaceId, now = Date.now() } = input;
  const waitingDays = Math.floor((now - opportunity.createdAt.getTime()) / 86400000);

  const sourceCount = (opportunity.sourceIds as string[] | null)?.length ?? 0;
  const claimCount = (opportunity.claimIds as string[] | null)?.length ?? 0;
  const trendSignalCount = (opportunity.trendSignalIds as string[] | null)?.length ?? 0;
  const totalEvidenceCount = sourceCount + claimCount + trendSignalCount;

  const evidenceLinks: EvidenceLink[] = [
    ...((opportunity.sourceIds as string[] | null)?.map(id => ({ label: `Source ${id.slice(0, 8)}`, ref: id })) || []),
    ...((opportunity.claimIds as string[] | null)?.map(id => ({ label: `Claim ${id.slice(0, 8)}`, ref: id })) || []),
    ...((opportunity.trendSignalIds as string[] | null)?.map(id => ({ label: `Trend ${id.slice(0, 8)}`, ref: id })) || []),
  ];

  return {
    kind: 'content_opportunity' as ActionKind,
    identityKey: `opportunity:${opportunity.id}`,
    subjectId: opportunity.topicId,
    title: opportunity.title,
    createdAt: opportunity.createdAt,
    facts: {
      waitingDays,
      relevance01: opportunity.opportunityScore ?? 0.5,
      evidenceCount: totalEvidenceCount,
      ready: opportunity.status === 'NEW' || opportunity.status === 'REVIEWED',
      // Must match the content_opportunity collector path (collectors.ts):
      // confirmed learning on these dimensions honestly describes
      // opportunities. This builder is currently uncalled in production;
      // the tags keep it consistent if it is ever wired in.
      learningDimensions: ['relevance', 'evidence_strength'],
      subjectMeta: {
        opportunityId: opportunity.id,
        topicId: opportunity.topicId,
        sourceCount,
        claimCount,
        trendSignalCount,
        opportunityScore: opportunity.opportunityScore,
        thesis: opportunity.thesis,
        problem: opportunity.problem,
        audience: opportunity.audience,
        angle: opportunity.angle,
        objective: opportunity.objective,
        contentFormat: opportunity.contentFormat,
        reasoning: opportunity.reasoning,
        evidenceSummary: opportunity.evidenceSummary,
        originKind: opportunity.originKind,
        originId: opportunity.originId,
      },
    },
    reasons: [
      opportunity.reasoning || 'No reasoning provided',
      opportunity.evidenceSummary ? `Evidence: ${opportunity.evidenceSummary.slice(0, 200)}` : 'No evidence summary',
    ],
    evidenceLinks,
  };
}

/**
 * Score and rank content opportunities using the Decision Engine.
 * This uses the existing scoring pipeline - no parallel ranking function.
 */
export async function scoreAndRankOpportunities(
  opportunities: ContentOpportunityWithRelations[],
  workspaceId: string,
  confirmedLearning: LearningInfluence[],
  now?: number
): Promise<ScoredAction[]> {
  const candidates = opportunities.map(opp => opportunityToCandidate({ opportunity: opp, workspaceId, now }));
  const scored = candidates.map(candidate => scoreCandidate({ candidate, confirmedLearning, now }));
  return rankScored(scored);
}

/**
 * Generate a human-readable "why" explanation for a scored opportunity.
 * Separates signal confidence from recommendation confidence.
 */
export function explainScoredOpportunity(scored: ScoredAction): {
  why: string;
  whyNotAlternatives?: string[];
  signalConfidence: ScoredAction['signalConfidence'];
  recommendationConfidence: ScoredAction['recommendationConfidence'];
} {
  const meta = scored.facts.subjectMeta as Record<string, unknown>;
  const parts: string[] = [];

  // Core reason from scoring dimensions
  for (const dim of scored.dimensions) {
    if (dim.reason) {
      parts.push(dim.reason);
    }
  }

  // Add opportunity-specific context
  if (meta.thesis) {
    parts.push(`Thesis: ${String(meta.thesis).slice(0, 200)}`);
  }
  if (meta.problem) {
    parts.push(`Addresses: ${String(meta.problem).slice(0, 200)}`);
  }
  if (meta.angle) {
    parts.push(`Angle: ${String(meta.angle).slice(0, 200)}`);
  }

  const why = parts.join('; ');

  // Why not alternatives (top 3 other scored actions)
  // Note: This would need to be passed in separately since we only have one scored action here
  // The caller should provide alternatives if needed

  return {
    why,
    signalConfidence: scored.signalConfidence,
    recommendationConfidence: scored.recommendationConfidence,
  };
}
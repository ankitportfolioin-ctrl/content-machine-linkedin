import { QualificationDimension } from './types';

export interface ScoreDimension {
  name: string;
  score: number;
  reason: string;
  evidence: string[];
}

export interface ProspectScore {
  overallScore: number;
  dimensions: ScoreDimension[];
  insufficientData: boolean;
}

/**
 * Transparent prospect score derived from qualification dimensions plus
 * signal/research context. Every dimension exposes score, reason, evidence.
 * Never presented as a probability of conversion.
 */
export function scoreProspect(input: {
  dimensions: QualificationDimension[];
  signalCount?: number;
  researchConfidence?: number | null;
}): ProspectScore {
  const picked = ['icp_fit', 'role_fit', 'company_fit', 'problem_relevance', 'evidence_strength'];
  const dimensions: ScoreDimension[] = input.dimensions
    .filter((d) => picked.includes(d.name))
    .map((d) => ({ name: d.name, score: d.score, reason: d.reason, evidence: d.evidence.slice(0, 3) }));

  const signalCount = input.signalCount ?? 0;
  dimensions.push({
    name: 'timeliness',
    score: signalCount === 0 ? 0.4 : Math.min(1, 0.6 + signalCount * 0.15),
    reason: signalCount === 0 ? 'No buying signals observed.' : `${signalCount} buying signal(s) observed.`,
    evidence: [],
  });

  const researchConfidence = input.researchConfidence ?? null;
  dimensions.push({
    name: 'research_completeness',
    score: researchConfidence ?? input.dimensions.find((d) => d.name === 'research_completeness')?.score ?? 0,
    reason: researchConfidence === null ? 'Research confidence unknown.' : `Research confidence ${(researchConfidence * 100).toFixed(0)}%.`,
    evidence: [],
  });

  const missingCritical = dimensions.filter((d) => d.score <= 0.3).length >= 3;
  const overallScore = Math.round((dimensions.reduce((a, d) => a + d.score, 0) / Math.max(1, dimensions.length)) * 100) / 100;
  return { overallScore, dimensions, insufficientData: missingCritical };
}

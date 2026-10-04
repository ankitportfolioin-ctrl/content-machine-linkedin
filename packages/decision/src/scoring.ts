import { Candidate, ScoredAction, ScoreDimension } from './types';
import { LearningInfluence } from '@growth-operator/learning';
import { calculateFreshness, FreshnessResult } from '@growth-operator/shared';

const MAX_POINTS = { urgency: 30, relevance: 25, evidence_strength: 20, readiness: 15, freshness: 10, learning_boost: 10, attribution: 5 } as const;

type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

function daysSince(date: Date, now: number): number {
  return Math.max(0, Math.floor((now - date.getTime()) / 86400000));
}

function urgencyFor(candidate: Candidate, now: number): { points: number; reason: string | null } {
  const waiting = candidate.facts.waitingDays ?? 0;
  if (candidate.kind === 'content_review' || candidate.kind === 'outreach_review') {
    const points = Math.min(30, 12 + waiting * 2);
    return { points, reason: `Awaiting review for ${waiting} day(s).` };
  }
  if (candidate.kind === 'prepared_action') return { points: 24, reason: 'Prepared action is ready for authorization.' };
  if (candidate.kind === 'follow_up') return { points: 20, reason: 'Recommended follow-up is pending.' };
  if (candidate.kind === 'learning_proposal') {
    const points = Math.min(30, 8 + waiting);
    return { points, reason: `Learning proposal awaiting confirmation for ${waiting} day(s).` };
  }
  if (candidate.kind === 'stale_draft') {
    const points = Math.min(30, 5 + waiting);
    return { points: waiting >= 14 ? points : 0, reason: waiting >= 14 ? `Draft idle ${waiting} days.` : null };
  }
  if (candidate.kind === 'source_issue') {
    const points = Math.min(30, 14 + waiting * 2);
    return { points, reason: 'A research input is failing; intelligence is degraded until it recovers.' };
  }
  void now;
  return { points: 4, reason: null };
}

function relevanceFor(candidate: Candidate): { points: number; reason: string | null } {
  const relevance = candidate.facts.relevance01;
  const meta = candidate.facts.subjectMeta;
  const matches = Array.isArray(meta?.objectiveMatches) ? meta.objectiveMatches : [];
  const configured = meta?.objectivesConfigured === true;
  let points: number;
  let reason: string | null;
  if (relevance === undefined) {
    points = 8;
    reason = 'Relevance assessed qualitatively.';
  } else {
    points = Math.round(relevance * 25);
    reason = points >= 15 ? `High relevance score (${(relevance * 100).toFixed(0)}%).` : null;
  }
  // Objective alignment folds into the existing relevance dimension (no new
  // dimension, no rescaling): supporting a configured objective earns a
  // bounded bonus with a stated reason; a configured-but-unmatched workspace
  // costs a small, reasoned deduction. Candidates without enrichment markers
  // (unit tests, legacy callers) score exactly as before.
  if (matches.length > 0) {
    const levels = [...new Set(matches.map((m) => String(m.level)))].join('/');
    const goals = matches.map((m) => `"${String(m.goal).slice(0, 80)}"`).join('; ');
    points = Math.min(25, points + 5);
    reason = [reason, `Supports ${levels} objective(s): ${goals}.`].filter(Boolean).join(' ');
  } else if (configured) {
    points = Math.max(0, points - 3);
  }
  return { points, reason };
}

function evidenceFor(candidate: Candidate): { points: number; reason: string | null } {
  const count = candidate.facts.evidenceCount ?? 0;
  if (count <= 0) return { points: 4, reason: null };
  const points = Math.min(20, 8 + count * 2);
  return { points, reason: `${count} evidence reference(s) attached.` };
}

function readinessFor(candidate: Candidate): { points: number; reason: string | null } {
  if (candidate.facts.ready) return { points: 15, reason: 'Directly actionable in an existing workflow.' };
  return { points: 6, reason: null };
}

function freshnessFor(candidate: Candidate, now: number): { points: number; reason: string | null; freshnessResult: FreshnessResult } {
  const isCritical = candidate.facts.evidenceCount !== undefined && candidate.facts.evidenceCount >= 3;
  const evidenceStrength = candidate.facts.relevance01 ?? 0;
  const result = calculateFreshness(candidate.createdAt, now, {
    isCriticalEvidence: isCritical,
    evidenceStrength,
  });
  const points = Math.round(result.factor * 10);
  return { points, reason: result.reason, freshnessResult: result };
}

function learningFor(
  candidate: Candidate,
  confirmed: LearningInfluence[]
): { points: number; reason: string | null; applied: ScoredAction['learningApplied'] } {
  const tags = candidate.facts.learningDimensions ?? [];
  if (tags.length === 0 || confirmed.length === 0) return { points: 0, reason: null, applied: [] };
  const matching = confirmed.filter((c) => tags.includes(c.dimension));
  if (matching.length === 0) return { points: 0, reason: null, applied: [] };
  const total = matching.reduce((a, c) => a + c.adjustment, 0);
  const points = Math.min(10, Math.max(0, Math.round(total * 50)));
  return {
    points,
    reason: points > 0 ? `Workspace-confirmed learning on ${matching.map((c) => c.dimension).join(', ')} supports this action.` : null,
    applied: matching.map((c) => ({ dimension: c.dimension, adjustment: c.adjustment, reason: c.reason, proposalId: c.proposalId })),
  };
}

function attributionFor(candidate: Candidate): { points: number; reason: string | null; strongest?: string } {
  const attribution = candidate.facts.subjectMeta?.attribution as
    | { strongest?: string; linkCount?: number; reason?: string | null; target?: string }
    | undefined;
  if (!attribution || !attribution.strongest) return { points: 0, reason: null, strongest: undefined };
  if (attribution.strongest === 'DIRECT') {
    return { points: 5, reason: `DIRECT attribution on ${attribution.target} (${attribution.linkCount} link(s)).`, strongest: 'DIRECT' };
  }
  if (attribution.strongest === 'INFERRED') {
    return { points: 2, reason: `INFERRED attribution on ${attribution.target} (${attribution.linkCount} link(s)).`, strongest: 'INFERRED' };
  }
  return { points: 0, reason: null, strongest: undefined };
}

function computeSignalConfidence(candidate: Candidate, dimensions: ScoreDimension[], now: number): ConfidenceLevel {
  const evidenceDim = dimensions.find(d => d.name === 'evidence_strength');
  const freshnessDim = dimensions.find(d => d.name === 'freshness');
  const evidencePoints = evidenceDim?.points ?? 0;
  const freshnessPoints = freshnessDim?.points ?? 0;
  const evidenceCount = candidate.facts.evidenceCount ?? 0;
  const ageDays = daysSince(candidate.createdAt, now);

  if (evidenceCount === 0) return 'UNKNOWN';
  if (evidenceCount >= 3 && freshnessPoints >= 6 && evidencePoints >= 15) return 'HIGH';
  if (evidenceCount >= 2 && freshnessPoints >= 6 && evidencePoints >= 10) return 'MEDIUM';
  if (evidenceCount >= 1 && freshnessPoints >= 2) return 'LOW';
  return 'UNKNOWN';
}

function computeRecommendationConfidence(candidate: Candidate, dimensions: ScoreDimension[]): ConfidenceLevel {
  const relevanceDim = dimensions.find(d => d.name === 'relevance');
  const readinessDim = dimensions.find(d => d.name === 'readiness');
  const evidenceDim = dimensions.find(d => d.name === 'evidence_strength');
  const relevancePoints = relevanceDim?.points ?? 0;
  const readinessPoints = readinessDim?.points ?? 0;
  const evidencePoints = evidenceDim?.points ?? 0;
  const hasRelevance = candidate.facts.relevance01 !== undefined;
  const isReady = candidate.facts.ready === true;

  if (isReady && relevancePoints >= 20 && evidencePoints >= 15) return 'HIGH';
  if ((isReady || hasRelevance) && relevancePoints >= 15 && evidencePoints >= 10) return 'MEDIUM';
  if (relevancePoints >= 8 || readinessPoints >= 10 || evidencePoints >= 8) return 'LOW';
  return 'UNKNOWN';
}

export interface ScoreInput {
  candidate: Candidate;
  confirmedLearning: LearningInfluence[];
  now?: number;
}

/**
 * Centralized deterministic scorer. Bounded 0–100, reproducible for identical
 * inputs. Dimensions with no source data are omitted (contribute 0 with no
 * reason) rather than manufactured. Ties are resolved by the caller via
 * createdAt, then id.
 */
export function scoreCandidate({ candidate, confirmedLearning, now = Date.now() }: ScoreInput): ScoredAction {
  const dimensions: ScoreDimension[] = [];
  const push = (name: ScoreDimension['name'], maxPoints: number, result: { points: number; reason: string | null }) => {
    dimensions.push({ name, points: Math.max(0, Math.min(maxPoints, Math.round(result.points))), maxPoints, reason: result.reason });
  };

  push('urgency', MAX_POINTS.urgency, urgencyFor(candidate, now));
  push('relevance', MAX_POINTS.relevance, relevanceFor(candidate));
  push('evidence_strength', MAX_POINTS.evidence_strength, evidenceFor(candidate));
  push('readiness', MAX_POINTS.readiness, readinessFor(candidate));
  const freshnessResult = freshnessFor(candidate, now);
  push('freshness', MAX_POINTS.freshness, { points: freshnessResult.points, reason: freshnessResult.reason });
  const learning = learningFor(candidate, confirmedLearning);
  push('learning_boost', MAX_POINTS.learning_boost, { points: learning.points, reason: learning.reason });
  const attribution = attributionFor(candidate);
  // Only include attribution dimension when there's actual attribution data
  // (per design: dimensions with no source data are omitted, not manufactured)
  if (attribution.strongest) {
    push('attribution', MAX_POINTS.attribution, { points: attribution.points, reason: attribution.reason });
  }

  const score = dimensions.reduce((a, d) => a + d.points, 0);
  const reasons = [...candidate.reasons, ...dimensions.map((d) => d.reason).filter((r): r is string => r !== null)];

  const signalConfidence = computeSignalConfidence(candidate, dimensions, now);
  const recommendationConfidence = computeRecommendationConfidence(candidate, dimensions);

  return {
    ...candidate,
    score: Math.max(0, Math.min(100, score)),
    dimensions,
    reasons,
    learningApplied: learning.applied,
    signalConfidence,
    recommendationConfidence,
  };
}

export function rankScored(actions: ScoredAction[]): ScoredAction[] {
  return [...actions].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const time = a.createdAt.getTime() - b.createdAt.getTime();
    if (time !== 0) return time;
    return a.identityKey.localeCompare(b.identityKey);
  });
}
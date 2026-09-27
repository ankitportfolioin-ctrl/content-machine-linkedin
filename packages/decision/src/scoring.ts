import { Candidate, ScoredAction, ScoreDimension } from './types';
import { LearningInfluence } from '@growth-operator/learning';

const MAX_POINTS = { urgency: 30, relevance: 25, evidence_strength: 20, readiness: 15, freshness: 10, learning_boost: 10 } as const;

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
  void now;
  return { points: 4, reason: null };
}

function relevanceFor(candidate: Candidate): { points: number; reason: string | null } {
  const relevance = candidate.facts.relevance01;
  if (relevance === undefined) return { points: 8, reason: 'Relevance assessed qualitatively.' };
  const points = Math.round(relevance * 25);
  return { points, reason: points >= 15 ? `High relevance score (${(relevance * 100).toFixed(0)}%).` : null };
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

function freshnessFor(candidate: Candidate, now: number): { points: number; reason: string | null } {
  const ageDays = daysSince(candidate.createdAt, now);
  if (ageDays <= 7) return { points: 10, reason: 'Created within the last 7 days.' };
  if (ageDays <= 30) return { points: 6, reason: null };
  return { points: 2, reason: null };
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
  push('freshness', MAX_POINTS.freshness, freshnessFor(candidate, now));
  const learning = learningFor(candidate, confirmedLearning);
  push('learning_boost', MAX_POINTS.learning_boost, { points: learning.points, reason: learning.reason });

  const score = dimensions.reduce((a, d) => a + d.points, 0);
  const reasons = [...candidate.reasons, ...dimensions.map((d) => d.reason).filter((r): r is string => r !== null)];

  return {
    ...candidate,
    score: Math.max(0, Math.min(100, score)),
    dimensions,
    learningApplied: learning.applied,
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

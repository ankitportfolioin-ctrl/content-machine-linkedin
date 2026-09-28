import { PrismaClient } from '@prisma/client';

/**
 * Opportunity-feedback aggregation and ranking demotion.
 *
 * OpportunityFeedback rows are human votes recorded from the Brain opportunity
 * UI. This module is the ONE authoritative place that turns those rows into
 * (a) a displayable summary and (b) a bounded ranking adjustment. It never
 * writes, never calls AI, never touches learning, and never deletes or
 * suppresses opportunities — demotion only, floored at zero.
 *
 * Demotion rule (pinned, deterministic):
 * - Only the five negative types count: NOT_USEFUL, ALREADY_COVERED,
 *   WRONG_AUDIENCE, WEAK_EVIDENCE, NOT_TIMELY. USEFUL votes are counted and
 *   displayed but never penalize.
 * - Votes are counted per row (the API permits repeat votes); the cap below
 *   makes stacking safe.
 * - penalty = min(MAX_FEEDBACK_PENALTY, negativeVotes × FEEDBACK_PENALTY_STEP)
 * - ranked = max(0, round2(base − penalty))
 * Consequences: zero feedback → penalty 0 → ranked == base exactly; one vote
 * moves at most one STEP (cannot bury); the MAX cap bounds noisy pile-ons;
 * ranked never goes negative, and the opportunity row itself is untouched.
 */

export const FEEDBACK_TYPES = [
  'USEFUL',
  'NOT_USEFUL',
  'ALREADY_COVERED',
  'WRONG_AUDIENCE',
  'WEAK_EVIDENCE',
  'NOT_TIMELY',
] as const;

export type FeedbackTypeValue = (typeof FEEDBACK_TYPES)[number];

/** Types that contribute to demotion. USEFUL is deliberately absent. */
export const NEGATIVE_FEEDBACK: ReadonlySet<string> = new Set([
  'NOT_USEFUL',
  'ALREADY_COVERED',
  'WRONG_AUDIENCE',
  'WEAK_EVIDENCE',
  'NOT_TIMELY',
]);

/** Ranking points (0–1 scale) subtracted per negative vote. */
export const FEEDBACK_PENALTY_STEP = 0.05;
/** Hard ceiling on the total penalty, however many votes arrive. */
export const MAX_FEEDBACK_PENALTY = 0.2;
/** Max reasons carried in a summary (newest first). */
export const MAX_FEEDBACK_REASONS = 10;

export interface FeedbackRow {
  feedback: string;
  reason: string | null;
  createdAt: Date;
}

export interface FeedbackReason {
  feedback: string;
  reason: string;
  createdAt: string;
}

export interface FeedbackSummary {
  total: number;
  counts: Record<FeedbackTypeValue, number>;
  reasons: FeedbackReason[];
}

export interface FeedbackDemotion {
  negativeVotes: number;
  penalty: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyCounts(): Record<FeedbackTypeValue, number> {
  return {
    USEFUL: 0,
    NOT_USEFUL: 0,
    ALREADY_COVERED: 0,
    WRONG_AUDIENCE: 0,
    WEAK_EVIDENCE: 0,
    NOT_TIMELY: 0,
  };
}

/**
 * Deterministic aggregation of feedback rows for ONE opportunity. Unknown
 * feedback strings (never produced by current validation, but possible from
 * older data) are ignored rather than misclassified. Empty/null reasons are
 * dropped, never rendered as fake text.
 */
export function summarizeFeedback(rows: FeedbackRow[]): FeedbackSummary {
  const counts = emptyCounts();
  let total = 0;
  const reasons: Array<FeedbackReason & { at: number }> = [];
  for (const row of rows) {
    if (!(FEEDBACK_TYPES as readonly string[]).includes(row.feedback)) continue;
    counts[row.feedback as FeedbackTypeValue] += 1;
    total += 1;
    if (typeof row.reason === 'string' && row.reason.trim().length > 0) {
      reasons.push({
        feedback: row.feedback,
        reason: row.reason,
        createdAt: row.createdAt.toISOString(),
        at: row.createdAt.getTime(),
      });
    }
  }
  reasons.sort((a, b) => b.at - a.at || a.reason.localeCompare(b.reason));
  return {
    total,
    counts,
    reasons: reasons
      .slice(0, MAX_FEEDBACK_REASONS)
      .map(({ feedback, reason, createdAt }) => ({ feedback, reason, createdAt })),
  };
}

/** Bounded penalty from an aggregated summary. Zero feedback → zero penalty. */
export function feedbackDemotion(summary: FeedbackSummary): FeedbackDemotion {
  let negativeVotes = 0;
  for (const type of NEGATIVE_FEEDBACK) {
    negativeVotes += summary.counts[type as FeedbackTypeValue] ?? 0;
  }
  return {
    negativeVotes,
    penalty: Math.min(MAX_FEEDBACK_PENALTY, round2(negativeVotes * FEEDBACK_PENALTY_STEP)),
  };
}

/**
 * Applies the bounded demotion to a 0–1 base score. The base is never mutated
 * in place semantics: callers keep it for display while ranking on `ranked`.
 */
export function applyFeedbackDemotion(
  baseScore01: number,
  summary: FeedbackSummary
): { rankedScore: number; penalty: number; negativeVotes: number } {
  const { negativeVotes, penalty } = feedbackDemotion(summary);
  return {
    rankedScore: Math.max(0, round2(baseScore01 - penalty)),
    penalty,
    negativeVotes,
  };
}

function toRowShapes(rows: Array<{ feedback: string; reason: string | null; createdAt: Date }>): FeedbackRow[] {
  return rows.map((r) => ({ feedback: r.feedback, reason: r.reason, createdAt: r.createdAt }));
}

/**
 * Workspace-scoped summary read for ONE live opportunity. Callers must have
 * verified the opportunity exists first (404 otherwise); orphaned rows that
 * reference deleted opportunities are therefore unreachable here — they can
 * only be read by passing a live opportunity id.
 */
export async function fetchFeedbackSummary(
  prisma: PrismaClient,
  workspaceId: string,
  opportunityId: string
): Promise<FeedbackSummary> {
  const rows = await prisma.opportunityFeedback.findMany({
    where: { workspaceId, opportunityId },
    select: { feedback: true, reason: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 500,
  });
  return summarizeFeedback(toRowShapes(rows));
}

/**
 * Single-query batch variant for ranked surfaces (e.g. the operator
 * collector): summaries keyed by opportunity id. Ids with no rows map to an
 * honest empty summary (penalty 0).
 */
export async function fetchFeedbackSummaries(
  prisma: PrismaClient,
  workspaceId: string,
  opportunityIds: string[]
): Promise<Map<string, FeedbackSummary>> {
  const out = new Map<string, FeedbackSummary>();
  const ids = [...new Set(opportunityIds)];
  for (const id of ids) {
    out.set(id, summarizeFeedback([]));
  }
  if (ids.length === 0) return out;
  const rows = await prisma.opportunityFeedback.findMany({
    where: { workspaceId, opportunityId: { in: ids } },
    select: { opportunityId: true, feedback: true, reason: true, createdAt: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    take: 2000,
  });
  const grouped = new Map<string, FeedbackRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.opportunityId) ?? [];
    list.push({ feedback: row.feedback, reason: row.reason, createdAt: row.createdAt });
    grouped.set(row.opportunityId, list);
  }
  for (const [id, list] of grouped) {
    out.set(id, summarizeFeedback(list));
  }
  return out;
}

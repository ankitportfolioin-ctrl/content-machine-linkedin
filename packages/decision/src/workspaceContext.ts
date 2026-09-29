import { PrismaClient } from '@prisma/client';

export type ObjectiveLevel = 'BUSINESS' | 'CONTENT' | 'SALES';

export interface ObjectiveView {
  level: ObjectiveLevel;
  goal: string;
  metric?: string | null;
  target?: number | null;
  pillar?: string | null;
  format?: string | null;
  segment?: string | null;
  productId?: string | null;
  deadline?: string | null;
}

export type AttributionStrength = 'DIRECT' | 'INFERRED' | 'UNKNOWN';

export interface AttributionView {
  targetType: string;
  targetId: string;
  strongest: AttributionStrength;
  linkCount: number;
  reason: string | null;
  evidenceRefs: string[];
}

export interface AudienceSignalView {
  id: string;
  signalType: string;
  source: string;
  description: string;
  strength: number;
  createdAt: Date;
  audienceSegmentId: string | null;
}

/** Follow-up recommendations that suppress new outreach initiation. */
const OUTREACH_BLOCKING_FOLLOW_UPS = new Set([
  'NO_OUTREACH',
  'DISMISS',
  'CLOSE_OUT',
  'NO_FOLLOW_UP',
]);

const LEAD_CLOSED_STATUSES = new Set(['DISQUALIFIED', 'CLOSED']);

export interface LeadStateView {
  leadId: string;
  status: string;
  closed: boolean;
  qualificationStatus: string | null;
  hasApprovedStrategy: boolean;
  hasSubmittedReview: boolean;
  hasReadyAction: boolean;
  /** Latest follow-up recommendation, if any. */
  latestFollowUp: string | null;
  /** Set when the latest follow-up suppresses outreach initiation. */
  outreachBlockedBy: string | null;
}

export interface WorkspaceContext {
  objectives: ObjectiveView[];
  attributions: Map<string, AttributionView>;
  leadStates: Map<string, LeadStateView>;
  topics: Map<string, string>;
  audienceSignals: Map<string, AudienceSignalView[]>;
}

function attributionKey(targetType: string, targetId: string): string {
  return `${targetType}:${targetId}`;
}

/** Mirrors RANK in packages/business/src/attribution.ts (canonical). */
function strongerThan(a: AttributionStrength, b: AttributionStrength): boolean {
  const rank: Record<AttributionStrength, number> = { UNKNOWN: 0, INFERRED: 1, DIRECT: 2 };
  return rank[a] > rank[b];
}

interface GoalRow {
  goal?: unknown;
  metric?: unknown;
  target?: unknown;
  pillar?: unknown;
  format?: unknown;
  segment?: unknown;
  productId?: unknown;
  deadline?: unknown;
}

function toObjectiveViews(raw: unknown, level: ObjectiveLevel): ObjectiveView[] {
  if (!Array.isArray(raw)) return [];
  const out: ObjectiveView[] = [];
  for (const entry of raw as GoalRow[]) {
    if (!entry || typeof entry !== 'object') continue;
    const goal = typeof entry.goal === 'string' ? entry.goal.trim() : '';
    if (!goal) continue;
    const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    out.push({
      level,
      goal,
      metric: str(entry.metric),
      target: num(entry.target),
      pillar: str(entry.pillar),
      format: str(entry.format),
      segment: str(entry.segment),
      productId: str(entry.productId),
      deadline: str(entry.deadline),
    });
  }
  return out;
}

/**
 * One batched read of the workspace state the decision engine reasons
 * about: objectives (Batch 1), attribution links (Batch 2), lead lifecycle
 * state, and topic names. All queries are workspace-scoped and capped, so a
 * large workspace cannot blow up the refresh. Callers must treat an empty
 * section as "no data" (honest uncertainty), never as a positive signal.
 */
export async function readWorkspaceContext(
  prisma: PrismaClient,
  workspaceId: string
): Promise<WorkspaceContext> {
  const [strategy, links, leads, qualifications, approvedStrategies, submittedReviews, readyActions, followUps, topics, audienceSignals] =
    await Promise.all([
      prisma.strategyProfile.findUnique({ where: { workspaceId } }),
      prisma.attributionLink.findMany({
        where: { workspaceId },
        orderBy: { recordedAt: 'desc' },
        take: 200,
      }),
      prisma.lead.findMany({
        where: { workspaceId },
        select: { id: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      prisma.qualificationResult.findMany({
        where: { workspaceId },
        select: { leadId: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      }),
      prisma.outreachStrategy.findMany({
        where: { workspaceId, status: 'APPROVED' },
        select: { leadId: true },
        take: 200,
      }),
      prisma.outreachReview.findMany({
        where: { workspaceId, status: 'SUBMITTED' },
        select: { draft: { select: { leadId: true } } },
        take: 200,
      }),
      prisma.preparedAction.findMany({
        where: { workspaceId, status: 'READY_FOR_AUTHORIZED_EXECUTION' },
        select: { draft: { select: { leadId: true } } },
        take: 200,
      }),
      prisma.followUpRecommendation.findMany({
        where: { workspaceId },
        select: { leadId: true, recommendation: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.topic.findMany({
        where: { workspaceId },
        select: { id: true, name: true },
        take: 200,
      }),
      prisma.audienceSignal.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);

  const objectives: ObjectiveView[] = strategy
    ? [
        ...toObjectiveViews((strategy as { businessGoals?: unknown }).businessGoals, 'BUSINESS'),
        ...toObjectiveViews((strategy as { audienceGoals?: unknown }).audienceGoals, 'BUSINESS'),
        ...toObjectiveViews((strategy as { growthGoals?: unknown }).growthGoals, 'BUSINESS'),
        ...toObjectiveViews((strategy as { productGoals?: unknown }).productGoals, 'BUSINESS'),
        ...toObjectiveViews((strategy as { contentGoals?: unknown }).contentGoals, 'CONTENT'),
        ...toObjectiveViews((strategy as { salesGoals?: unknown }).salesGoals, 'SALES'),
      ]
    : [];

  const attributions = new Map<string, AttributionView>();
  for (const link of links as Array<{
    targetType: string;
    targetId: string;
    attributionType: string;
    reason: string | null;
    evidenceRefs: string[];
  }>) {
    const key = attributionKey(link.targetType, link.targetId);
    const level: AttributionStrength =
      link.attributionType === 'DIRECT' || link.attributionType === 'INFERRED' ? link.attributionType : 'UNKNOWN';
    const prev = attributions.get(key);
    if (!prev) {
      attributions.set(key, {
        targetType: link.targetType,
        targetId: link.targetId,
        strongest: level,
        linkCount: 1,
        reason: link.reason,
        evidenceRefs: [...link.evidenceRefs],
      });
    } else {
      prev.linkCount += 1;
      if (strongerThan(level, prev.strongest)) {
        prev.strongest = level;
        prev.reason = link.reason;
        prev.evidenceRefs = [...link.evidenceRefs];
      }
    }
  }

  const qualificationByLead = new Map<string, string>();
  for (const q of qualifications as Array<{ leadId: string | null; status: string }>) {
    if (q.leadId && !qualificationByLead.has(q.leadId)) qualificationByLead.set(q.leadId, q.status);
  }
  const approvedLeadIds = new Set(
    (approvedStrategies as Array<{ leadId: string | null }>).map((s) => s.leadId).filter((v): v is string => !!v)
  );
  const submittedReviewLeadIds = new Set(
    (submittedReviews as Array<{ draft: { leadId: string | null } | null }>)
      .map((r) => r.draft?.leadId ?? null)
      .filter((v): v is string => !!v)
  );
  const readyActionLeadIds = new Set(
    (readyActions as Array<{ draft: { leadId: string | null } | null }>)
      .map((r) => r.draft?.leadId ?? null)
      .filter((v): v is string => !!v)
  );
  const latestFollowUpByLead = new Map<string, string>();
  for (const f of followUps as Array<{ leadId: string | null; recommendation: string }>) {
    if (f.leadId && !latestFollowUpByLead.has(f.leadId)) latestFollowUpByLead.set(f.leadId, f.recommendation);
  }

  const leadStates = new Map<string, LeadStateView>();
  for (const lead of leads as Array<{ id: string; status: string }>) {
    const latestFollowUp = latestFollowUpByLead.get(lead.id) ?? null;
    leadStates.set(lead.id, {
      leadId: lead.id,
      status: lead.status,
      closed: LEAD_CLOSED_STATUSES.has(lead.status),
      qualificationStatus: qualificationByLead.get(lead.id) ?? null,
      hasApprovedStrategy: approvedLeadIds.has(lead.id),
      hasSubmittedReview: submittedReviewLeadIds.has(lead.id),
      hasReadyAction: readyActionLeadIds.has(lead.id),
      latestFollowUp,
      outreachBlockedBy: latestFollowUp && OUTREACH_BLOCKING_FOLLOW_UPS.has(latestFollowUp) ? latestFollowUp : null,
    });
  }

  const topicNames = new Map<string, string>();
  for (const t of topics as Array<{ id: string; name: string }>) topicNames.set(t.id, t.name);

  const audienceSignalsBySegment = new Map<string, AudienceSignalView[]>();
  for (const signal of audienceSignals as Array<{
    id: string;
    audienceSegmentId: string | null;
    signalType: string;
    source: string;
    description: string;
    strength: number;
    createdAt: Date;
  }>) {
    const segmentKey = signal.audienceSegmentId ?? 'unassigned';
    const existing = audienceSignalsBySegment.get(segmentKey) ?? [];
    existing.push({
      id: signal.id,
      signalType: signal.signalType,
      source: signal.source,
      description: signal.description,
      strength: signal.strength,
      createdAt: signal.createdAt,
      audienceSegmentId: signal.audienceSegmentId,
    });
    audienceSignalsBySegment.set(segmentKey, existing);
  }

  return { objectives, attributions, leadStates, topics: topicNames, audienceSignals: audienceSignalsBySegment };
}

export function attributionLookup(ctx: WorkspaceContext, targetType: string, targetId: string): AttributionView | null {
  return ctx.attributions.get(attributionKey(targetType, targetId)) ?? null;
}

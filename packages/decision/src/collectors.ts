import { PrismaClient } from '@prisma/client';
import { Candidate } from './types';
import { objectionPatterns, prospectRelevance } from './signals';

const id = (kind: string, subjectId: string) => `${kind}:${subjectId}`;
const daysSince = (date: Date, now: number) => Math.max(0, Math.floor((now - date.getTime()) / 86400000));

interface OpportunityRow {
  id: string; topicId: string; title: string; thesis: string; opportunityScore: number;
  sourceIds: unknown; claimIds: unknown; status: string; createdAt: Date;
}
interface GapRow {
  id: string; description: string; gapType: string; topicId: string; importanceScore: number; createdAt: Date;
}
interface TrendRow {
  id: string; topicId: string; status: string; sourceCount: number; recencyScore: number; calculatedAt: Date;
}
interface ContentReviewRow {
  id: string; draftId: string; createdAt: Date;
  draft: { id: string; contentIdeaId: string; contentIdea: { id: string; title: string } };
}
interface OutreachReviewRow {
  id: string; draftId: string; createdAt: Date;
  draft: { id: string; strategyId: string; leadId: string | null };
}
interface FollowUpRow {
  id: string; recommendation: string; why: string; evidence: string | null; createdAt: Date;
  conversationId: string | null; leadId: string | null;
  conversation: { id: string; leadId: string; subject: string | null } | null;
  lead: { id: string; name: string } | null;
}
interface PreparedActionRow {
  id: string; actionType: string; target: string | null; draftId: string | null;
  approvalId: string | null; status: string; createdAt: Date;
}
interface LearningProposalRow {
  id: string; dimension: string; proposedAdjustment: number; reason: string;
  sampleSize: number; denominator: number | null; status: string; createdAt: Date;
  sourceMetricIds: string[];
}
interface StaleDraftRow {
  id: string; contentIdeaId: string; updatedAt: Date;
  contentIdea: { id: string; title: string };
  versions: Array<{ id: string }>;
  reviews: Array<{ status: string }>;
}

/** Normalize a source score of unknown scale (0-1, 0-10, or 0-100) to 0-1. */
export function normalize01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 1) return Math.min(1, Math.max(0, value));
  if (value <= 10) return Math.min(1, Math.max(0, value / 10));
  return Math.min(1, Math.max(0, value / 100));
}

async function contentOpportunities(prisma: PrismaClient, workspaceId: string, now: number): Promise<Candidate[]> {
  const rows = await prisma.contentOpportunity.findMany({
    where: { workspaceId, status: 'NEW' },
    orderBy: { opportunityScore: 'desc' },
    take: 50,
  });
  return rows.map((r: OpportunityRow) => ({
    kind: 'content_opportunity' as const,
    identityKey: id('content_opportunity', r.id),
    subjectId: r.id,
    title: `Review opportunity: ${r.title}`,
    createdAt: r.createdAt,
    facts: {
      relevance01: normalize01(r.opportunityScore),
      evidenceCount: (Array.isArray(r.sourceIds) ? (r.sourceIds as unknown[]).length : 0)
        + (Array.isArray(r.claimIds) ? (r.claimIds as unknown[]).length : 0),
      ready: true,
      learningDimensions: ['relevance', 'evidence_strength'],
      subjectMeta: { opportunityId: r.id, topicId: r.topicId, thesis: r.thesis, opportunityScore: r.opportunityScore },
    },
    reasons: [`Content opportunity scored ${r.opportunityScore} awaits review.`],
    evidenceLinks: [{ label: 'Opportunity', ref: `contentOpportunity:${r.id}` }],
  }));
}

async function contentGaps(prisma: PrismaClient, workspaceId: string): Promise<Candidate[]> {
  const rows = await prisma.contentGap.findMany({
    where: { workspaceId },
    orderBy: { importanceScore: 'desc' },
    take: 20,
  });
  return rows.map((r: GapRow) => ({
    kind: 'content_gap' as const,
    identityKey: id('content_gap', r.id),
    subjectId: r.id,
    title: `Address content gap: ${r.description.slice(0, 120)}`,
    createdAt: r.createdAt,
    facts: {
      relevance01: normalize01(r.importanceScore),
      evidenceCount: 1,
      ready: false,
      learningDimensions: ['relevance'],
      subjectMeta: { gapId: r.id, gapType: r.gapType, topicId: r.topicId },
    },
    reasons: [`Unaddressed ${r.gapType} gap with importance ${r.importanceScore}.`],
    evidenceLinks: [{ label: 'Content gap', ref: `contentGap:${r.id}` }],
  }));
}

async function trendSignals(prisma: PrismaClient, workspaceId: string): Promise<Candidate[]> {
  const rows = await prisma.trendSignal.findMany({
    where: { workspaceId, status: { in: ['TRENDING', 'RELEVANT'] } },
    orderBy: { recencyScore: 'desc' },
    take: 20,
  });
  return rows.map((r: TrendRow) => ({
    kind: 'trend_signal' as const,
    identityKey: id('trend_signal', r.id),
    subjectId: r.id,
    title: `Act on ${r.status.toLowerCase()} trend (${r.sourceCount} sources)`,
    createdAt: r.calculatedAt,
    facts: {
      relevance01: normalize01(r.recencyScore),
      evidenceCount: r.sourceCount,
      ready: false,
      learningDimensions: ['relevance', 'timeliness'],
      subjectMeta: { trendId: r.id, topicId: r.topicId, status: r.status, sourceCount: r.sourceCount },
    },
    reasons: [`${r.status} trend across ${r.sourceCount} source(s) with recency ${(r.recencyScore * 100).toFixed(0)}%.`],
    evidenceLinks: [{ label: 'Trend signal', ref: `trendSignal:${r.id}` }],
  }));
}

async function contentReviews(prisma: PrismaClient, workspaceId: string, now: number): Promise<Candidate[]> {
  const rows = await prisma.contentReview.findMany({
    where: { workspaceId, status: 'SUBMITTED' },
    include: { draft: { include: { contentIdea: { select: { id: true, title: true } } } } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  return rows.map((r: ContentReviewRow) => ({
    kind: 'content_review' as const,
    identityKey: id('content_review', r.id),
    subjectId: r.id,
    title: `Review content draft for "${r.draft.contentIdea.title}"`,
    createdAt: r.createdAt,
    facts: {
      waitingDays: daysSince(r.createdAt, now),
      ready: true,
      learningDimensions: [],
      subjectMeta: { reviewId: r.id, draftId: r.draftId, contentIdeaId: r.draft.contentIdea.id },
    },
    reasons: [`Content review waiting ${daysSince(r.createdAt, now)} day(s).`],
    evidenceLinks: [{ label: 'Review', ref: `contentReview:${r.id}` }],
  }));
}

async function outreachReviews(prisma: PrismaClient, workspaceId: string, now: number): Promise<Candidate[]> {
  const rows = await prisma.outreachReview.findMany({
    where: { workspaceId, status: 'SUBMITTED' },
    include: { draft: { select: { id: true, strategyId: true, leadId: true } } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  return rows.map((r: OutreachReviewRow) => ({
    kind: 'outreach_review' as const,
    identityKey: id('outreach_review', r.id),
    subjectId: r.id,
    title: 'Review outreach draft',
    createdAt: r.createdAt,
    facts: {
      waitingDays: daysSince(r.createdAt, now),
      ready: true,
      learningDimensions: [],
      subjectMeta: { reviewId: r.id, draftId: r.draftId, leadId: r.draft.leadId },
    },
    reasons: [`Outreach review waiting ${daysSince(r.createdAt, now)} day(s).`],
    evidenceLinks: [{ label: 'Review', ref: `outreachReview:${r.id}` }],
  }));
}

async function followUps(prisma: PrismaClient, workspaceId: string): Promise<Candidate[]> {
  const rows = await prisma.followUpRecommendation.findMany({
    where: { workspaceId, recommendation: { notIn: ['NO_FOLLOW_UP', 'CLOSE_OUT'] } },
    include: { conversation: { select: { id: true, leadId: true, subject: true } }, lead: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((r: FollowUpRow) => ({
    kind: 'follow_up' as const,
    identityKey: id('follow_up', r.id),
    subjectId: r.id,
    title: `Follow up: ${r.recommendation.replace(/_/g, ' ').toLowerCase()}${r.lead ? ` — ${r.lead.name}` : ''}`,
    createdAt: r.createdAt,
    facts: {
      ready: true,
      evidenceCount: r.evidence ? 1 : 0,
      learningDimensions: ['timeliness'],
      subjectMeta: { followUpId: r.id, recommendation: r.recommendation, conversationId: r.conversationId, leadId: r.leadId },
    },
    reasons: [`Recommended next step: ${r.recommendation.replace(/_/g, ' ').toLowerCase()}. ${r.why}`],
    evidenceLinks: [{ label: 'Follow-up recommendation', ref: `followUp:${r.id}` }],
  }));
}

async function preparedActions(prisma: PrismaClient, workspaceId: string): Promise<Candidate[]> {
  const rows = await prisma.preparedAction.findMany({
    where: { workspaceId, status: 'READY_FOR_AUTHORIZED_EXECUTION' },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  return rows.map((r: PreparedActionRow) => ({
    kind: 'prepared_action' as const,
    identityKey: id('prepared_action', r.id),
    subjectId: r.id,
    title: `Authorize prepared action: ${r.actionType.replace(/_/g, ' ').toLowerCase()}${r.target ? ` — ${r.target}` : ''}`,
    createdAt: r.createdAt,
    facts: {
      ready: true,
      learningDimensions: [],
      subjectMeta: { actionId: r.id, actionType: r.actionType, target: r.target, draftId: r.draftId, approvalId: r.approvalId },
    },
    reasons: ['Prepared action is ready and awaiting human authorization. Preparing does not execute.'],
    evidenceLinks: [{ label: 'Prepared action', ref: `preparedAction:${r.id}` }],
  }));
}

async function learningProposals(prisma: PrismaClient, workspaceId: string, now: number): Promise<Candidate[]> {
  const rows = await prisma.learningProposal.findMany({
    where: { workspaceId, status: 'PROPOSED' },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  return rows.map((r: LearningProposalRow) => ({
    kind: 'learning_proposal' as const,
    identityKey: id('learning_proposal', r.id),
    subjectId: r.id,
    title: `Confirm learning: ${r.dimension} (${r.proposedAdjustment > 0 ? '+' : ''}${r.proposedAdjustment})`,
    createdAt: r.createdAt,
    facts: {
      waitingDays: daysSince(r.createdAt, now),
      evidenceCount: r.sourceMetricIds.length,
      ready: true,
      learningDimensions: [r.dimension],
      subjectMeta: { proposalId: r.id, dimension: r.dimension, sampleSize: r.sampleSize, denominator: r.denominator },
    },
    reasons: [`Learning proposal on ${r.dimension} awaits confirmation (n=${r.sampleSize}).`],
    evidenceLinks: [{ label: 'Learning proposal', ref: `learningProposal:${r.id}` }],
  }));
}

async function staleDrafts(prisma: PrismaClient, workspaceId: string, now: number): Promise<Candidate[]> {
  const cutoff = new Date(now - 14 * 86400000);
  const rows = await prisma.contentDraft.findMany({
    where: { workspaceId, updatedAt: { lt: cutoff } },
    include: {
      contentIdea: { select: { id: true, title: true } },
      versions: { where: { isFinal: true }, select: { id: true } },
      reviews: { select: { status: true } },
    },
    take: 50,
  });
  const idle = rows.filter(
    (d: { versions: Array<{ id: string }>; reviews: Array<{ status: string }> }) =>
      d.versions.length === 0 && !d.reviews.some((r: { status: string }) => r.status === 'APPROVED' || r.status === 'SUBMITTED')
  );
  return idle.map((d: StaleDraftRow) => ({
    kind: 'stale_draft' as const,
    identityKey: id('stale_draft', d.id),
    subjectId: d.id,
    title: `Resume idle draft for "${d.contentIdea.title}"`,
    createdAt: d.updatedAt,
    facts: {
      waitingDays: daysSince(d.updatedAt, now),
      ready: false,
      learningDimensions: [],
      subjectMeta: { draftId: d.id, contentIdeaId: d.contentIdeaId },
    },
    reasons: [`Draft idle ${daysSince(d.updatedAt, now)} days with no review or final version.`],
    evidenceLinks: [{ label: 'Draft', ref: `contentDraft:${d.id}` }],
  }));
}

export async function collectCandidates(prisma: PrismaClient, workspaceId: string, now = Date.now()): Promise<Candidate[]> {
  const groups = await Promise.all([
    contentOpportunities(prisma, workspaceId, now),
    contentGaps(prisma, workspaceId),
    trendSignals(prisma, workspaceId),
    contentReviews(prisma, workspaceId, now),
    outreachReviews(prisma, workspaceId, now),
    followUps(prisma, workspaceId),
    preparedActions(prisma, workspaceId),
    learningProposals(prisma, workspaceId, now),
    staleDrafts(prisma, workspaceId, now),
    objectionPatterns(prisma, workspaceId, now),
    prospectRelevance(prisma, workspaceId, now),
  ]);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const candidate of groups.flat()) {
    if (seen.has(candidate.identityKey)) continue;
    seen.add(candidate.identityKey);
    out.push(candidate);
  }
  return out;
}

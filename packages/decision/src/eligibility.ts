import { PrismaClient } from '@prisma/client';
import { computeTopicRelevance, IcpInput } from '@growth-operator/sales';
import { Candidate } from './types';
import { MIN_OBJECTION_SAMPLE, MIN_PROSPECT_RELEVANCE } from './signals';

export interface EligibilityVerdict {
  eligible: boolean;
  reason: string | null;
}

/** Follow-up outcomes that suppress NEW outreach initiation for a lead. */
const OUTREACH_BLOCKING_FOLLOW_UPS = new Set([
  'NO_OUTREACH',
  'DISMISS',
  'CLOSE_OUT',
  'NO_FOLLOW_UP',
]);

const CLOSED_LEAD_STATUSES = new Set(['DISQUALIFIED', 'CLOSED']);

interface LeadProgress {
  status: string;
  closed: boolean;
  latestFollowUp: string | null;
  outreachBlockedBy: string | null;
  hasApprovedStrategy: boolean;
  hasSubmittedReview: boolean;
}

/** Live lead lifecycle read: status, latest follow-up, in-flight strategy/review. */
async function leadProgress(
  prisma: PrismaClient,
  workspaceId: string,
  leadId: string
): Promise<LeadProgress | null> {
  const [lead, latestFollowUpRow, approvedStrategy, submittedReview] = await Promise.all([
    prisma.lead.findFirst({ where: { id: leadId, workspaceId }, select: { status: true } }),
    prisma.followUpRecommendation.findFirst({
      where: { workspaceId, leadId },
      orderBy: { createdAt: 'desc' },
      select: { recommendation: true },
    }),
    prisma.outreachStrategy.findFirst({
      where: { workspaceId, leadId, status: 'APPROVED' },
      select: { id: true },
    }),
    prisma.outreachReview.findFirst({
      where: { workspaceId, status: 'SUBMITTED', draft: { leadId } },
      select: { id: true },
    }),
  ]);
  if (!lead) return null;
  const latestFollowUp = latestFollowUpRow?.recommendation ?? null;
  return {
    status: lead.status,
    closed: CLOSED_LEAD_STATUSES.has(lead.status),
    latestFollowUp,
    outreachBlockedBy: latestFollowUp && OUTREACH_BLOCKING_FOLLOW_UPS.has(latestFollowUp) ? latestFollowUp : null,
    hasApprovedStrategy: !!approvedStrategy,
    hasSubmittedReview: !!submittedReview,
  };
}

/**
 * Re-validates a candidate against live artifact state. Every rule is
 * documented here; a candidate failing any rule stops appearing.
 *
 * - Unknown subjects are ineligible (never ranked on missing data).
 * - Lifecycle states that no longer support action are ineligible.
 * - Unsupported intelligence (e.g. insufficient-history trends) is ineligible.
 */
export async function checkEligibility(
  prisma: PrismaClient,
  workspaceId: string,
  candidate: Candidate
): Promise<EligibilityVerdict> {
  const missing = (what: string): EligibilityVerdict => ({ eligible: false, reason: `${what} no longer exists in this workspace.` });

  switch (candidate.kind) {
    case 'content_opportunity': {
      if (!candidate.subjectId) return missing('Opportunity');
      const row = await prisma.contentOpportunity.findFirst({ where: { id: candidate.subjectId, workspaceId } });
      if (!row) return missing('Opportunity');
      if (row.status !== 'NEW') return { eligible: false, reason: `Opportunity is ${row.status}, no longer new.` };
      return { eligible: true, reason: null };
    }
    case 'content_gap': {
      if (!candidate.subjectId) return missing('Content gap');
      const row = await prisma.contentGap.findFirst({ where: { id: candidate.subjectId, workspaceId } });
      if (!row) return missing('Content gap');
      return { eligible: true, reason: null };
    }
    case 'trend_signal': {
      if (!candidate.subjectId) return missing('Trend signal');
      const row = await prisma.trendSignal.findFirst({ where: { id: candidate.subjectId, workspaceId } });
      if (!row) return missing('Trend signal');
      if (row.status !== 'TRENDING' && row.status !== 'RELEVANT') {
        return { eligible: false, reason: `Trend is ${row.status}; only TRENDING/RELEVANT trends are actionable.` };
      }
      return { eligible: true, reason: null };
    }
    case 'content_review': {
      if (!candidate.subjectId) return missing('Content review');
      const row = await prisma.contentReview.findFirst({ where: { id: candidate.subjectId, workspaceId } });
      if (!row) return missing('Content review');
      if (row.status !== 'SUBMITTED') return { eligible: false, reason: `Review is ${row.status}, no longer awaiting decision.` };
      return { eligible: true, reason: null };
    }
    case 'outreach_review': {
      if (!candidate.subjectId) return missing('Outreach review');
      const row = await prisma.outreachReview.findFirst({ where: { id: candidate.subjectId, workspaceId } });
      if (!row) return missing('Outreach review');
      if (row.status !== 'SUBMITTED') return { eligible: false, reason: `Review is ${row.status}, no longer awaiting decision.` };
      return { eligible: true, reason: null };
    }
    case 'follow_up': {
      if (!candidate.subjectId) return missing('Follow-up recommendation');
      const row = await prisma.followUpRecommendation.findFirst({ where: { id: candidate.subjectId, workspaceId } });
      if (!row) return missing('Follow-up recommendation');
      if (row.recommendation === 'NO_FOLLOW_UP' || row.recommendation === 'CLOSE_OUT') {
        return { eligible: false, reason: `Recommendation ${row.recommendation} requires no operator action.` };
      }
      if (row.leadId) {
        const progress = await leadProgress(prisma, workspaceId, row.leadId);
        if (progress?.closed) {
          return { eligible: false, reason: `Lead is ${progress.status}; follow-up suppressed.` };
        }
      }
      return { eligible: true, reason: null };
    }
    case 'prepared_action': {
      if (!candidate.subjectId) return missing('Prepared action');
      const row = await prisma.preparedAction.findFirst({ where: { id: candidate.subjectId, workspaceId } });
      if (!row) return missing('Prepared action');
      if (row.status !== 'READY_FOR_AUTHORIZED_EXECUTION') {
        return { eligible: false, reason: `Prepared action is ${row.status}, not ready.` };
      }
      if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
        return { eligible: false, reason: 'Prepared action expired.' };
      }
      return { eligible: true, reason: null };
    }
    case 'learning_proposal': {
      if (!candidate.subjectId) return missing('Learning proposal');
      const row = await prisma.learningProposal.findFirst({ where: { id: candidate.subjectId, workspaceId } });
      if (!row) return missing('Learning proposal');
      if (row.status !== 'PROPOSED') return { eligible: false, reason: `Proposal is ${row.status}, no longer awaiting confirmation.` };
      return { eligible: true, reason: null };
    }
    case 'stale_draft': {
      if (!candidate.subjectId) return missing('Draft');
      const row = await prisma.contentDraft.findFirst({
        where: { id: candidate.subjectId, workspaceId },
        include: {
          versions: { where: { isFinal: true }, select: { id: true } },
          reviews: { select: { status: true } },
        },
      });
      if (!row) return missing('Draft');
      const versions = row.versions as Array<{ id: string }>;
      const reviews = row.reviews as Array<{ status: string }>;
      if (versions.length > 0) return { eligible: false, reason: 'Draft has a final version.' };
      if (reviews.some((r) => r.status === 'APPROVED' || r.status === 'SUBMITTED')) {
        return { eligible: false, reason: 'Draft entered review or approval since collection.' };
      }
      return { eligible: true, reason: null };
    }
    case 'objection_pattern': {
      const meta = candidate.facts.subjectMeta as
        | { classificationIds?: unknown; minSampleSize?: unknown }
        | undefined;
      const ids = Array.isArray(meta?.classificationIds)
        ? meta.classificationIds.filter((v): v is string => typeof v === 'string')
        : [];
      const minSample =
        typeof meta?.minSampleSize === 'number' && Number.isFinite(meta.minSampleSize)
          ? Math.max(1, Math.floor(meta.minSampleSize))
          : MIN_OBJECTION_SAMPLE;
      if (ids.length === 0) return missing('Objection pattern');
      const rows = await prisma.conversationClassificationResult.findMany({
        where: { id: { in: ids }, workspaceId, classification: 'OBJECTION' },
        select: { conversationId: true },
      });
      const distinct = new Set(rows.map((r: { conversationId: string }) => r.conversationId));
      if (distinct.size < minSample) {
        return { eligible: false, reason: `Objection pattern no longer meets the minimum sample (${distinct.size} < ${minSample} conversations).` };
      }
      return { eligible: true, reason: null };
    }
    case 'prospect_relevance': {
      const meta = candidate.facts.subjectMeta as { topicId?: unknown } | undefined;
      const topicId = typeof meta?.topicId === 'string' ? meta.topicId : null;
      const leadId = typeof candidate.subjectId === 'string' ? candidate.subjectId : null;
      if (!topicId || !leadId) return missing('Topic relevance');
      const topic = await prisma.topic.findFirst({ where: { id: topicId, workspaceId } });
      if (!topic) return missing('Topic');
      const lead = await prisma.lead.findFirst({ where: { id: leadId, workspaceId } });
      if (!lead) return missing('Prospect');
      const icpRow = await prisma.iCP.findFirst({ where: { workspaceId }, orderBy: { updatedAt: 'desc' } });
      const icp: IcpInput | null = icpRow
        ? {
            id: icpRow.id,
            name: icpRow.name,
            description: icpRow.description,
            targetRoles: icpRow.targetRoles,
            industries: icpRow.industries,
            companySize: icpRow.companySize,
            problems: icpRow.problems,
            exclusions: icpRow.exclusions,
          }
        : null;
      const relevance = await computeTopicRelevance(prisma, workspaceId, { topicId, leadId, icp });
      if (relevance.relevance < MIN_PROSPECT_RELEVANCE) {
        return { eligible: false, reason: `Relevance ${relevance.relevance} is below the ${MIN_PROSPECT_RELEVANCE} floor.` };
      }
      // Lead lifecycle: never initiate outreach work for closed, blocked,
      // or already-progressed leads — and say why.
      const progress = await leadProgress(prisma, workspaceId, leadId);
      if (progress?.closed) {
        return { eligible: false, reason: `Lead is ${progress.status}; outreach initiation suppressed.` };
      }
      if (progress?.outreachBlockedBy) {
        return { eligible: false, reason: `Lead marked ${progress.outreachBlockedBy}; outreach initiation suppressed by human follow-up.` };
      }
      if (progress?.hasApprovedStrategy) {
        return { eligible: false, reason: 'Lead already has an approved outreach strategy; no duplicate work.' };
      }
      if (progress?.hasSubmittedReview) {
        return { eligible: false, reason: 'Lead has an outreach review awaiting decision; no duplicate work.' };
      }
      return { eligible: true, reason: null };
    }
    case 'sales_content_signal': {
      if (!candidate.subjectId) return missing('Sales content signal');
      const row = await prisma.salesContentSignal.findFirst({ where: { id: candidate.subjectId, workspaceId } });
      if (!row) return missing('Sales content signal');
      if (!row.evidence?.trim()) {
        return { eligible: false, reason: 'Sales content signal has no recorded evidence.' };
      }
      return { eligible: true, reason: null };
    }
    case 'comment_signal': {
      if (!candidate.subjectId) return missing('Comment sales signal');
      const row = await prisma.commentSalesSignal.findFirst({
        where: { id: candidate.subjectId, workspaceId },
        include: { comment: { select: { id: true, type: true } } },
      });
      if (!row) return missing('Comment sales signal');
      if (row.status !== 'REVIEWED') {
        return { eligible: false, reason: `Comment signal is ${row.status}; only human-reviewed signals surface.` };
      }
      const comment = row.comment as { id: string; type: string } | null;
      if (!comment) return missing('Comment');
      if (comment.type === 'SPAM') {
        return { eligible: false, reason: 'Comment classified as SPAM; never surfaced.' };
      }
      return { eligible: true, reason: null };
    }
    case 'source_issue': {
      const meta = candidate.facts.subjectMeta as
        | { issueKind?: unknown; feedId?: unknown; sourceType?: unknown }
        | undefined;
      if (meta?.issueKind === 'feed' && typeof meta.feedId === 'string') {
        const row = await prisma.feedSource.findFirst({ where: { id: meta.feedId, workspaceId } });
        if (!row) return missing('Feed source');
        if (!row.lastError) {
          return { eligible: false, reason: 'Feed recovered: no recorded error since collection.' };
        }
        return { eligible: true, reason: null };
      }
      if (meta?.issueKind === 'connector' && typeof meta.sourceType === 'string') {
        const row = await prisma.workspaceConnector.findFirst({
          where: { workspaceId, sourceType: meta.sourceType },
        });
        if (!row) return missing('Connector configuration');
        if (row.lastProbeStatus !== 'FAILED' && row.lastProbeStatus !== 'BLOCKED') {
          return { eligible: false, reason: `Connector probe is now ${row.lastProbeStatus}; the issue cleared.` };
        }
        return { eligible: true, reason: null };
      }
      return missing('Source issue');
    }
    default: {
      const exhaustive: never = candidate.kind;
      return { eligible: false, reason: `Unknown candidate kind: ${String(exhaustive)}.` };
    }
  }
}

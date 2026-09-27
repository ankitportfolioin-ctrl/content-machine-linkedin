import { PrismaClient } from '@prisma/client';
import { Candidate } from './types';

export interface EligibilityVerdict {
  eligible: boolean;
  reason: string | null;
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
    default: {
      const exhaustive: never = candidate.kind;
      return { eligible: false, reason: `Unknown candidate kind: ${String(exhaustive)}.` };
    }
  }
}

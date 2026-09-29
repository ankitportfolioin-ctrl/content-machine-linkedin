import { PrismaClient } from '@prisma/client';
import { Candidate } from './types';
import { attributionLookup, ObjectiveView, readWorkspaceContext, WorkspaceContext } from './workspaceContext';
import { matchObjectives, ObjectiveMatch } from './objectiveFit';

/**
 * Binds live workspace context to collected candidates BEFORE eligibility
 * and scoring, so reasons, confidence, and ranking all derive from the same
 * state the explanation later reconstructs:
 *
 * - objectives → subjectMeta.objectiveMatches + "Supports <LEVEL> objective" reasons
 * - attribution → subjectMeta.attribution (strongest recorded level, never upgraded)
 * - lead lifecycle → subjectMeta.leadState (status, qualification, progress)
 * - cross-machine learning tags → honest learningDimensions so confirmed
 *   learning on relevance/evidence can actually boost these candidates
 *
 * Enrichment never suppresses: suppression with a stated reason belongs to
 * eligibility. Absent context produces honest markers, never invented fit.
 */
export async function enrichCandidates(
  prisma: PrismaClient,
  workspaceId: string,
  candidates: Candidate[],
  now = Date.now()
): Promise<{ candidates: Candidate[]; context: WorkspaceContext }> {
  void now;
  const context = await readWorkspaceContext(prisma, workspaceId);
  return { candidates: candidates.map((c) => enrichOne(c, context)), context };
}

function candidateText(c: Candidate, context: WorkspaceContext): {
  title: string;
  thesis?: string;
  description?: string;
  topicName?: string;
} {
  const meta = (c.facts.subjectMeta ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
  const topicId = str(meta['topicId']);
  return {
    title: c.title,
    thesis: str(meta['thesis']),
    description: str(meta['description']),
    topicName: topicId ? context.topics.get(topicId) : undefined,
  };
}

/** Attribution targets recorded for each candidate kind (KNOWN_ENDPOINTS). */
function attributionTargets(c: Candidate): Array<{ targetType: string; targetId: string }> {
  const meta = (c.facts.subjectMeta ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  switch (c.kind) {
    case 'content_review': {
      const draftId = str(meta['draftId']);
      return draftId ? [{ targetType: 'contentDraft', targetId: draftId }] : [];
    }
    case 'outreach_review': {
      const draftId = str(meta['draftId']);
      return draftId ? [{ targetType: 'outreachDraft', targetId: draftId }] : [];
    }
    case 'follow_up': {
      const out: Array<{ targetType: string; targetId: string }> = [];
      const conversationId = str(meta['conversationId']);
      const leadId = str(meta['leadId']);
      if (conversationId) out.push({ targetType: 'conversation', targetId: conversationId });
      if (leadId) out.push({ targetType: 'lead', targetId: leadId });
      return out;
    }
    case 'prospect_relevance': {
      const leadId = typeof c.subjectId === 'string' ? c.subjectId : null;
      return leadId ? [{ targetType: 'lead', targetId: leadId }] : [];
    }
    case 'prepared_action': {
      // Prepared actions carry their approval linkage in subjectMeta already;
      // only outreach-draft linkage is attribution-addressable.
      const draftId = str(meta['draftId']);
      return draftId ? [{ targetType: 'outreachDraft', targetId: draftId }] : [];
    }
    default:
      return [];
  }
}

/** Candidate kinds whose subject is a lead (lifecycle-aware reasoning). */
function leadIdOf(c: Candidate): string | null {
  const meta = (c.facts.subjectMeta ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  switch (c.kind) {
    case 'prospect_relevance':
      return typeof c.subjectId === 'string' ? c.subjectId : null;
    case 'follow_up':
    case 'outreach_review':
      return str(meta['leadId']);
    default:
      return null;
  }
}

/** Honest learning tags for cross-machine signals (were structurally []). */
function learningTagsFor(c: Candidate): string[] | null {
  switch (c.kind) {
    case 'prospect_relevance':
      // Measured topic-lead fit: confirmed learning on relevance applies.
      return ['relevance'];
    case 'objection_pattern':
      // Recurrence across conversations is evidence strength, nothing more.
      return ['evidence_strength'];
    case 'sales_content_signal':
      return ['relevance'];
    default:
      return null;
  }
}

function enrichOne(c: Candidate, context: WorkspaceContext): Candidate {
  const reasons = [...c.reasons];
  const evidenceLinks = [...c.evidenceLinks];
  const meta = { ...((c.facts.subjectMeta ?? {}) as Record<string, unknown>) };

  // 1. Objectives (Batch 1 data becomes decision input).
  const { matched, configured } = matchObjectives(c.kind, candidateText(c, context), context.objectives);
  const objectiveMatches: ObjectiveMatch[] = matched;
  meta['objectiveMatches'] = objectiveMatches;
  meta['objectivesConfigured'] = configured;
  for (const m of objectiveMatches) {
    reasons.push(
      `Supports ${m.level} objective "${m.goal.slice(0, 120)}" (matched: ${m.terms.join(', ')}).`
    );
  }

  // 2. Attribution (Batch 2 data becomes decision evidence; never upgraded).
  const targets = attributionTargets(c);
  let best: { strongest: string; linkCount: number; reason: string | null; target: string } | null = null;
  let mappedTarget: string | null = null;
  for (const t of targets) {
    mappedTarget = `${t.targetType}:${t.targetId}`;
    const view = attributionLookup(context, t.targetType, t.targetId);
    if (!view) continue;
    if (!best || view.strongest === 'DIRECT' || (view.strongest === 'INFERRED' && best.strongest === 'UNKNOWN')) {
      best = {
        strongest: view.strongest,
        linkCount: view.linkCount,
        reason: view.reason,
        target: mappedTarget,
      };
    }
  }
  if (best) {
    meta['attribution'] = best;
    const label = best.strongest === 'DIRECT' ? 'DIRECT' : best.strongest === 'INFERRED' ? 'INFERRED' : 'UNKNOWN';
    reasons.push(
      `${label} attribution on ${best.target}${best.reason ? `: ${best.reason.slice(0, 160)}` : ` (${best.linkCount} recorded link(s))`}.`
    );
    evidenceLinks.push({ label: `Attribution (${label})`, ref: `attribution:${best.target}` });
  } else if (mappedTarget) {
    meta['attribution'] = { strongest: 'UNKNOWN', linkCount: 0, reason: null, target: mappedTarget };
  }

  // 3. Lead lifecycle (status, qualification, progress).
  const leadId = leadIdOf(c);
  if (leadId) {
    const state = context.leadStates.get(leadId);
    if (state) {
      meta['leadState'] = {
        status: state.status,
        qualificationStatus: state.qualificationStatus,
        hasApprovedStrategy: state.hasApprovedStrategy,
        hasSubmittedReview: state.hasSubmittedReview,
        hasReadyAction: state.hasReadyAction,
        latestFollowUp: state.latestFollowUp,
        outreachBlockedBy: state.outreachBlockedBy,
      };
      reasons.push(`Lead status: ${state.status}${state.qualificationStatus ? `; qualification: ${state.qualificationStatus}` : '; not yet qualified'}.`);
      if (state.hasApprovedStrategy) reasons.push('Lead already has an approved outreach strategy.');
      if (state.hasSubmittedReview) reasons.push('Lead has an outreach review awaiting decision.');
    } else {
      meta['leadState'] = null;
    }
  }

  // 4. Cross-machine learning tags (replaces structural []).
  const tags = learningTagsFor(c);
  const learningDimensions = tags ?? c.facts.learningDimensions ?? [];

  return {
    ...c,
    facts: {
      ...c.facts,
      learningDimensions,
      subjectMeta: meta,
    },
    reasons,
    evidenceLinks,
  };
}

export type { ObjectiveView };

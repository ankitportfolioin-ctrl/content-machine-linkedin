import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { aggregateObjectionPatterns, computeTopicRelevance, IcpInput } from '@growth-operator/sales';
import { Candidate } from './types';

/**
 * Phase 8 cross-machine signal collectors. Both reuse Phase 7 computation
 * verbatim and only shape its outputs into decision candidates. Read-only:
 * nothing here creates content, outreach, or learning artifacts.
 *
 * Documented caps (all deterministic; slices follow stable orderings):
 */
export const MIN_OBJECTION_SAMPLE = 2;
export const MAX_OBJECTION_PATTERNS = 20;
export const MIN_PROSPECT_RELEVANCE = 0.5;
export const MAX_RELEVANCE_TOPICS = 10;
export const MAX_RELEVANCE_LEADS = 10;
export const MAX_RELEVANCE_ACTIONS = 10;
/** Max provenance ids stored per action (full counts always preserved). */
export const MAX_STORED_IDS = 50;

function fingerprint(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 32);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Scoring-dimension mapping for objection candidates (existing framework, no changes):
 * - relevance01 = recurrence (count/5, capped): more conversations, more relevant.
 * - evidenceCount = distinct conversations (each is an evidence reference).
 * - ready = false: acting means manual content work, like content_gap.
 * - urgency: default (no manufactured time pressure).
 * - learningDimensions: [] (no confirmed-learning dimension honestly describes objections).
 */
export async function objectionPatterns(
  prisma: PrismaClient,
  workspaceId: string,
  now: number
): Promise<Candidate[]> {
  const aggregation = await aggregateObjectionPatterns(prisma, workspaceId, MIN_OBJECTION_SAMPLE);
  const patterns = aggregation.patterns.slice(0, MAX_OBJECTION_PATTERNS);
  const out: Candidate[] = [];
  for (const pattern of patterns) {
    const latest = await prisma.conversationClassificationResult.aggregate({
      _max: { createdAt: true },
      where: { id: { in: pattern.classificationIds }, workspaceId, classification: 'OBJECTION' },
    });
    const createdAt = latest._max.createdAt ?? new Date(now);
    const print = fingerprint(pattern.normalizedObjection);
    const quote = pattern.sampleEvidence[0] ?? pattern.normalizedObjection;
    out.push({
      kind: 'objection_pattern',
      identityKey: `objection_pattern:${print}`,
      subjectId: null,
      title: `Address recurring objection across ${pattern.count} conversations`,
      createdAt,
      facts: {
        relevance01: Math.min(1, round2(pattern.count / 5)),
        evidenceCount: pattern.conversationIds.length,
        ready: false,
        learningDimensions: [],
        subjectMeta: {
          normalizedObjection: pattern.normalizedObjection,
          count: pattern.count,
          conversationIds: pattern.conversationIds.slice(0, MAX_STORED_IDS),
          classificationIds: pattern.classificationIds.slice(0, MAX_STORED_IDS),
          minSampleSize: aggregation.minSampleSize,
          sampleEvidence: pattern.sampleEvidence,
        },
      },
      reasons: [
        `Recurring objection across ${pattern.count} recorded conversation(s): "${quote.slice(0, 200)}".`,
        `Supported by ${pattern.classificationIds.length} recorded OBJECTION classification(s); nothing inferred.`,
        'Suggested next step: create a content idea addressing this objection via Content (manual; nothing is created automatically).',
      ],
      evidenceLinks: [
        { label: 'Objection pattern', ref: `objectionPattern:${print}` },
        ...pattern.conversationIds.slice(0, 3).map((cid) => ({ label: 'Conversation', ref: `conversation:${cid}` })),
      ],
    });
  }
  return out;
}

interface TopicRow { id: string; name: string; updatedAt: Date }
interface LeadRow { id: string; name: string; updatedAt: Date }

/**
 * Scoring-dimension mapping for relevance candidates (existing framework, no changes):
 * - relevance01 = the Phase 7 relevance score itself (operator priority is computed
 *   from it by the shared scorer; the two numbers stay distinct in subjectMeta).
 * - evidenceCount = dimensions with a positive signal (0–4).
 * - ready = false: acting means manual prospect review, like content_gap.
 * - urgency: default (recorded fit carries no deadline).
 * - learningDimensions: [] (topic relevance is not a learning influence).
 *
 * Bounded fan-out: at most MAX_RELEVANCE_TOPICS × MAX_RELEVANCE_LEADS pairs are
 * evaluated, and at most MAX_RELEVANCE_ACTIONS actions are emitted, in a
 * deterministic order (relevance desc, topic id, lead id).
 */
export async function prospectRelevance(
  prisma: PrismaClient,
  workspaceId: string,
  now: number
): Promise<Candidate[]> {
  void now;
  const icpRow = await prisma.iCP.findFirst({
    where: { workspaceId },
    orderBy: { updatedAt: 'desc' },
  });
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

  const topics = (await prisma.topic.findMany({
    where: { workspaceId },
    select: { id: true, name: true, updatedAt: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: MAX_RELEVANCE_TOPICS,
  })) as TopicRow[];
  const leads = (await prisma.lead.findMany({
    where: { workspaceId },
    select: { id: true, name: true, updatedAt: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: MAX_RELEVANCE_LEADS,
  })) as LeadRow[];

  const qualified: Array<{ topic: TopicRow; lead: LeadRow; relevance: number; dimensions: Array<{ name: string; score: number; reason: string }> }> = [];
  for (const topic of topics) {
    for (const lead of leads) {
      let computed = null;
      try {
        computed = await computeTopicRelevance(prisma, workspaceId, { topicId: topic.id, leadId: lead.id, icp });
      } catch {
        continue;
      }
      if (computed === null || computed.relevance < MIN_PROSPECT_RELEVANCE) continue;
      qualified.push({
        topic,
        lead,
        relevance: computed.relevance,
        dimensions: computed.dimensions.map((d) => ({ name: d.name, score: d.score, reason: d.reason })),
      });
    }
  }
  qualified.sort(
    (a, b) =>
      b.relevance - a.relevance ||
      a.topic.id.localeCompare(b.topic.id) ||
      a.lead.id.localeCompare(b.lead.id)
  );

  return qualified.slice(0, MAX_RELEVANCE_ACTIONS).map(({ topic, lead, relevance, dimensions }) => {
    const pct = Math.round(relevance * 100);
    const signaling = dimensions.filter((d) => d.score > 0);
    const topReasons = [...dimensions]
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((d) => d.reason);
    return {
      kind: 'prospect_relevance' as const,
      identityKey: `prospect_relevance:${topic.id}:${lead.id}`,
      subjectId: lead.id,
      title: `Review "${topic.name.slice(0, 80)}" fit for ${lead.name.slice(0, 60)} (${pct}%)`,
      createdAt: new Date(Math.max(topic.updatedAt.getTime(), lead.updatedAt.getTime())),
      facts: {
        relevance01: relevance,
        evidenceCount: signaling.length,
        ready: false,
        learningDimensions: [],
        subjectMeta: {
          topicId: topic.id,
          topicName: topic.name,
          leadId: lead.id,
          leadName: lead.name,
          relevance,
          dimensions,
          icpUsed: icp ? { id: icp.id, name: icp.name } : null,
        },
      },
      reasons: [
        `Recorded evidence indicates topic "${topic.name.slice(0, 120)}" is relevant to ${lead.name.slice(0, 80)} (relevance ${pct}%). This is measured fit, not purchase intent.`,
        ...topReasons,
        'Suggested next step: review the prospect in Leads and decide on outreach manually (nothing is sent automatically).',
      ],
      evidenceLinks: [
        { label: 'Topic', ref: `topic:${topic.id}` },
        { label: 'Prospect', ref: `lead:${lead.id}` },
      ],
    };
  });
}

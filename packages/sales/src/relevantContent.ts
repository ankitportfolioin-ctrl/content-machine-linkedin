import { PrismaClient } from '@prisma/client';
import { SalesError } from './errors';
import { IcpInput } from './icp';
import { computeTopicRelevance } from './topicRelevance';

/**
 * Read-only, deterministic suggestions of existing workspace ContentIdeas for a
 * prospect. Reuses computeTopicRelevance verbatim (never duplicates its
 * algorithm) and links ideas to topics through the recorded ContentIdea.topicId
 * only. No scores are invented, no attribution is fabricated, no LLM is called,
 * and nothing is persisted.
 */

/** Same floor as the prospect_relevance operator collector: below this, fit is
 * not recorded evidence of relevance. */
export const MIN_CONTENT_RELEVANCE = 0.5;
/** Same topic fan-out bound as the prospect_relevance collector. */
export const MAX_RELEVANCE_TOPICS = 10;
/** Small deterministic cap: suggestions are a shortlist, never a dump. */
export const MAX_CONTENT_SUGGESTIONS = 5;

export interface RelevantContentSuggestion {
  ideaId: string;
  title: string;
  topicId: string;
  topicName: string;
  relevance: number;
  reason: string;
}

export interface RankableSuggestion extends RelevantContentSuggestion {
  createdAt: Date;
}

/**
 * Deterministic ordering: relevance desc → topicId asc (stable topic grouping)
 * → createdAt desc (newest content first) → ideaId asc (final tie-break).
 * Pure: all inputs are recorded rows/values.
 */
export function rankRelevantContent(
  candidates: RankableSuggestion[]
): RelevantContentSuggestion[] {
  const sorted = [...candidates].sort(
    (a, b) =>
      b.relevance - a.relevance ||
      a.topicId.localeCompare(b.topicId) ||
      b.createdAt.getTime() - a.createdAt.getTime() ||
      a.ideaId.localeCompare(b.ideaId)
  );
  return sorted
    .slice(0, MAX_CONTENT_SUGGESTIONS)
    .map(({ ideaId, title, topicId, topicName, relevance, reason }) => ({
      ideaId,
      title,
      topicId,
      topicName,
      relevance,
      reason,
    }));
}

export async function suggestRelevantContent(
  prisma: PrismaClient,
  workspaceId: string,
  input: { leadId: string }
): Promise<RelevantContentSuggestion[]> {
  const lead = await prisma.lead.findFirst({
    where: { id: input.leadId, workspaceId },
  });
  if (!lead) {
    throw new SalesError('INSUFFICIENT_DATA', 'Lead not found in this workspace.');
  }

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

  const topics = await prisma.topic.findMany({
    where: { workspaceId },
    select: { id: true, name: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: MAX_RELEVANCE_TOPICS,
  });

  const scored: Array<{
    topicId: string;
    topicName: string;
    relevance: number;
    dimensions: Array<{ name: string; score: number; reason: string }>;
  }> = [];
  for (const topic of topics) {
    let computed = null;
    try {
      computed = await computeTopicRelevance(prisma, workspaceId, {
        topicId: topic.id,
        leadId: lead.id,
        icp,
      });
    } catch {
      continue;
    }
    if (computed === null || computed.relevance < MIN_CONTENT_RELEVANCE) continue;
    scored.push({
      topicId: topic.id,
      topicName: topic.name,
      relevance: computed.relevance,
      dimensions: computed.dimensions.map((d) => ({
        name: d.name,
        score: d.score,
        reason: d.reason,
      })),
    });
  }
  if (scored.length === 0) return [];

  const byTopic = new Map(scored.map((s) => [s.topicId, s]));
  const ideas = await prisma.contentIdea.findMany({
    where: { workspaceId, topicId: { in: scored.map((s) => s.topicId) } },
    select: { id: true, title: true, topicId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const pct = (n: number) => Math.round(n * 100);
  const candidates: RankableSuggestion[] = [];
  for (const idea of ideas) {
    // Ideas without a topicId can never match the `in` filter; the guard below
    // keeps that invariant explicit even if the query ever changes.
    if (!idea.topicId) continue;
    const hit = byTopic.get(idea.topicId);
    if (!hit) continue;
    const topReasons = [...hit.dimensions]
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((d) => d.reason);
    candidates.push({
      ideaId: idea.id,
      title: idea.title,
      topicId: hit.topicId,
      topicName: hit.topicName,
      relevance: hit.relevance,
      reason: (
        `Recorded topic "${hit.topicName.slice(0, 120)}" fits ${lead.name.slice(0, 80)} ` +
        `(relevance ${pct(hit.relevance)}%). ${topReasons.join(' ')}`
      ).slice(0, 2000),
      createdAt: idea.createdAt,
    });
  }
  return rankRelevantContent(candidates);
}

import { PrismaClient } from '@prisma/client';
import { resolveIcpMatch, IcpInput, LeadInput } from './icp';

export type RelevanceDimensionName =
  | 'topic_problem_overlap'
  | 'icp_fit'
  | 'role_company_fit'
  | 'research_support';

export interface RelevanceDimension {
  name: RelevanceDimensionName;
  score: number;
  reason: string;
  evidence: string[];
}

export interface TopicRelevance {
  topicId: string;
  leadId: string | null;
  relevance: number;
  dimensions: RelevanceDimension[];
  explanation: string;
}

export interface TopicRelevanceInput {
  topicId: string;
  leadId?: string;
  icp?: IcpInput | null;
}

/** Fixed, documented weights. They never change per-row. */
const WEIGHTS: Record<RelevanceDimensionName, number> = {
  topic_problem_overlap: 0.35,
  icp_fit: 0.3,
  role_company_fit: 0.15,
  research_support: 0.2,
};

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'have', 'has', 'had',
  'will', 'would', 'could', 'should', 'there', 'their', 'about', 'which',
  'when', 'where', 'what', 'who', 'how', 'why', 'your', 'you', 'our', 'are',
]);

function tokens(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w))
  );
}

function overlapScore(topicTokens: Set<string>, other: Set<string>): { score: number; shared: string[] } {
  if (topicTokens.size === 0 || other.size === 0) return { score: 0, shared: [] };
  const shared = [...other].filter((t) => topicTokens.has(t));
  const smaller = Math.min(topicTokens.size, other.size);
  return { score: Math.min(1, shared.length / Math.max(1, smaller)), shared };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Derives topic→prospect relevance from recorded rows only: topic
 * name/description/aliases plus mention contexts, the prospect's recorded
 * Lead fields, the workspace ICP, and the prospect's recorded research
 * facts. Nothing is inferred from popularity, assumed behavior,
 * engagement, intent, or browsing. Read-only: no persistence, no
 * outreach, no qualification changes.
 */
export async function computeTopicRelevance(
  prisma: PrismaClient,
  workspaceId: string,
  input: TopicRelevanceInput
): Promise<TopicRelevance> {
  const topic = await prisma.topic.findFirst({
    where: { id: input.topicId, workspaceId },
    include: { mentions: { select: { context: true }, take: 20 } },
  });
  if (!topic) {
    throw new Error('Topic not found in this workspace.');
  }

  const topicTokens = tokens(
    [topic.name, topic.description ?? '', ...(topic.aliases ?? []),
      ...topic.mentions.map((m: { context: string | null }) => m.context ?? '')].join(' ')
  );

  const lead = input.leadId
    ? await prisma.lead.findFirst({ where: { id: input.leadId, workspaceId } })
    : null;
  if (input.leadId && !lead) {
    throw new Error('Lead not found in this workspace.');
  }

  const leadProfileTokens = tokens(
    lead ? [lead.name, lead.headline ?? '', lead.company ?? '', lead.location ?? ''].join(' ') : ''
  );
  const roleCompanyTokens = tokens(
    lead ? [lead.headline ?? '', lead.company ?? ''].join(' ') : ''
  );

  const dimensions: RelevanceDimension[] = [];

  const problemOverlap = overlapScore(topicTokens, leadProfileTokens);
  dimensions.push({
    name: 'topic_problem_overlap',
    score: lead ? round2(problemOverlap.score) : 0,
    reason: !lead
      ? 'No prospect supplied; overlap cannot be assessed.'
      : problemOverlap.shared.length > 0
        ? `Shared terms between topic evidence and the prospect record: ${problemOverlap.shared.slice(0, 8).join(', ')}.`
        : 'No shared terms between topic evidence and the prospect record.',
    evidence: problemOverlap.shared.slice(0, 8).map((t) => `Shared term: "${t}"`),
  });

  const leadInput: LeadInput | null = lead
    ? { headline: lead.headline, company: lead.company, location: lead.location }
    : null;
  const match = resolveIcpMatch(input.icp ?? null, leadInput);
  dimensions.push({
    name: 'icp_fit',
    score: round2(match.confidence),
    reason: match.fitReasons.length > 0
      ? match.fitReasons.join(' ')
      : match.mismatchReasons.length > 0
        ? match.mismatchReasons.join(' ')
        : 'ICP fit unknown: insufficient ICP or prospect data.',
    evidence: [...match.fitReasons, ...match.mismatchReasons].slice(0, 5),
  });

  const roleOverlap = overlapScore(topicTokens, roleCompanyTokens);
  dimensions.push({
    name: 'role_company_fit',
    score: lead ? round2(roleOverlap.score) : 0,
    reason: !lead
      ? 'No prospect supplied; role/company fit cannot be assessed.'
      : roleOverlap.shared.length > 0
        ? `Prospect role/company shares topic terms: ${roleOverlap.shared.slice(0, 8).join(', ')}.`
        : 'Prospect role/company share no terms with the topic.',
    evidence: roleOverlap.shared.slice(0, 8).map((t) => `Role/company term: "${t}"`),
  });

  let researchScore = 0;
  const researchEvidence: string[] = [];
  if (input.leadId) {
    const researchRows = await prisma.prospectResearch.findMany({
      where: { workspaceId, leadId: input.leadId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const factTexts: string[] = [];
    for (const row of researchRows) {
      const parsed = row.facts as Array<{ statement?: unknown }> | null;
      if (Array.isArray(parsed)) {
        for (const fact of parsed) {
          if (fact && typeof fact.statement === 'string' && fact.statement.trim()) {
            factTexts.push(fact.statement);
          }
        }
      }
      if (row.title) factTexts.push(row.title);
      if (row.company) factTexts.push(row.company);
    }
    if (factTexts.length > 0) {
      const support = overlapScore(topicTokens, tokens(factTexts.join(' ')));
      researchScore = round2(support.score);
      if (support.shared.length > 0) {
        researchEvidence.push(`Recorded research shares topic terms: ${support.shared.slice(0, 8).join(', ')}.`);
      }
    }
  }
  dimensions.push({
    name: 'research_support',
    score: researchScore,
    reason: !input.leadId
      ? 'No prospect supplied; research support cannot be assessed.'
      : researchScore > 0
        ? 'Recorded research evidence overlaps the topic.'
        : 'No recorded research evidence overlaps the topic.',
    evidence: researchEvidence,
  });

  const relevance = round2(
    dimensions.reduce((sum, d) => sum + d.score * WEIGHTS[d.name], 0)
  );

  const parts = dimensions
    .filter((d) => d.reason && !d.reason.startsWith('No '))
    .map((d) => d.reason);
  return {
    topicId: topic.id,
    leadId: input.leadId ?? null,
    relevance,
    dimensions,
    explanation: parts.length > 0
      ? parts.join(' ')
      : 'Insufficient recorded evidence to establish relevance.',
  };
}

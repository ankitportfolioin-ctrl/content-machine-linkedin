import { describe, it, expect, vi } from 'vitest';
import {
  rankRelevantContent,
  suggestRelevantContent,
  MAX_CONTENT_SUGGESTIONS,
  MIN_CONTENT_RELEVANCE,
  RankableSuggestion,
} from '../relevantContent';
import { SalesError } from '../errors';

function sug(overrides: Partial<RankableSuggestion> & { ideaId: string }): RankableSuggestion {
  return {
    title: `Idea ${overrides.ideaId}`,
    topicId: 'topic-1',
    topicName: 'SaaS sales playbook',
    relevance: 0.8,
    reason: 'Recorded fit.',
    createdAt: new Date('2026-09-18T00:00:00Z'),
    ...overrides,
  };
}

describe('rankRelevantContent', () => {
  it('orders by relevance descending', () => {
    const out = rankRelevantContent([
      sug({ ideaId: 'low', relevance: 0.5 }),
      sug({ ideaId: 'high', relevance: 0.9 }),
      sug({ ideaId: 'mid', relevance: 0.7 }),
    ]);
    expect(out.map((s) => s.ideaId)).toEqual(['high', 'mid', 'low']);
  });

  it('breaks ties deterministically by topic, recency, then id', () => {
    const oldDate = new Date('2026-09-10T00:00:00Z');
    const newDate = new Date('2026-09-20T00:00:00Z');
    const out = rankRelevantContent([
      sug({ ideaId: 'b', topicId: 'topic-2', createdAt: newDate }),
      sug({ ideaId: 'a', topicId: 'topic-1', createdAt: oldDate }),
      sug({ ideaId: 'c', topicId: 'topic-1', createdAt: newDate }),
    ]);
    // Same relevance: topic-1 before topic-2; within topic-1 newest first.
    expect(out.map((s) => s.ideaId)).toEqual(['c', 'a', 'b']);
  });

  it('breaks full ties by idea id', () => {
    const at = new Date('2026-09-18T00:00:00Z');
    const out = rankRelevantContent([
      sug({ ideaId: 'idea-2', createdAt: at }),
      sug({ ideaId: 'idea-1', createdAt: at }),
    ]);
    expect(out.map((s) => s.ideaId)).toEqual(['idea-1', 'idea-2']);
  });

  it('caps the list at MAX_CONTENT_SUGGESTIONS', () => {
    expect(MAX_CONTENT_SUGGESTIONS).toBe(5);
    const many = Array.from({ length: 9 }, (_, i) =>
      sug({ ideaId: `idea-${i}`, relevance: 0.9 - i * 0.01 })
    );
    const out = rankRelevantContent(many);
    expect(out).toHaveLength(MAX_CONTENT_SUGGESTIONS);
    expect(out[0]!.ideaId).toBe('idea-0');
  });

  it('returns an honest empty result for no candidates', () => {
    expect(rankRelevantContent([])).toEqual([]);
  });

  it('is deterministic', () => {
    const input = [sug({ ideaId: 'x' }), sug({ ideaId: 'y', relevance: 0.6 })];
    expect(rankRelevantContent(input)).toEqual(rankRelevantContent(input));
  });
});

function stubPrisma(opts: {
  lead?: Record<string, unknown> | null;
  topics?: Array<{ id: string; name: string }>;
  relevanceByTopic?: Record<string, number>;
  ideas?: Array<{ id: string; title: string; topicId: string | null; createdAt: Date }>;
} = {}) {
  const lead = opts.lead === undefined
    ? { id: 'lead-1', name: 'Dana', workspaceId: 'ws-1' }
    : opts.lead;
  const topics = opts.topics ?? [{ id: 'topic-1', name: 'SaaS sales playbook' }];
  const rel = opts.relevanceByTopic ?? { 'topic-1': 0.8 };
  return {
    lead: { findFirst: async () => lead },
    iCP: { findFirst: async () => null },
    topic: { findMany: async () => topics },
    prospectResearch: { findMany: async () => [] },
    contentIdea: { findMany: async () => opts.ideas ?? [] },
  } as never;
}

// Relevance stub mirrors computeTopicRelevance outputs without duplicating it:
// these tests pin the builder's wiring (floor, linkage, echo), not the algorithm.
vi.mock('../topicRelevance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../topicRelevance')>();
  return {
    ...actual,
    computeTopicRelevance: async (_prisma: unknown, _ws: string, input: { topicId: string }) => {
      const table = (globalThis as Record<string, unknown>).__relTable as
        | Record<string, number>
        | undefined;
      const relevance = table?.[input.topicId] ?? 0.8;
      return {
        topicId: input.topicId,
        leadId: 'lead-1',
        relevance,
        dimensions: [
          { name: 'topic_problem_overlap', score: 1, reason: 'Shared terms: saas, sales.', evidence: [] },
        ],
        explanation: 'Recorded overlap.',
      };
    },
  };
});

function setRelTable(table: Record<string, number>) {
  (globalThis as Record<string, unknown>).__relTable = table;
}

describe('suggestRelevantContent', () => {
  it('returns ranked workspace ideas linked through qualifying topics', async () => {
    setRelTable({ 'topic-1': 0.8 });
    const prisma = stubPrisma({
      ideas: [
        { id: 'idea-2', title: 'Second', topicId: 'topic-1', createdAt: new Date('2026-09-19T00:00:00Z') },
        { id: 'idea-1', title: 'First', topicId: 'topic-1', createdAt: new Date('2026-09-18T00:00:00Z') },
      ],
    });
    const out = await suggestRelevantContent(prisma, 'ws-1', { leadId: 'lead-1' });
    expect(out.map((s) => s.ideaId)).toEqual(['idea-2', 'idea-1']);
    expect(out[0]).toMatchObject({ title: 'Second', topicId: 'topic-1', relevance: 0.8 });
    expect(out[0]!.topicName).toBe('SaaS sales playbook');
  });

  it('excludes topics below the relevance floor', async () => {
    setRelTable({ 'topic-1': 0.8, 'topic-2': 0.2 });
    const prisma = stubPrisma({
      topics: [
        { id: 'topic-1', name: 'SaaS sales playbook' },
        { id: 'topic-2', name: 'Medieval poetry' },
      ],
      ideas: [
        { id: 'idea-9', title: 'Poems', topicId: 'topic-2', createdAt: new Date() },
        { id: 'idea-1', title: 'Playbook', topicId: 'topic-1', createdAt: new Date() },
      ],
    });
    const out = await suggestRelevantContent(prisma, 'ws-1', { leadId: 'lead-1' });
    expect(out.map((s) => s.ideaId)).toEqual(['idea-1']);
    expect(MIN_CONTENT_RELEVANCE).toBe(0.5);
  });

  it('excludes ideas without a topicId and returns empty honestly', async () => {
    setRelTable({ 'topic-1': 0.8 });
    const prisma = stubPrisma({
      ideas: [{ id: 'idea-x', title: 'Untagged', topicId: null, createdAt: new Date() }],
    });
    expect(await suggestRelevantContent(prisma, 'ws-1', { leadId: 'lead-1' })).toEqual([]);
  });

  it('returns empty when no topics qualify and never falls back to unrelated content', async () => {
    setRelTable({ 'topic-1': 0.1 });
    const prisma = stubPrisma({
      ideas: [{ id: 'idea-1', title: 'Playbook', topicId: 'topic-1', createdAt: new Date() }],
    });
    expect(await suggestRelevantContent(prisma, 'ws-1', { leadId: 'lead-1' })).toEqual([]);
  });

  it('echoes recorded relevance without fabricating scores', async () => {
    setRelTable({ 'topic-1': 0.66 });
    const prisma = stubPrisma({
      ideas: [{ id: 'idea-1', title: 'Playbook', topicId: 'topic-1', createdAt: new Date() }],
    });
    const out = await suggestRelevantContent(prisma, 'ws-1', { leadId: 'lead-1' });
    expect(out[0]!.relevance).toBe(0.66);
    expect(out[0]!.reason).toContain('66%');
  });

  it('rejects unknown leads without creating anything', async () => {
    const prisma = stubPrisma({ lead: null });
    const err = await suggestRelevantContent(prisma, 'ws-1', { leadId: 'missing' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SalesError);
    expect((err as SalesError).code).toBe('INSUFFICIENT_DATA');
  });
});

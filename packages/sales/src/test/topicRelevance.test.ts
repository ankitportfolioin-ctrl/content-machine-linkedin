import { describe, it, expect } from 'vitest';
import { computeTopicRelevance } from '../topicRelevance';

const topic = {
  id: 'topic-1',
  name: 'AI sales prospecting',
  description: 'Using AI agents for outbound prospecting automation',
  aliases: ['ai prospecting'],
  mentions: [{ context: 'AI prospecting tools for sales teams' }],
};

const lead = {
  id: 'lead-1',
  name: 'Jane Doe',
  headline: 'VP Sales at Acme prospecting software',
  company: 'Acme prospecting software',
  location: 'Berlin',
};

function stubPrisma(overrides: { topic?: typeof topic | null; lead?: typeof lead | null; research?: unknown[] } = {}) {
  return {
    topic: { findFirst: async () => ('topic' in overrides ? overrides.topic : topic) },
    lead: { findFirst: async () => ('lead' in overrides ? overrides.lead : lead) },
    prospectResearch: { findMany: async () => overrides.research ?? [] },
  } as never;
}

describe('Topic relevance', () => {
  it('derives four explained dimensions with a bounded score', async () => {
    const result = await computeTopicRelevance(stubPrisma(), 'ws-1', { topicId: 'topic-1', leadId: 'lead-1' });
    expect(result.dimensions.map((d) => d.name)).toEqual([
      'topic_problem_overlap',
      'icp_fit',
      'role_company_fit',
      'research_support',
    ]);
    expect(result.relevance).toBeGreaterThanOrEqual(0);
    expect(result.relevance).toBeLessThanOrEqual(1);
    expect(result.dimensions.find((d) => d.name === 'topic_problem_overlap')!.score).toBeGreaterThan(0);
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it('reports unknown ICP fit honestly instead of inventing it', async () => {
    const result = await computeTopicRelevance(stubPrisma(), 'ws-1', { topicId: 'topic-1', leadId: 'lead-1', icp: null });
    const icpDim = result.dimensions.find((d) => d.name === 'icp_fit')!;
    expect(icpDim.score).toBe(0);
    expect(icpDim.reason).toMatch(/unknown|insufficient/i);
  });

  it('uses recorded research facts as support evidence', async () => {
    const withResearch = stubPrisma({
      research: [{
        facts: [{ statement: 'Team evaluates AI prospecting automation for outbound.', sourceRef: 'call notes', confidence: 0.8 }],
        title: null,
        company: null,
      }],
    });
    const result = await computeTopicRelevance(withResearch, 'ws-1', { topicId: 'topic-1', leadId: 'lead-1' });
    expect(result.dimensions.find((d) => d.name === 'research_support')!.score).toBeGreaterThan(0);
  });

  it('throws for topics outside the workspace', async () => {
    await expect(computeTopicRelevance(stubPrisma({ topic: null }), 'ws-1', { topicId: 'missing' }))
      .rejects.toThrow('Topic not found');
  });

  it('throws for leads outside the workspace', async () => {
    await expect(computeTopicRelevance(stubPrisma({ lead: null }), 'ws-1', { topicId: 'topic-1', leadId: 'missing' }))
      .rejects.toThrow('Lead not found');
  });
});

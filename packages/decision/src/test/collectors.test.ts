import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { collectCandidates, normalize01 } from '../collectors';

const mockPrisma = {
  contentOpportunity: { findMany: vi.fn().mockResolvedValue([]) },
  contentGap: { findMany: vi.fn().mockResolvedValue([]) },
  trendSignal: { findMany: vi.fn().mockResolvedValue([]) },
  contentReview: { findMany: vi.fn().mockResolvedValue([]) },
  outreachReview: { findMany: vi.fn().mockResolvedValue([]) },
  followUpRecommendation: { findMany: vi.fn().mockResolvedValue([]) },
  preparedAction: { findMany: vi.fn().mockResolvedValue([]) },
  learningProposal: { findMany: vi.fn().mockResolvedValue([]) },
  contentDraft: { findMany: vi.fn().mockResolvedValue([]) },
  conversationClassificationResult: {
    findMany: vi.fn().mockResolvedValue([]),
    aggregate: vi.fn().mockResolvedValue({ _max: { createdAt: null } }),
  },
  iCP: { findFirst: vi.fn().mockResolvedValue(null) },
  topic: { findMany: vi.fn().mockResolvedValue([]) },
  lead: { findMany: vi.fn().mockResolvedValue([]) },
  salesContentSignal: { findMany: vi.fn().mockResolvedValue([]) },
  commentSalesSignal: { findMany: vi.fn().mockResolvedValue([]) },
  opportunityFeedback: { findMany: vi.fn().mockResolvedValue([]) },
  feedSource: { findMany: vi.fn().mockResolvedValue([]) },
  workspaceConnector: { findMany: vi.fn().mockResolvedValue([]) },
} as unknown as PrismaClient;

describe('Candidate collection', () => {
  it('normalizes unknown score scales without inventing values', () => {
    expect(normalize01(0.7)).toBeCloseTo(0.7, 5);
    expect(normalize01(7)).toBeCloseTo(0.7, 5);
    expect(normalize01(70)).toBeCloseTo(0.7, 5);
    expect(normalize01(Number.NaN)).toBe(0);
  });

  it('returns empty honestly for empty workspaces', async () => {
    const candidates = await collectCandidates(mockPrisma, 'workspace-1');
    expect(candidates).toEqual([]);
  });

  it('builds stable identities with evidence', async () => {
    mockPrisma.contentOpportunity.findMany.mockResolvedValueOnce([{
      id: 'opp-1', topicId: 't-1', title: 'Opportunity', thesis: 'Thesis',
      opportunityScore: 8, sourceIds: ['s-1'], claimIds: ['c-1'], status: 'NEW',
      createdAt: new Date('2026-09-01T00:00:00Z'),
    }]);
    const candidates = await collectCandidates(mockPrisma, 'workspace-1');
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.identityKey).toBe('content_opportunity:opp-1');
    expect(candidates[0]?.evidenceLinks.length).toBeGreaterThan(0);
    expect(candidates[0]?.reasons.length).toBeGreaterThan(0);
  });

  it('surfaces failing feeds and failed connector probes as source issues', async () => {
    mockPrisma.feedSource.findMany.mockResolvedValueOnce([{
      id: 'feed-1', url: 'https://example.com/rss', type: 'RSS', name: 'Example',
      lastError: 'Fetch failed: HTTP 500', updatedAt: new Date('2026-10-01T00:00:00Z'),
    }]);
    mockPrisma.workspaceConnector.findMany.mockResolvedValueOnce([{
      sourceType: 'REDDIT', lastProbeStatus: 'FAILED', lastProbeError: 'HTTP 403',
      updatedAt: new Date('2026-10-01T00:00:00Z'),
    }]);
    const candidates = await collectCandidates(mockPrisma, 'workspace-1');
    const issues = candidates.filter((c) => c.kind === 'source_issue');
    expect(issues).toHaveLength(2);
    expect(issues.map((c) => c.identityKey).sort()).toEqual(
      ['source_issue:connector:REDDIT', 'source_issue:feed:feed-1'].sort()
    );
    for (const issue of issues) {
      expect(issue.reasons.length).toBeGreaterThan(0);
      expect(issue.evidenceLinks.length).toBeGreaterThan(0);
    }
  });

  it('stays silent when feeds and probes are healthy', async () => {
    mockPrisma.feedSource.findMany.mockResolvedValueOnce([]);
    mockPrisma.workspaceConnector.findMany.mockResolvedValueOnce([]);
    const candidates = await collectCandidates(mockPrisma, 'workspace-1');
    expect(candidates.filter((c) => c.kind === 'source_issue')).toHaveLength(0);
  });
});

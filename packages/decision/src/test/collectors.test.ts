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
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { checkEligibility } from '../eligibility';
import { Candidate } from '../types';

const mockPrisma = {
  contentOpportunity: { findFirst: vi.fn() },
  contentGap: { findFirst: vi.fn() },
  trendSignal: { findFirst: vi.fn() },
  contentReview: { findFirst: vi.fn() },
  outreachReview: { findFirst: vi.fn() },
  followUpRecommendation: { findFirst: vi.fn() },
  preparedAction: { findFirst: vi.fn() },
  learningProposal: { findFirst: vi.fn() },
  contentDraft: { findFirst: vi.fn() },
} as unknown as PrismaClient;

function candidate(kind: Candidate['kind'], subjectId: string | null): Candidate {
  return {
    kind, identityKey: `${kind}:${subjectId}`, subjectId,
    title: 'Test', createdAt: new Date(), facts: {}, reasons: [], evidenceLinks: [],
  };
}

describe('Eligibility rules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects missing subjects without ranking them', async () => {
    mockPrisma.contentOpportunity.findFirst.mockResolvedValue(null);
    const verdict = await checkEligibility(mockPrisma, 'w', candidate('content_opportunity', 'missing'));
    expect(verdict).toEqual({ eligible: false, reason: expect.stringContaining('no longer exists') });
  });

  it('rejects non-NEW opportunities and stale trends', async () => {
    mockPrisma.contentOpportunity.findFirst.mockResolvedValue({ id: 'o', status: 'CONVERTED' });
    expect((await checkEligibility(mockPrisma, 'w', candidate('content_opportunity', 'o'))).eligible).toBe(false);
    mockPrisma.trendSignal.findFirst.mockResolvedValue({ id: 't', status: 'STALE' });
    expect((await checkEligibility(mockPrisma, 'w', candidate('trend_signal', 't'))).eligible).toBe(false);
    mockPrisma.trendSignal.findFirst.mockResolvedValue({ id: 't', status: 'TRENDING' });
    expect((await checkEligibility(mockPrisma, 'w', candidate('trend_signal', 't'))).eligible).toBe(true);
  });

  it('rejects decided reviews and non-ready prepared actions', async () => {
    mockPrisma.contentReview.findFirst.mockResolvedValue({ id: 'r', status: 'APPROVED' });
    expect((await checkEligibility(mockPrisma, 'w', candidate('content_review', 'r'))).eligible).toBe(false);
    mockPrisma.outreachReview.findFirst.mockResolvedValue({ id: 'r', status: 'SUBMITTED' });
    expect((await checkEligibility(mockPrisma, 'w', candidate('outreach_review', 'r'))).eligible).toBe(true);
    mockPrisma.preparedAction.findFirst.mockResolvedValue({ id: 'a', status: 'REQUIRES_APPROVAL', expiresAt: null });
    expect((await checkEligibility(mockPrisma, 'w', candidate('prepared_action', 'a'))).eligible).toBe(false);
  });

  it('rejects expired prepared actions and decided proposals', async () => {
    mockPrisma.preparedAction.findFirst.mockResolvedValue({
      id: 'a', status: 'READY_FOR_AUTHORIZED_EXECUTION', expiresAt: new Date(Date.now() - 1000),
    });
    expect((await checkEligibility(mockPrisma, 'w', candidate('prepared_action', 'a'))).eligible).toBe(false);
    mockPrisma.learningProposal.findFirst.mockResolvedValue({ id: 'p', status: 'CONFIRMED' });
    expect((await checkEligibility(mockPrisma, 'w', candidate('learning_proposal', 'p'))).eligible).toBe(false);
  });

  it('excludes NO_FOLLOW_UP and finalized drafts', async () => {
    mockPrisma.followUpRecommendation.findFirst.mockResolvedValue({ id: 'f', recommendation: 'NO_FOLLOW_UP' });
    expect((await checkEligibility(mockPrisma, 'w', candidate('follow_up', 'f'))).eligible).toBe(false);
    mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd', versions: [{ id: 'v' }], reviews: [] });
    expect((await checkEligibility(mockPrisma, 'w', candidate('stale_draft', 'd'))).eligible).toBe(false);
  });
});

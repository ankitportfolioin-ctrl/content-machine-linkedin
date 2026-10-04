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
  commentSalesSignal: { findFirst: vi.fn() },
  topic: { findFirst: vi.fn() },
  lead: { findFirst: vi.fn() },
  iCP: { findFirst: vi.fn() },
  outreachStrategy: { findFirst: vi.fn() },
  prospectResearch: { findMany: vi.fn().mockResolvedValue([]) },
  prospectSignal: { findMany: vi.fn().mockResolvedValue([]) },
  feedSource: { findFirst: vi.fn() },
  workspaceConnector: { findFirst: vi.fn() },
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

  it('suppresses outreach initiation for closed, blocked, or progressed leads', async () => {
    const topicRow = {
      id: 'topic-1',
      name: 'SaaS sales playbook',
      description: 'SaaS sales leadership',
      aliases: ['saas sales'],
      mentions: [{ context: 'saas sales leadership pipeline' }],
    };
    const icpRow = {
      id: 'icp-1',
      name: 'Sales leaders',
      description: 'Sales leaders at software companies.',
      targetRoles: ['VP Sales'],
      industries: ['SaaS'],
      companySize: null,
      problems: null,
      exclusions: null,
    };
    const candidate = () => ({
      kind: 'prospect_relevance' as const,
      identityKey: 'prospect_relevance:topic-1:lead-1',
      subjectId: 'lead-1',
      title: 'Test',
      createdAt: new Date(),
      facts: { subjectMeta: { topicId: 'topic-1' } },
      reasons: [],
      evidenceLinks: [],
    });
    const wire = (status: string, followUp: string | null, strategy: unknown, review: unknown) => {
      mockPrisma.topic.findFirst.mockResolvedValue(topicRow);
      mockPrisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        name: 'Dana',
        headline: 'VP Sales at SaaS company',
        company: 'SaaS company',
        location: 'Berlin',
        status,
      });
      mockPrisma.iCP.findFirst.mockResolvedValue(icpRow);
      mockPrisma.followUpRecommendation.findFirst.mockResolvedValue(
        followUp ? { recommendation: followUp } : null
      );
      mockPrisma.outreachStrategy.findFirst.mockResolvedValue(strategy);
      mockPrisma.outreachReview.findFirst.mockResolvedValue(review);
    };
    // Baseline: open lead, no blocks, no progress → relevance floor decides.
    wire('NEW', null, null, null);
    const baseline = await checkEligibility(mockPrisma, 'w', candidate());
    expect(baseline.eligible).toBe(true);

    wire('DISQUALIFIED', null, null, null);
    expect((await checkEligibility(mockPrisma, 'w', candidate())).reason).toMatch(/DISQUALIFIED/);

    wire('NEW', 'NO_OUTREACH', null, null);
    expect((await checkEligibility(mockPrisma, 'w', candidate())).reason).toMatch(/NO_OUTREACH/);

    wire('NEW', null, { id: 'strat-1' }, null);
    expect((await checkEligibility(mockPrisma, 'w', candidate())).reason).toMatch(/approved outreach strategy/);

    wire('NEW', null, null, { id: 'rev-1' });
    expect((await checkEligibility(mockPrisma, 'w', candidate())).reason).toMatch(/awaiting decision/);

    // Non-blocking states leave the candidate eligible.
    wire('NEW', 'FOLLOW_UP_NOW', null, null);
    expect((await checkEligibility(mockPrisma, 'w', candidate())).eligible).toBe(true);
    wire('CONTACTED', null, null, null);
    expect((await checkEligibility(mockPrisma, 'w', candidate())).eligible).toBe(true);
  });

  it('keeps only human-reviewed, non-spam comment signals', async () => {
    const signal = (status: string) => ({
      id: 'cs-1',
      status,
      comment: { id: 'c-1', type: 'CONVERSATION' },
    });
    const commentCandidate = () => ({
      kind: 'comment_signal' as const,
      identityKey: 'comment_signal:cs-1',
      subjectId: 'cs-1',
      title: 'Test',
      createdAt: new Date(),
      facts: {},
      reasons: [],
      evidenceLinks: [],
    });
    mockPrisma.commentSalesSignal.findFirst.mockResolvedValue(signal('PENDING_REVIEW'));
    expect((await checkEligibility(mockPrisma, 'w', commentCandidate())).eligible).toBe(false);
    mockPrisma.commentSalesSignal.findFirst.mockResolvedValue(signal('DISMISSED'));
    expect((await checkEligibility(mockPrisma, 'w', commentCandidate())).eligible).toBe(false);
    mockPrisma.commentSalesSignal.findFirst.mockResolvedValue(signal('REVIEWED'));
    expect((await checkEligibility(mockPrisma, 'w', commentCandidate())).eligible).toBe(true);
    mockPrisma.commentSalesSignal.findFirst.mockResolvedValue({
      id: 'cs-1',
      status: 'REVIEWED',
      comment: { id: 'c-1', type: 'SPAM' },
    });
    expect((await checkEligibility(mockPrisma, 'w', commentCandidate())).eligible).toBe(false);
    mockPrisma.commentSalesSignal.findFirst.mockResolvedValue(null);
    expect((await checkEligibility(mockPrisma, 'w', commentCandidate())).eligible).toBe(false);
  });

  it('excludes NO_FOLLOW_UP and finalized drafts', async () => {
    mockPrisma.followUpRecommendation.findFirst.mockResolvedValue({ id: 'f', recommendation: 'NO_FOLLOW_UP' });
    expect((await checkEligibility(mockPrisma, 'w', candidate('follow_up', 'f'))).eligible).toBe(false);
    mockPrisma.contentDraft.findFirst.mockResolvedValue({ id: 'd', versions: [{ id: 'v' }], reviews: [] });
    expect((await checkEligibility(mockPrisma, 'w', candidate('stale_draft', 'd'))).eligible).toBe(false);
  });

  it('keeps source issues while the failure persists, drops them on recovery', async () => {
    const feedCandidate = () => ({
      kind: 'source_issue' as const,
      identityKey: 'source_issue:feed:feed-1',
      subjectId: 'feed-1',
      title: 'Test',
      createdAt: new Date(),
      facts: { subjectMeta: { issueKind: 'feed', feedId: 'feed-1' } },
      reasons: [],
      evidenceLinks: [],
    });
    mockPrisma.feedSource.findFirst.mockResolvedValue({ id: 'feed-1', lastError: 'HTTP 500' });
    expect((await checkEligibility(mockPrisma, 'w', feedCandidate())).eligible).toBe(true);
    mockPrisma.feedSource.findFirst.mockResolvedValue({ id: 'feed-1', lastError: null });
    const recovered = await checkEligibility(mockPrisma, 'w', feedCandidate());
    expect(recovered.eligible).toBe(false);
    expect(recovered.reason).toMatch(/recovered/i);
    mockPrisma.feedSource.findFirst.mockResolvedValue(null);
    expect((await checkEligibility(mockPrisma, 'w', feedCandidate())).eligible).toBe(false);

    const connectorCandidate = () => ({
      kind: 'source_issue' as const,
      identityKey: 'source_issue:connector:REDDIT',
      subjectId: 'REDDIT',
      title: 'Test',
      createdAt: new Date(),
      facts: { subjectMeta: { issueKind: 'connector', sourceType: 'REDDIT' } },
      reasons: [],
      evidenceLinks: [],
    });
    mockPrisma.workspaceConnector.findFirst.mockResolvedValue({ sourceType: 'REDDIT', lastProbeStatus: 'FAILED' });
    expect((await checkEligibility(mockPrisma, 'w', connectorCandidate())).eligible).toBe(true);
    mockPrisma.workspaceConnector.findFirst.mockResolvedValue({ sourceType: 'REDDIT', lastProbeStatus: 'VERIFIED' });
    const cleared = await checkEligibility(mockPrisma, 'w', connectorCandidate());
    expect(cleared.eligible).toBe(false);
    expect(cleared.reason).toMatch(/cleared/i);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { deriveProposal, validateAdjustment, LearningDerivationService } from '../derivation';

const mockPrisma = {
  outcomeMetric: { count: vi.fn() },
  learningProposal: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
} as unknown as PrismaClient;

describe('Adjustment validation', () => {
  it('rejects unknown dimensions', () => {
    expect(() => validateAdjustment('vibes', 0.05)).toThrow(/Unknown scoring dimension/);
  });

  it('rejects out-of-range and zero weights', () => {
    expect(() => validateAdjustment('timeliness', 0)).toThrow();
    expect(() => validateAdjustment('timeliness', 0.5)).toThrow(/runaway|out of bounds|within/);
    expect(() => validateAdjustment('timeliness', -0.3)).toThrow();
    expect(() => validateAdjustment('timeliness', Number.NaN)).toThrow();
  });

  it('accepts bounded weights', () => {
    expect(() => validateAdjustment('timeliness', 0.08)).not.toThrow();
    expect(() => validateAdjustment('evidence_strength', -0.2)).not.toThrow();
  });
});

describe('Derivation rules', () => {
  const groups = (aCount: number, bCount: number) => ([
    { label: 'text_posts', avg: 8, count: aCount, metricIds: ['m1'] },
    { label: 'framework_posts', avg: 5, count: bCount, metricIds: ['m2'] },
  ]);

  it('derives OBSERVED_PATTERN wording, never causal facts', () => {
    const proposal = deriveProposal({
      dimension: 'evidence_strength',
      groupAverages: groups(5, 5),
      reason: 'Text posts averaged higher responses.',
    })!;
    expect(proposal).not.toBeNull();
    expect(proposal.observedPattern).toMatch(/Observed pattern/);
    expect(proposal.observedPattern).not.toMatch(/always|causes|proves/i);
    expect(proposal.sampleSize).toBe(10);
    expect(proposal.denominator).toBe(10);
  });

  it('returns null for single groups, small samples, and small gaps', () => {
    expect(deriveProposal({
      dimension: 'timeliness',
      groupAverages: [{ label: 'a', avg: 8, count: 5, metricIds: ['m1'] }],
      reason: 'r',
    })).toBeNull();
    expect(deriveProposal({ dimension: 'timeliness', groupAverages: groups(1, 1), reason: 'r' })).toBeNull();
    expect(deriveProposal({
      dimension: 'timeliness',
      groupAverages: [
        { label: 'a', avg: 5.1, count: 5, metricIds: ['m1'] },
        { label: 'b', avg: 5.0, count: 5, metricIds: ['m2'] },
      ],
      reason: 'r',
    })).toBeNull();
  });
});

describe('Proposal lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates proposals with metric verification', async () => {
    mockPrisma.outcomeMetric.count.mockResolvedValue(2);
    mockPrisma.learningProposal.create.mockImplementation(({ data }: never) => Promise.resolve({ id: 'p-1', ...(data as object) }));
    const service = new LearningDerivationService(mockPrisma);
    const proposal = await service.propose({
      workspaceId: 'w', dimension: 'timeliness', observedPattern: 'Pattern observed.',
      supportingMeasurements: {}, sourceMetricIds: ['m1', 'm2'], sampleSize: 2, denominator: 4,
      proposedAdjustment: 0.05, reason: 'Measured gap.',
    }) as { status: string };
    expect(proposal.status).toBe('PROPOSED');
  });

  it('rejects unknown metric references instead of fabricating', async () => {
    mockPrisma.outcomeMetric.count.mockResolvedValue(1);
    const service = new LearningDerivationService(mockPrisma);
    await expect(service.propose({
      workspaceId: 'w', dimension: 'timeliness', observedPattern: 'P.',
      supportingMeasurements: {}, sourceMetricIds: ['m1', 'ghost'], sampleSize: 2,
      proposedAdjustment: 0.05, reason: 'R.',
    })).rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });

  it('enforces role-gated transitions with terminal states', async () => {
    const service = new LearningDerivationService(mockPrisma);
    mockPrisma.learningProposal.findFirst.mockResolvedValue({ id: 'p-1', status: 'PROPOSED' });
    mockPrisma.learningProposal.update.mockImplementation(({ data }: never) => Promise.resolve({ id: 'p-1', ...(data as object) }));

    await expect(service.transition('w', 'p-1', 'confirm', { userId: 'u', role: 'MEMBER' }))
      .rejects.toMatchObject({ code: 'APPROVAL_NOT_ALLOWED' });
    const confirmed = await service.transition('w', 'p-1', 'confirm', { userId: 'u', role: 'OWNER' }) as { status: string };
    expect(confirmed.status).toBe('CONFIRMED');

    mockPrisma.learningProposal.findFirst.mockResolvedValue({ id: 'p-1', status: 'CONFIRMED' });
    await expect(service.transition('w', 'p-1', 'confirm', { userId: 'u', role: 'OWNER' }))
      .rejects.toMatchObject({ code: 'APPROVAL_NOT_ALLOWED' });
    const revoked = await service.transition('w', 'p-1', 'revoke', { userId: 'u', role: 'ADMIN' }) as { status: string };
    expect(revoked.status).toBe('REVOKED');
  });
});

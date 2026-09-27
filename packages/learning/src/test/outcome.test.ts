import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { OutcomeService } from '../outcome';

const mockPrisma = {
  publishRecord: { findFirst: vi.fn() },
  contentVersion: { findFirst: vi.fn() },
  outreachDraft: { findFirst: vi.fn() },
  pipelineOpportunity: { findFirst: vi.fn() },
  outcomeMetric: { create: vi.fn(), findUnique: vi.fn() },
} as unknown as PrismaClient;

const base = {
  metricName: 'responses',
  metricValue: 5,
  source: 'Manual CRM entry',
};

describe('OutcomeService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records valid metrics with provenance', async () => {
    mockPrisma.pipelineOpportunity.findFirst.mockResolvedValue({ id: 'opp-1' });
    mockPrisma.outcomeMetric.create.mockImplementation(({ data }: never) => Promise.resolve({ id: 'm-1', ...(data as object) }));
    const service = new OutcomeService(mockPrisma);
    const metric = await service.recordOutcome('workspace-1', 'user-1', { ...base, pipelineOpportunityId: 'opp-1' }) as { source: string };
    expect(metric.source).toBe('Manual CRM entry');
  });

  it('rejects missing sources', async () => {
    const service = new OutcomeService(mockPrisma);
    await expect(service.recordOutcome('workspace-1', 'user-1', { ...base, source: '', pipelineOpportunityId: 'opp-1' }))
      .rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });

  it('rejects placeholder sources masquerading as data', async () => {
    const service = new OutcomeService(mockPrisma);
    for (const source of ['unknown', 'Unknown', 'n/a', 'TBD', '?']) {
      await expect(service.recordOutcome('workspace-1', 'user-1', { ...base, source, pipelineOpportunityId: 'opp-1' }))
        .rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
    }
  });

  it('rejects invalid values instead of estimating', async () => {
    const service = new OutcomeService(mockPrisma);
    await expect(service.recordOutcome('workspace-1', 'user-1', { ...base, metricValue: Number.NaN, pipelineOpportunityId: 'opp-1' }))
      .rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
    await expect(service.recordOutcome('workspace-1', 'user-1', { ...base, metricValue: Number.POSITIVE_INFINITY, pipelineOpportunityId: 'opp-1' }))
      .rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });

  it('rejects cross-workspace subjects', async () => {
    mockPrisma.pipelineOpportunity.findFirst.mockResolvedValue(null);
    const service = new OutcomeService(mockPrisma);
    await expect(service.recordOutcome('workspace-1', 'user-1', { ...base, pipelineOpportunityId: 'other-ws-opp' }))
      .rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });

  it('returns the existing row for duplicate idempotency keys', async () => {
    mockPrisma.pipelineOpportunity.findFirst.mockResolvedValue({ id: 'opp-1' });
    mockPrisma.outcomeMetric.findUnique.mockResolvedValue({ id: 'existing', metricName: 'responses' });
    mockPrisma.outcomeMetric.create.mockImplementation(() => { throw new Error('should not create'); });
    const service = new OutcomeService(mockPrisma);
    const metric = await service.recordOutcome('workspace-1', 'user-1', { ...base, pipelineOpportunityId: 'opp-1', idempotencyKey: 'key-1' }) as { id: string };
    expect(metric.id).toBe('existing');
  });
});

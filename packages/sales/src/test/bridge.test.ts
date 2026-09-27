import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SalesBridgeService } from '../bridge';

const mockPrisma = {
  conversation: { count: vi.fn() },
  salesContentSignal: { create: vi.fn(), findFirst: vi.fn() },
} as unknown as PrismaClient;

describe('Content-sales bridge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects absolute quantifiers without measured frequency', async () => {
    const service = new SalesBridgeService(mockPrisma);
    await expect(service.createSignal('workspace-1', {
      signalType: 'objection',
      conversationIds: [],
      evidence: 'Most prospects complain about pricing.',
    })).rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });

  it('records measured signals with real conversation references', async () => {
    mockPrisma.conversation.count.mockResolvedValue(2);
    mockPrisma.salesContentSignal.create.mockImplementation(({ data }: never) => Promise.resolve({ id: 'signal-1', ...(data as object) }));
    const service = new SalesBridgeService(mockPrisma);
    const signal = await service.createSignal('workspace-1', {
      signalType: 'objection',
      conversationIds: ['conv-1', 'conv-2'],
      evidence: 'Two conversations raised pricing objections with quotes.',
      recommendedAngle: 'practical',
    }) as { frequency: number };
    expect(signal.frequency).toBe(2);
  });

  it('rejects unknown conversation references instead of fabricating', async () => {
    mockPrisma.conversation.count.mockResolvedValue(0);
    const service = new SalesBridgeService(mockPrisma);
    await expect(service.createSignal('workspace-1', {
      signalType: 'objection',
      conversationIds: ['missing'],
      evidence: 'Something.',
    })).rejects.toMatchObject({ code: 'EVIDENCE_MISSING' });
  });
});

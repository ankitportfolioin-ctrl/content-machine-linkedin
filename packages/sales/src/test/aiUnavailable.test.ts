import { describe, it, expect, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ProspectResearchService } from '../research';
import { BriefService } from '../brief';
import { OutreachComposer } from '../compose';
import { ClassificationService } from '../classify';

function emptyRegistry() {
  return { getAvailable: vi.fn().mockReturnValue([]) } as never;
}

const mockPrisma = {
  prospectResearch: { findFirst: vi.fn() },
  prospectBrief: { findFirst: vi.fn() },
  outreachStrategy: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn() },
  message: { findFirst: vi.fn() },
  conversationClassificationResult: { create: vi.fn().mockImplementation(({ data }: never) => Promise.resolve({ id: 'c-1', ...(data as object) })) },
} as unknown as PrismaClient;

describe('AI-unavailable honesty matrix', () => {
  it('research synthesis returns AI_UNAVAILABLE with zero output', async () => {
    mockPrisma.prospectResearch.findFirst.mockResolvedValue({ id: 'research-1' });
    const service = new ProspectResearchService(mockPrisma, emptyRegistry());
    await expect(service.synthesizeResearch({ workspaceId: 'w', researchId: 'research-1', material: ['x'] }))
      .rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('brief synthesis returns AI_UNAVAILABLE with zero output', async () => {
    mockPrisma.prospectBrief.findFirst.mockResolvedValue({ id: 'brief-1' });
    const service = new BriefService(mockPrisma, emptyRegistry());
    await expect(service.synthesizeBriefContext('w', 'brief-1', ['x'])).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('draft composition returns AI_UNAVAILABLE with zero prose', async () => {
    mockPrisma.outreachStrategy.findFirst.mockResolvedValue({ id: 'strategy-1', status: 'APPROVED' });
    const service = new OutreachComposer(mockPrisma, emptyRegistry());
    await expect(service.composeFromStrategy('w', 'strategy-1', 'FIRST_MESSAGE', 'user-1'))
      .rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });

  it('classification still works deterministically without AI', async () => {
    mockPrisma.conversation.findFirst.mockResolvedValue({ id: 'conv-1' });
    const service = new ClassificationService(mockPrisma, emptyRegistry());
    mockPrisma.message.findFirst.mockResolvedValue(null);
    const viaDirect = await service.classifyConversation('w', 'conv-1', 'Can we schedule a demo next week?');
    expect(viaDirect).toBeDefined();
  });
});
